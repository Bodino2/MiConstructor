import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const scriptPath = new URL("../deploy/apply-miconstructor-canonical-www.sh", import.meta.url);
const nginxPath = new URL("../deploy/nginx-miconstructor.conf", import.meta.url);

test("nginx declara root y www para MiConstructor", async () => {
  const nginx = await readFile(nginxPath, "utf8");
  assert.match(nginx, /server_name\s+miconstructor\.es\s+www\.miconstructor\.es;/);
  assert.match(nginx, /proxy_pass http:\/\/127\.0\.0\.1:3200;/);
});

test("el helper canónico redirige www a HTTPS root y valida nginx antes del reload", async () => {
  const script = await readFile(scriptPath, "utf8");
  assert.match(script, /MICONSTRUCTOR_CANONICAL_WWW_BEGIN/);
  assert.match(script, /return 301 https:\/\/miconstructor\.es\$request_uri;/);
  assert.match(script, /nginx -t/);
  assert.match(script, /systemctl reload nginx/);
  assert.match(script, /before-canonical/);
});
