import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import test from "node:test";

const bootstrapUrl = new URL("../public/app-bootstrap.js", import.meta.url);
const indexUrl = new URL("../public/index.html", import.meta.url);

test("las rutas dedicadas no son sobrescrise de routerul legacy", async () => {
  execFileSync(process.execPath, ["--check", fileURLToPath(bootstrapUrl)], { stdio: "pipe" });
  const bootstrap = await readFile(bootstrapUrl, "utf8");
  for (const path of ["/registro", "/registro-cliente", "/para-profesionales", "/registro-profesional", "/servicios-hogar"]) {
    assert.match(bootstrap, new RegExp(path.replaceAll("/", "\\/")));
  }
  assert.match(bootstrap, /!DEDICATED_ROUTE_PATHS\.has\(window\.location\.pathname\)/);
  assert.match(bootstrap, /await import\("\/app\.js"\)/);
});

test("index no carga app.js directamente înainte de rutele dedicate", async () => {
  const index = await readFile(indexUrl, "utf8");
  assert.match(index, /app-bootstrap\.js/);
  assert.match(index, /app-bootstrap\.js[\s\S]*registration-portals\.js/);
  assert.doesNotMatch(index, /<script src="\/app\.js"/);
});
