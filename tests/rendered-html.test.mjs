import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import test from "node:test";

test("el artefacto conserva el título y la marca de desarrollo", async () => {
  async function readJavaScriptTree(directory) {
    const entries = await readdir(directory, { withFileTypes: true });
    const sources = await Promise.all(entries.map(async (entry) => {
      const url = new URL(`${entry.name}${entry.isDirectory() ? "/" : ""}`, directory);
      if (entry.isDirectory()) return readJavaScriptTree(url);
      return entry.name.endsWith(".js") ? readFile(url, "utf8") : "";
    }));
    return sources.join("\n");
  }

  const workerSource = await readJavaScriptTree(new URL("../dist/", import.meta.url));
  const publicLandingSource = await readFile(
    new URL("../app/components/public-landing.tsx", import.meta.url),
    "utf8",
  );

  assert.match(workerSource, /title:\s*["']MiConstructor \| Reformas con control["']/);
  assert.match(workerSource, /["']codex-preview["']:\s*["']development["']/);
  assert.match(workerSource, /fetch\(request, env, ctx\)/);
  assert.match(workerSource, /Construir bien empieza por/);
  assert.match(workerSource, /miconstructor-platform\.webp/);
  assert.match(workerSource, /construcción modular conectada digitalmente/);
  assert.match(workerSource, /Gratis hasta entrar/);
  assert.match(workerSource, /Cobro único/);
  assert.match(workerSource, /Al ser seleccionado/);
  assert.match(workerSource, /Domiciliación/);
  assert.match(workerSource, /IMMEDIATE_PER_SELECTION/);
  assert.match(workerSource, /flujo de facturación anterior y está desactivado/);
  assert.doesNotMatch(workerSource, /Cierre semanal/);
  assert.doesNotMatch(workerSource, /COBRO DE SELECCIONES[\s\S]{0,120}Semanal/);
  assert.doesNotMatch(publicLandingSource, /3%, 4% o 5%/);
  assert.doesNotMatch(publicLandingSource, /Proyecto superior a 10\.000 €/);
  assert.match(workerSource, /Test de conocimientos obligatorio/);
  assert.match(workerSource, /ESTIMADOR DE PRESUPUESTO/);
  assert.match(workerSource, /Antes y después/);
  assert.match(workerSource, /CONTRATO DIGITAL DE OBRA/);
  assert.match(workerSource, /DIARIO DE OBRA/);
  assert.doesNotMatch(workerSource, /PLATAFORMA SAAS PARA REFORMAS/);
  assert.doesNotMatch(workerSource, /2\.400\+ profesionales/i);
});
