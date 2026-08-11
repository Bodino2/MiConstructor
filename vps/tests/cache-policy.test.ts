import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const appUrl = new URL("../src/app.ts", import.meta.url);

test("assets sin hash se revalidan para evitar mezclar releases", async () => {
  const source = await readFile(appUrl, "utf8");
  assert.match(source, /express\.static\(publicDir,[\s\S]*etag:\s*true/);
  assert.match(source, /maxAge:\s*0/);
  assert.match(source, /public, max-age=0, must-revalidate/);
  assert.match(source, /response\.setHeader\("cache-control", "no-cache"\)[\s\S]*sendFile/);
  assert.doesNotMatch(source, /maxAge:\s*config\.NODE_ENV\s*===\s*"production"\s*\?\s*"1h"/);
});
