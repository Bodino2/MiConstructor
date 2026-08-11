import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const cssUrl = new URL("../public/botanica-laptop.css", import.meta.url);
const indexUrl = new URL("../public/index.html", import.meta.url);

test("la portada carga los ajustes de laptop después del tema Botanica", async () => {
  const index = await readFile(indexUrl, "utf8");
  assert.match(index, /botanica-industrial\.css[\s\S]*botanica-laptop\.css[\s\S]*home-services-ui\.css/);
});

test("el hero mantiene una escala elegante entre 1024 y 1700 px", async () => {
  const css = await readFile(cssUrl, "utf8");
  assert.match(css, /@media \(min-width:\s*1024px\) and \(max-width:\s*1700px\)/);
  assert.match(css, /\.botanica-hero-copy h1[\s\S]*font-size:\s*clamp\(2\.8rem,\s*3\.2vw,\s*3\.2rem\)/);
  assert.match(css, /\.botanica-hero-copy h1[\s\S]*font-weight:\s*600/);
  assert.match(css, /\.botanica-hero-copy h1[\s\S]*line-height:\s*1\.1/);
  assert.match(css, /\.botanica-hero-copy h1[\s\S]*letter-spacing:\s*-?\.03em/);
});

test("subtitlul și CTA-urile folosesc valorile aprobate pentru laptop", async () => {
  const css = await readFile(cssUrl, "utf8");
  assert.match(css, /\.botanica-hero-copy \.lead[\s\S]*font-size:\s*1\.05rem/);
  assert.match(css, /\.botanica-hero-copy \.lead[\s\S]*line-height:\s*1\.55/);
  assert.match(css, /\.botanica-hero-copy \.lead[\s\S]*color:\s*#5f6872/i);
  assert.match(css, /\.botanica-hero-actions \.button[\s\S]*padding:\s*12px 22px/);
  assert.match(css, /\.botanica-hero-actions \.button[\s\S]*border-radius:\s*8px/);
  assert.match(css, /\.botanica-hero-actions \.button\.primary[\s\S]*background-color:\s*#087a55/i);
});
