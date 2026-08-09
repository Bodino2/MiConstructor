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
  assert.match(workerSource, /INTERFAZ DEMOSTRATIVA/);
  assert.doesNotMatch(workerSource, /2\.400\+ profesionales/i);
});
