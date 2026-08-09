import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("el artefacto conserva el título y la marca de desarrollo", async () => {
  const workerSource = await readFile(
    new URL("../dist/server/index.js", import.meta.url),
    "utf8",
  );

  assert.match(workerSource, /title:\s*["']MiConstructor \| Reformas con control["']/);
  assert.match(workerSource, /["']codex-preview["']:\s*["']development["']/);
  assert.match(workerSource, /fetch\(request, env, ctx\)/);
  assert.match(workerSource, /Construir bien empieza por/);
  assert.match(workerSource, /miconstructor-platform\.webp/);
  assert.match(workerSource, /construcción modular conectada digitalmente/);
  assert.match(workerSource, /Gratis hasta entrar/);
  assert.match(workerSource, /Sin comisión final/);
  assert.match(workerSource, /Test de conocimientos obligatorio/);
  assert.match(workerSource, /Profesional añadido a la shortlist/);
  assert.doesNotMatch(workerSource, /PLATAFORMA SAAS PARA REFORMAS/);
  assert.doesNotMatch(workerSource, /2\.400\+ profesionales/i);
});
