import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import test from "node:test";

const cssUrl = new URL("../public/botanica-industrial.css", import.meta.url);
const baseCssUrl = new URL("../public/styles.css", import.meta.url);
const shellCssUrl = new URL("../public/site-shell.css", import.meta.url);
const shellUrl = new URL("../public/site-shell.js", import.meta.url);
const homeUrl = new URL("../public/botanica-home.js", import.meta.url);
const guideNavUrl = new URL("../public/guide-nav.js", import.meta.url);
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

test("el sistema visual usa el design system compartido con CTA accesible", async () => {
  const [baseCss, css] = await Promise.all([
    readFile(baseCssUrl, "utf8"),
    readFile(cssUrl, "utf8"),
  ]);
  assert.match(baseCss, /--mc-bg:\s*#FFFFFF/i);
  assert.match(baseCss, /--mc-surface:\s*#FFFFFF/i);
  assert.match(baseCss, /--mc-header:\s*#1A1D20/i);
  assert.match(baseCss, /--mc-obsidian:\s*#1A1D20/i);
  assert.match(baseCss, /--mc-action:\s*#008758/i);
  assert.match(css, /--mc-accent:\s*var\(--mc-action\)/i);
  assert.ok(contrast("#008758", "#FFFFFF") >= 4.5);
});

test("cookies permanecen compactas y la configuración avanzada respeta hidden", async () => {
  const [shellCss, shell] = await Promise.all([
    readFile(shellCssUrl, "utf8"),
    readFile(shellUrl, "utf8"),
  ]);
  assert.match(shell, /class="cookie-settings" hidden/);
  assert.match(shell, /querySelector\("\.cookie-settings"\)\.hidden = false/);
  assert.match(shellCss, /\.cookie-banner\{[\s\S]*width:min\(500px,\s*calc\(100vw - 36px\)\)/);
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

test("el directorio público solo expone profesionales realmente verificados y minimiza datos", async () => {
  const source = await readFile(directoryUrl, "utf8");
  assert.match(source, /verification_status = 'APROBADO'/);
  assert.match(source, /account_status = 'ACTIVO'/);
  assert.match(source, /email_verified = true/);
  assert.match(source, /reviews[\s\S]*status = 'PUBLICADA'/);
  assert.doesNotMatch(source, /u\.phone|tax_id/);
  assert.doesNotMatch(source, /\bid:\s*row\./);
  assert.doesNotMatch(source, /displayName:[\s\S]{0,220}(email|phone|taxId)/);
  assert.doesNotMatch(source, /requireAuth|requireRole/);
});

test("el diseño cubre laptop, tablet y móvil sin convertir toda la página en dark mode", async () => {
  const [css, baseCss, shellCss] = await Promise.all([
    readFile(cssUrl, "utf8"),
    readFile(baseCssUrl, "utf8"),
    readFile(shellCssUrl, "utf8"),
  ]);
  assert.match(css, /@media \(max-width: 1120px\)/);
  assert.match(css, /@media \(max-width: 900px\)/);
  assert.match(css, /@media \(max-width: 640px\)/);
  assert.match(baseCss, /\.topbar\s*\{[\s\S]*background:\s*var\(--mc-header\)/);
  assert.match(baseCss, /body\s*\{[\s\S]*background:\s*var\(--mc-bg\)/);
  assert.match(shellCss, /\.site-footer\{[\s\S]*background:var\(--mc-header\)/);
  assert.match(css, /\.botanica-audience-card[\s\S]*background:\s*var\(--mc-surface\)/);
});

test("la navegación completa permanece tras refrescar una sesión autenticada", async () => {
  execFileSync(process.execPath, ["--check", fileURLToPath(guideNavUrl)], { stdio: "pipe" });
  const [nav, shell] = await Promise.all([
    readFile(guideNavUrl, "utf8"),
    readFile(shellUrl, "utf8"),
  ]);

  assert.match(nav, /MiConstructorShell/);
  assert.match(nav, /miconstructor:shell-ready/);
  assert.match(nav, /refreshHeader/);
  assert.match(shell, /\/#como-funciona/);
  assert.match(shell, /\/servicios-hogar/);
  assert.match(shell, /\/para-profesionales/);
  assert.match(shell, /\/guia/);
  assert.match(shell, /\/calculadores/);
  assert.match(shell, /\/opiniones/);
});

test("la portada usa la navegación marketplace solicitada y separa acceso anónimo de cuenta autenticada", async () => {
  const [home, shell, shellCss] = await Promise.all([
    readFile(homeUrl, "utf8"),
    readFile(shellUrl, "utf8"),
    readFile(shellCssUrl, "utf8"),
  ]);

  assert.doesNotMatch(home, /navbar-marketplace/);
  assert.match(shell, /<details class="site-nav-dropdown"><summary>Servicios<\/summary>/);
  assert.match(shell, />Cómo funciona<\/a>/);
  assert.match(shell, /"Guía de precios"/);
  assert.match(shell, /"Calculadoras"/);
  assert.match(shell, /"Opiniones"/);
  assert.match(shell, /"¿Eres profesional\?"/);
  assert.match(shell, />Pedir presupuesto<\/a>/);
  assert.match(shell, /<summary>Mi Cuenta<\/summary>/);
  assert.match(shell, />Mis solicitudes<\/a>/);
  assert.match(shell, /data-site-logout>Salir<\/button>/);
  assert.match(shell, /"Entrar"/);
  assert.match(shellCss, /#main-nav\.site-nav\{[\s\S]*display:flex/);
  assert.match(shellCss, /\.site-nav-cta\{[\s\S]*background:var\(--mc-action\)/);
  assert.match(shellCss, /\.site-account-menu\{/);
});