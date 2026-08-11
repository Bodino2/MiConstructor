import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import test from "node:test";

const uiUrl = new URL("../public/home-services-ui.js", import.meta.url);

async function source() {
  return readFile(uiUrl, "utf8");
}

test("servicios-hogar bloquea renders recursivos provocados por su propio MutationObserver", async () => {
  execFileSync(process.execPath, ["--check", fileURLToPath(uiUrl)], { stdio: "pipe" });
  const js = await source();
  assert.match(js, /let homeServicesRenderPromise = null/);
  assert.match(js, /if \(homeServicesRenderPromise\) return homeServicesRenderPromise/);
  assert.match(js, /&& !homeServicesRenderPromise/);
  assert.match(js, /data-hs-rendering="true"/);
  assert.match(js, /finally \{\s*homeServicesRenderPromise = null/);
});

test("los enlaces directos a jardín y limpieza se desplazan después del render asíncrono", async () => {
  const js = await source();
  assert.match(js, /function scrollHomeServicesHash\(\)/);
  assert.match(js, /document\.getElementById\(targetId\)\?\.scrollIntoView/);
  assert.match(js, /window\.addEventListener\("hashchange", scrollHomeServicesHash\)/);
  assert.match(js, /scrollHomeServicesHash\(\);/);
});
