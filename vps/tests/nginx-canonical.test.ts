import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import test from "node:test";

const execFileAsync = promisify(execFile);
const scriptPath = new URL("../deploy/apply-miconstructor-canonical-www.sh", import.meta.url);
const nginxPath = new URL("../deploy/nginx-miconstructor.conf", import.meta.url);

test("nginx pre-TLS declara root y www para emitir el certificado de ambos nombres", async () => {
  const nginx = await readFile(nginxPath, "utf8");
  assert.match(nginx, /server_name\s+miconstructor\.es\s+www\.miconstructor\.es;/);
  assert.match(nginx, /proxy_pass http:\/\/127\.0\.0\.1:3200;/);
});

test("el helper convierte una configuración Certbot realista en virtual hosts www dedicados", async () => {
  const directory = await mkdtemp(join(tmpdir(), "miconstructor-nginx-canonical-"));
  const config = join(directory, "miconstructor.conf");
  const fixture = `limit_req_zone $binary_remote_addr zone=miconstructor_api:10m rate=20r/s;

server {
    listen 80;
    listen [::]:80;
    server_name miconstructor.es www.miconstructor.es;

    # MICONSTRUCTOR_CANONICAL_WWW_BEGIN
    if ($host = www.miconstructor.es) {
        return 301 https://miconstructor.es$request_uri;
    }
    # MICONSTRUCTOR_CANONICAL_WWW_END

    if ($host = miconstructor.es) {
        return 301 https://$host$request_uri;
    }
    return 404;
}

server {
    server_name miconstructor.es www.miconstructor.es;
    listen 443 ssl;
    listen [::]:443 ssl;
    ssl_certificate /etc/letsencrypt/live/miconstructor.es/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/miconstructor.es/privkey.pem;
    include /etc/letsencrypt/options-ssl-nginx.conf;
    ssl_dhparam /etc/letsencrypt/ssl-dhparams.pem;

    # MICONSTRUCTOR_CANONICAL_WWW_BEGIN
    if ($host = www.miconstructor.es) {
        return 301 https://miconstructor.es$request_uri;
    }
    # MICONSTRUCTOR_CANONICAL_WWW_END

    location / {
        proxy_pass http://127.0.0.1:3200;
    }
}
`;

  try {
    await writeFile(config, fixture, "utf8");
    await execFileAsync("bash", [fileURLToPath(scriptPath), config], {
      env: { ...process.env, NGINX_BIN: "true", SYSTEMCTL_BIN: "true" },
    });

    const transformed = await readFile(config, "utf8");
    assert.doesNotMatch(transformed, /MICONSTRUCTOR_CANONICAL_WWW_BEGIN/);
    assert.equal((transformed.match(/server_name miconstructor\.es;/g) ?? []).length, 2);
    assert.equal((transformed.match(/server_name www\.miconstructor\.es;/g) ?? []).length, 2);
    assert.equal((transformed.match(/return 301 https:\/\/miconstructor\.es\$request_uri;/g) ?? []).length, 2);
    assert.match(transformed, /listen 80;[\s\S]*server_name www\.miconstructor\.es;[\s\S]*return 301/);
    assert.match(transformed, /listen 443 ssl;[\s\S]*server_name www\.miconstructor\.es;[\s\S]*ssl_certificate \/etc\/letsencrypt\/live\/miconstructor\.es\/fullchain\.pem;/);
    assert.match(transformed, /proxy_pass http:\/\/127\.0\.0\.1:3200;/);
    assert.match(transformed, /MICONSTRUCTOR_CANONICAL_WWW_SERVER_BEGIN/);

    // Second run must be safe and leave the dedicated blocks intact.
    await execFileAsync("bash", [fileURLToPath(scriptPath), config], {
      env: { ...process.env, NGINX_BIN: "true", SYSTEMCTL_BIN: "true" },
    });
    const second = await readFile(config, "utf8");
    assert.equal(second, transformed);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
