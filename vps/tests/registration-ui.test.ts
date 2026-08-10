import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const indexPath = new URL("../public/index.html", import.meta.url);
const cssPath = new URL("../public/registration-ui.css", import.meta.url);
const jsPath = new URL("../public/registration-ui.js", import.meta.url);

test("registro carga assets específicos de rol", async () => {
  const index = await readFile(indexPath, "utf8");
  assert.match(index, /registration-ui\.css/);
  assert.match(index, /registration-ui\.js/);
});

test("campos profesionales permanecen ocultos para clientes", async () => {
  const css = await readFile(cssPath, "utf8");
  const js = await readFile(jsPath, "utf8");

  assert.match(css, /#professional-fields\[hidden\]/);
  assert.match(css, /display:\s*none\s*!important/);
  assert.match(js, /role\.value === "profesional"/);
  assert.match(js, /professionalFields\.hidden = !professional/);
  assert.match(js, /field\.disabled = !professional/);
});

test("texto de registro cambia entre cliente y profesional", async () => {
  const js = await readFile(jsPath, "utf8");
  assert.match(js, /Crea una cuenta de cliente/);
  assert.match(js, /evaluación técnica específica/);
  assert.match(js, /context\.textContent = professional \? PROFESSIONAL_HELP : CLIENT_HELP/);
});
