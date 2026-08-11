import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const cssUrl = new URL("../public/botanica-polish.css", import.meta.url);
const indexUrl = new URL("../public/index.html", import.meta.url);

test("los retoques finales cargan después del tema y de los ajustes de laptop", async () => {
  const index = await readFile(indexUrl, "utf8");
  assert.match(index, /botanica-industrial\.css[\s\S]*botanica-laptop\.css[\s\S]*botanica-polish\.css[\s\S]*home-services-ui\.css/);
});

test("la tarjeta verificada conserva aire inferior y una cuadrícula estable", async () => {
  const css = await readFile(cssUrl, "utf8");
  assert.match(css, /\.botanica-verified-card\s*\{[\s\S]*display:\s*grid/);
  assert.match(css, /grid-template-columns:\s*38px minmax\(0, 1fr\)/);
  assert.match(css, /min-height:\s*118px/);
  assert.match(css, /padding:\s*18px 18px 20px/);
  assert.match(css, /\.botanica-verified-icon\s*\{[\s\S]*float:\s*none/);
  assert.match(css, /grid-row:\s*1 \/ span 2/);
});

test("el botón de soporte comparte color, radio y altura con los CTA", async () => {
  const css = await readFile(cssUrl, "utf8");
  assert.match(css, /\.support-launcher\s*\{[\s\S]*min-height:\s*44px/);
  assert.match(css, /border-radius:\s*8px\s*!important/);
  assert.match(css, /background:\s*#087a55\s*!important/i);
  assert.match(css, /padding:\s*12px 18px\s*!important/);
  assert.match(css, /\.support-launcher:hover\s*\{[\s\S]*background:\s*#006f49\s*!important/i);
});
