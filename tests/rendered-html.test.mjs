import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import test from "node:test";

async function readJavaScriptTree(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const chunks = await Promise.all(
    entries.map(async (entry) => {
      const url = new URL(`${entry.name}${entry.isDirectory() ? "/" : ""}`, directory);
      if (entry.isDirectory()) return readJavaScriptTree(url);
      return entry.name.endsWith(".js") ? readFile(url, "utf8") : "";
    }),
  );
  return chunks.join("\n");
}

test("el artefacto conserva el título y la marca de desarrollo", async () => {
  const workerSource = await readFile(
    new URL("../dist/server/index.js", import.meta.url),
    "utf8",
  );

  assert.match(workerSource, /title:\s*["']MiConstructor["']/);
  assert.match(workerSource, /["']codex-preview["']:\s*["']development["']/);
  assert.match(workerSource, /fetch\(request, env, ctx\)/);
  assert.match(workerSource, /Tu reforma,/);
  assert.match(workerSource, /Publicar mi proyecto/);

  const builtJavaScript = await readJavaScriptTree(
    new URL("../dist/", import.meta.url),
  );
  assert.match(builtJavaScript, /MODO DEMOSTRACIÓN/);
});
