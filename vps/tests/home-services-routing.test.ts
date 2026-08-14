import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import test from "node:test";

const bootstrapUrl = new URL("../public/app-bootstrap.js", import.meta.url);
const navUrl = new URL("../public/home-services-nav.js", import.meta.url);
const shellUrl = new URL("../public/site-shell.js", import.meta.url);
const homeServicesUrl = new URL("../public/home-services-ui.js", import.meta.url);
const indexUrl = new URL("../public/index.html", import.meta.url);

test("servicios-hogar pertenece al router dedicado y no al app legacy", async () => {
  const [bootstrap, homeServices] = await Promise.all([
    readFile(bootstrapUrl, "utf8"),
    readFile(homeServicesUrl, "utf8"),
  ]);
  assert.match(bootstrap, /"\/servicios-hogar"/);
  assert.match(homeServices, /HOME_SERVICES_PATH\s*=\s*"\/servicios-hogar"/);
});

test("la ruta de servicios carga navegación dedicada y JavaScript válido", async () => {
  execFileSync(process.execPath, ["--check", fileURLToPath(navUrl)], { stdio: "pipe" });
  const [index, nav, shell] = await Promise.all([
    readFile(indexUrl, "utf8"),
    readFile(navUrl, "utf8"),
    readFile(shellUrl, "utf8"),
  ]);
  assert.match(index, /home-services-nav\.js[\s\S]*home-services-ui\.js/);
  assert.match(nav, /MiConstructorShell/);
  assert.match(nav, /miconstructor:shell-ready/);
  assert.doesNotMatch(nav, /\/api\/v1\/auth\/me/);
  assert.match(shell, /\/api\/v1\/auth\/me/);
  assert.match(shell, /\/para-profesionales/);
  assert.match(shell, /\/panel/);
});
