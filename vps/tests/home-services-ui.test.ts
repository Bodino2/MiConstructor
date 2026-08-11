import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import test from "node:test";

const scriptUrl = new URL("../public/home-services-ui.js", import.meta.url);
const cssUrl = new URL("../public/home-services-ui.css", import.meta.url);
const indexUrl = new URL("../public/index.html", import.meta.url);
const appUrl = new URL("../src/app.ts", import.meta.url);

async function script() { return readFile(scriptUrl, "utf8"); }

test("el flujo web de limpieza y jardín carga, compila y soporta deep-link", async () => {
  execFileSync(process.execPath, ["--check", fileURLToPath(scriptUrl)], { stdio: "pipe" });
  const [index, app] = await Promise.all([readFile(indexUrl, "utf8"), readFile(appUrl, "utf8")]);
  assert.match(index, /home-services-ui\.css/);
  assert.match(index, /home-services-ui\.js/);
  assert.match(app, /"\/servicios-hogar"/);
});

test("el cliente puede publicar, ver ofertas, aceptar y gestionar recurrencia desde UI", async () => {
  const source = await script();
  assert.match(source, /id="hs-request-form"/);
  assert.match(source, /\/api\/v1\/home-services\/requests/);
  assert.match(source, /data-hs-offers/);
  assert.match(source, /data-hs-accept/);
  assert.match(source, /data-hs-pause/);
  assert.match(source, /data-hs-resume/);
  assert.match(source, /data-hs-cancel/);
  assert.match(source, /PUNTUAL/);
  assert.match(source, /SEMANAL/);
  assert.match(source, /CADA_2_SEMANAS/);
  assert.match(source, /MENSUAL/);
});

test("el profesional puede añadir especialidad, ofertar y ejecutar visitas", async () => {
  const source = await script();
  assert.match(source, /limpieza_profesional/);
  assert.match(source, /jardineria/);
  assert.match(source, /\/api\/v1\/assessments\//);
  assert.match(source, /data-hs-offer-form/);
  assert.match(source, /data-hs-start/);
  assert.match(source, /data-hs-complete/);
  assert.match(source, /Evaluación/);
});

test("la UI no usa prompts bloqueantes ni expone campos privados", async () => {
  const source = await script();
  assert.doesNotMatch(source, /\bprompt\s*\(/);
  assert.doesNotMatch(source, /professional\.email|professional\.phone|tax_id/);
  assert.match(source, /hsEscape\(/);
  assert.match(source, /CSS\.escape\(/);
});

test("formularios restringen fechas, importes, duración y frecuencia", async () => {
  const source = await script();
  assert.match(source, /min="1" max="500000" step="0\.01"/);
  assert.match(source, /min="30" max="1440"/);
  assert.match(source, /type="date" min="\$\{hsTodayMadrid\(\)\}"/);
  assert.match(source, /service\.recurrence\.map/);
});

test("layout de servicios es responsive y mantiene superficies claras", async () => {
  const css = await readFile(cssUrl, "utf8");
  assert.match(css, /\.hs-public-catalog/);
  assert.match(css, /\.hs-engagement-actions/);
  assert.match(css, /@media\(max-width:900px\)/);
  assert.match(css, /@media\(max-width:640px\)/);
  assert.match(css, /background:#fff/);
});
