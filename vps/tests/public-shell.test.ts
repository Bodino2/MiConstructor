import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const cssUrl = new URL("../public/site-shell.css", import.meta.url);
const shellUrl = new URL("../public/site-shell.js", import.meta.url);
const authUrl = new URL("../src/services/auth.ts", import.meta.url);

function relativeLuminance(hex: string) {
  const rgb = hex.replace("#", "").match(/.{2}/g)!.map((part) => Number.parseInt(part, 16) / 255);
  const linear = rgb.map((value) => value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
  return 0.2126 * linear[0]! + 0.7152 * linear[1]! + 0.0722 * linear[2]!;
}

function contrastRatio(first: string, second: string) {
  const a = relativeLuminance(first);
  const b = relativeLuminance(second);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

test("el gestor de cookies permanece compacto hasta abrir Configurar", async () => {
  const css = await readFile(cssUrl, "utf8");
  assert.match(css, /\.cookie-banner\{[^}]*max-width:820px/);
  assert.match(css, /\.cookie-settings\[hidden\]\{display:none\}/);
  assert.match(css, /body:has\(#cookie-banner\) \.support-launcher\{[^}]*pointer-events:none/);
});

test("el color CTA conserva identidad naranja y contraste AA sobre blanco", async () => {
  const css = await readFile(cssUrl, "utf8");
  const match = css.match(/--orange:(#[0-9a-fA-F]{6})/);
  assert.ok(match?.[1]);
  assert.ok(contrastRatio(match[1], "#ffffff") >= 4.5);
});

test("la política de cookies coincide con la sesión real de producción", async () => {
  const [shell, auth] = await Promise.all([
    readFile(shellUrl, "utf8"),
    readFile(authUrl, "utf8"),
  ]);
  assert.match(shell, /__Host-miconstructor_session/);
  assert.match(shell, /duración máxima es de 30 días/);
  assert.match(shell, /No se cargan actualmente herramientas analíticas o publicitarias/);
  assert.match(auth, /"__Host-miconstructor_session"/);
  assert.match(auth, /httpOnly: true/);
  assert.match(auth, /secure: config\.NODE_ENV === "production"/);
  assert.match(auth, /maxAge: 30 \* 24 \* 60 \* 60 \* 1000/);
});
