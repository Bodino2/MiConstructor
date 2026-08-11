import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import test from "node:test";

const scriptUrl = new URL("../public/registration-portals.js", import.meta.url);
const cssUrl = new URL("../public/registration-portals.css", import.meta.url);
const indexUrl = new URL("../public/index.html", import.meta.url);
const appUrl = new URL("../src/app.ts", import.meta.url);

async function source() {
  return readFile(scriptUrl, "utf8");
}

test("el portal de registro es JavaScript válido y se carga desde index", async () => {
  execFileSync(process.execPath, ["--check", fileURLToPath(scriptUrl)], { stdio: "pipe" });
  const index = await readFile(indexUrl, "utf8");
  assert.match(index, /registration-portals\.css/);
  assert.match(index, /registration-portals\.js/);
});

test("clientes y profesionales tienen entradas y rutas separadas", async () => {
  const js = await source();
  assert.match(js, /"\/registro-cliente"/);
  assert.match(js, /"\/para-profesionales"/);
  assert.match(js, /"\/registro-profesional"/);
  assert.match(js, />Para profesionales</);
  assert.match(js, />Crear cuenta</);
  assert.doesNotMatch(js, /Tipo de cuenta<select/);
});

test("las rutas separadas funcionan también con acceso directo o refresh", async () => {
  const app = await readFile(appUrl, "utf8");
  assert.match(app, /"\/registro-cliente"/);
  assert.match(app, /"\/para-profesionales"/);
  assert.match(app, /"\/registro-profesional"/);
});

test("el alta de cliente fija el rol y no pide campos profesionales", async () => {
  const js = await source();
  const clientStart = js.indexOf("function clientRegistration()");
  const clientEnd = js.indexOf("function professionalLanding()", clientStart);
  assert.ok(clientStart >= 0 && clientEnd > clientStart);
  const client = js.slice(clientStart, clientEnd);
  assert.match(client, /name="role" value="cliente"/);
  assert.match(client, /<h2>Crea tu cuenta<\/h2>/);
  assert.match(client, /NIF \/ NIE/);
  assert.doesNotMatch(client, /companyName/);
  assert.doesNotMatch(client, /specialty/);
  assert.doesNotMatch(client, /assessment_/);
});

test("el alta profesional fija el rol e incluye empresa, oficio y test técnico", async () => {
  const js = await source();
  const start = js.indexOf("async function professionalRegistration()");
  const end = js.indexOf("async function renderPortalRoute()", start);
  assert.ok(start >= 0 && end > start);
  const professional = js.slice(start, end);
  assert.match(professional, /name="role" value="profesional"/);
  assert.match(professional, /Crea tu cuenta profesional/);
  assert.match(professional, /name="companyName"/);
  assert.match(professional, /name="phone"/);
  assert.match(professional, /name="specialty"/);
  assert.match(professional, /professional-assessment-slot/);
  assert.match(professional, /assessment\.questions/);
  assert.match(professional, /\/api\/v1\/assessments\//);
});

test("la página Para profesionales explica el flujo antes de crear la cuenta", async () => {
  const js = await source();
  const start = js.indexOf("function professionalLanding()");
  const end = js.indexOf("function assessmentHtml", start);
  const landing = js.slice(start, end);
  assert.match(landing, /PARA PROFESIONALES/);
  assert.match(landing, /Más proyectos\. Menos tiempo buscando clientes\./);
  assert.match(landing, /Crear cuenta profesional/);
  assert.match(landing, /Supera el test técnico/);
});

test("los portales tienen layout responsive dedicado", async () => {
  const css = await readFile(cssUrl, "utf8");
  assert.match(css, /\.portal-choice-grid/);
  assert.match(css, /\.professional-portal-hero/);
  assert.match(css, /\.professional-benefits/);
  assert.match(css, /@media \(max-width: 900px\)/);
});
