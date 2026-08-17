import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import express from "express";
import request from "supertest";
import { calculatorQualityFactors, calculatorsData } from "../src/config/calculatorsData.js";
import { calculatorPagesRouter } from "../src/routes/calculator-pages.js";

const config = { APP_URL: "https://miconstructor.es" } as const;

function testApp() {
  const app = express();
  app.use(calculatorPagesRouter(config));
  return app;
}

test("calculator configuration is local, complete and internally consistent", () => {
  assert.ok(calculatorsData.length >= 15);
  const slugs = new Set<string>();
  for (const calculator of calculatorsData) {
    assert.match(calculator.slug, /^[a-z0-9]+(?:-[a-z0-9]+)*$/);
    assert.ok(calculator.title.length > 5);
    assert.ok(calculator.description.length > 20);
    assert.ok(calculator.pricePerM2Min > 0);
    assert.ok(calculator.pricePerM2Max >= calculator.pricePerM2Min);
    assert.ok(calculator.unitLabel === "m²" || calculator.unitLabel === "unidades");
    assert.equal(slugs.has(calculator.slug), false, `slug duplicado: ${calculator.slug}`);
    slugs.add(calculator.slug);
  }
  assert.deepEqual(calculatorQualityFactors, { basica: 0.85, media: 1, premium: 1.25 });
});

test("GET /calculadores renders an index with every configured calculator", async () => {
  const response = await request(testApp()).get("/calculadores").expect(200).expect("content-type", /html/);
  assert.match(response.text, /<link rel="canonical" href="https:\/\/miconstructor\.es\/calculadores"/);
  for (const calculator of calculatorsData) {
    assert.match(response.text, new RegExp(`href="/calculadora/${calculator.slug}"`));
  }
});

test("GET /calculadora/:servicio renders one reusable synchronous calculator", async () => {
  const response = await request(testApp()).get("/calculadora/cocina").expect(200).expect("content-type", /html/);
  assert.match(response.text, /Calculadora de reforma de cocina/);
  assert.match(response.text, /data-programmatic-calculator/);
  assert.match(response.text, /data-price-min="550"/);
  assert.match(response.text, /data-price-max="1100"/);
  assert.match(response.text, /data-calculator-quantity/);
  assert.match(response.text, /data-calculator-quality/);
  assert.match(response.text, /<script src="\/calculator-pages\.js" defer><\/script>/);
  assert.match(response.text, /<link rel="canonical" href="https:\/\/miconstructor\.es\/calculadora\/cocina"/);
});

test("unknown calculator redirects only to the calculator hub", async () => {
  const response = await request(testApp()).get("/calculadora/no-existe").expect(302);
  assert.equal(response.headers.location, "/calculadores");
});

test("browser calculator remains purely synchronous and network independent", () => {
  const source = readFileSync(new URL("../public/calculator-pages.js", import.meta.url), "utf8");
  assert.doesNotMatch(source, /\bfetch\s*\(/);
  assert.doesNotMatch(source, /\basync\b|\bawait\b|useEffect|MutationObserver|setTimeout|setInterval/);
  assert.match(source, /Number\.parseFloat/);
  assert.match(source, /quantityInput\.addEventListener\("input"/);
  assert.match(source, /qualitySelect\.addEventListener\("change"/);
  assert.match(source, /quantity \* minBase \* qualityFactor/);
  assert.match(source, /quantity \* maxBase \* qualityFactor/);
});
