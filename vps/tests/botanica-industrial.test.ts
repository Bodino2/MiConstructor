import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import test from "node:test";

const cssUrl = new URL("../public/botanica-industrial.css", import.meta.url);
const homeUrl = new URL("../public/botanica-home.js", import.meta.url);
const indexUrl = new URL("../public/index.html", import.meta.url);
const directoryUrl = new URL("../src/routes/public-directory.ts", import.meta.url);

function contrast(hexA: string, hexB: string) {
  const luminance = (hex: string) => {
    const channels = hex.replace("#", "").match(/.{2}/g)!.map((value) => parseInt(value, 16) / 255)
      .map((value) => value <= .03928 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4);
    return channels[0]! * .2126 + channels[1]! * .7152 + channels[2]! * .0722;
  };
  const [bright, dark] = [luminance(hexA), luminance(hexB)].sort((a, b) => b - a);
  return (bright! + .05) / (dark! + .05);
}

test("Botanica Industrial y servicios del hogar se cargan al final del shell", async () => {
  execFileSync(process.execPath, ["--check", fileURLToPath(homeUrl)], { stdio: "pipe" });
  const index = await readFile(indexUrl, "utf8");
  assert.match(index, /site-shell\.css[\s\S]*botanica-industrial\.css[\s\S]*home-services-ui\.css/);
  assert.match(index, /registration-portals\.js[\s\S]*botanica-home\.js[\s\S]*home-services-ui\.js/);
  assert.match(index, /MiConstructor \| Reformas y cuidado del hogar/);
});

test("el sistema visual usa Obsidian, hormigón y Malachite con CTA accesible", async () => {
  const css = await readFile(cssUrl, "utf8");
  assert.match(css, /--mc-bg:\s*#EAEAEA/i);
  assert.match(css, /--mc-surface:\s*#FFFFFF/i);
  assert.match(css, /--mc-obsidian:\s*#1A1D20/i);
  assert.match(css, /--mc-accent:\s*#00A36C/i);
  assert.match(css, /--mc-action:\s*#008758/i);
  assert.ok(contrast("#008758", "#FFFFFF") >= 4.5);
});

test("cookies permanecen compactas y la configuración avanzada respeta hidden", async () => {
  const css = await readFile(cssUrl, "utf8");
  assert.match(css, /\.cookie-settings\[hidden\]\s*\{\s*display:\s*none\s*!important/);
  assert.match(css, /max-width:\s*500px\s*!important/);
  assert.match(css, /max-height:\s*68vh/);
});

test("la portada separa usuarios, expone las tres verticales y no inventa métricas", async () => {
  const home = await readFile(homeUrl, "utf8");
  assert.match(home, /Para clientes/);
  assert.match(home, /Para profesionales/);
  assert.match(home, /Reformas y construcción/);
  assert.match(home, /Limpieza y mantenimiento/);
  assert.match(home, /Jardín y exterior/);
  assert.match(home, /\/servicios-hogar/);
  assert.match(home, /Cómo funciona/);
  assert.match(home, /Profesionales verificados/);
  assert.match(home, /\/api\/v1\/public\/professionals\?limit=5/);
  assert.doesNotMatch(home, /\+25\.000|\+80\.000|\+65\.000|100% Pagos/);
});

test("el directorio público solo expone profesionales aprobados y no publica contacto privado", async () => {
  const source = await readFile(directoryUrl, "utf8");
  assert.match(source, /verification_status = 'APROBADO'/);
  assert.match(source, /account_status = 'ACTIVO'/);
  assert.match(source, /reviews[\s\S]*status = 'PUBLICADA'/);
  assert.doesNotMatch(source, /u\.email|u\.phone|tax_id/);
  assert.doesNotMatch(source, /requireAuth|requireRole/);
});

test("el diseño cubre laptop, tablet y móvil sin convertir toda la página en dark mode", async () => {
  const css = await readFile(cssUrl, "utf8");
  assert.match(css, /@media \(max-width: 1120px\)/);
  assert.match(css, /@media \(max-width: 900px\)/);
  assert.match(css, /@media \(max-width: 640px\)/);
  assert.match(css, /\.topbar[\s\S]*background:\s*rgba\(26, 29, 32/);
  assert.match(css, /\.site-footer[\s\S]*background:\s*var\(--mc-obsidian\)/);
  assert.match(css, /\.botanica-audience-card[\s\S]*background:\s*var\(--mc-surface\)/);
});
