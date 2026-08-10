import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("nginx sirve MiConstructor en dominio raíz y www", async () => {
  const config = await readFile(new URL("../deploy/nginx-miconstructor.conf", import.meta.url), "utf8");
  assert.match(config, /server_name\s+miconstructor\.es\s+www\.miconstructor\.es;/);
  assert.match(config, /proxy_pass\s+http:\/\/127\.0\.0\.1:3200;/);
});
