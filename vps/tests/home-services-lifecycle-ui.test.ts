import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import test from "node:test";

const scriptUrl = new URL("../public/home-services-lifecycle-ui.js", import.meta.url);
const indexUrl = new URL("../public/index.html", import.meta.url);
const routeUrl = new URL("../src/routes/home-services-lifecycle.ts", import.meta.url);

test("el módulo lifecycle es JavaScript válido y carga después del flujo principal", async () => {
  execFileSync(process.execPath, ["--check", fileURLToPath(scriptUrl)], { stdio: "pipe" });
  const index = await readFile(indexUrl, "utf8");
  assert.match(index, /home-services-ui\.js[\s\S]*home-services-lifecycle-ui\.js/);
});

test("cliente puede retirar solicitud y profesional retirar oferta desde UI", async () => {
  const source = await readFile(scriptUrl, "utf8");
  assert.match(source, /cancel\.dataset\.hslCancelRequest/);
  assert.match(source, /\/home-services\/requests\/\$\{[\s\S]*\/cancel/);
  assert.match(source, /\/home-services\/my-offers/);
  assert.match(source, /data-hsl-withdraw-offer/);
  assert.match(source, /\/home-services\/offers\/\$\{[\s\S]*\/withdraw/);
});

test("lifecycle backend limita mutaciones al propietario de solicitud u oferta", async () => {
  const source = await readFile(routeUrl, "utf8");
  assert.match(source, /requireRole\("cliente"\)/);
  assert.match(source, /client_id=\$2 FOR UPDATE/);
  assert.match(source, /requireRole\("profesional"\)/);
  assert.match(source, /o\.professional_id=\$2/);
  assert.match(source, /o\.status='ENVIADA'/);
  assert.match(source, /r\.status='PUBLICADO'/);
});
