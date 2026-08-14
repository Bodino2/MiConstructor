import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { getHomeService, getHomeServiceCatalog } from "../../lib/home-service-catalog.js";
import {
  annualizeHomeServiceValue,
  calculateHomeServiceMonetization,
  estimateHomeServicePrice,
} from "../../lib/home-service-pricing.js";
import { estimateProjectPrice } from "../../lib/project-estimator.js";

interface CatalogPricing {
  standardRange?: { median?: number };
}

interface CatalogService {
  slug?: string;
  pricing?: CatalogPricing & Record<string, unknown>;
}

interface CatalogVertical {
  services?: CatalogService[];
}

interface HomeEstimate {
  valid: boolean;
  zone?: string;
  range?: { minimum: number; median: number; maximum: number };
}

interface MonetizationResult {
  valid: boolean;
  basisCents?: number;
  feeCents: number;
}

interface ProjectEstimate {
  valid: boolean;
  input?: { locationZone?: string };
  range?: { minimum: number; maximum: number };
}

const publicUiUrl = new URL("../public/consolidated-ui.js", import.meta.url);
const publicCssUrl = new URL("../public/consolidated-ui.css", import.meta.url);
const indexUrl = new URL("../public/index.html", import.meta.url);

test("el catálogo incorpora B&B y conserva una matriz pública sin monetización", () => {
  const bnb = getHomeService("limpieza_alojamiento_turistico");
  assert.ok(bnb);
  assert.equal(bnb.bnb, true);
  assert.equal(bnb.seasonal, true);
  const catalog = getHomeServiceCatalog() as CatalogVertical[];
  const service = catalog.flatMap((vertical) => vertical.services ?? [])
    .find((item) => item.slug === "limpieza_alojamiento_turistico");
  assert.ok(service?.pricing?.standardRange?.median && service.pricing.standardRange.median > 0);
  assert.equal("feeCents" in service.pricing, false);
  assert.equal("percentage" in service.pricing, false);
});

test("la estimación de servicios usa cantidad, zona y devuelve un rango coherente", () => {
  const estimate = estimateHomeServicePrice({
    serviceSlug: "limpieza_profunda",
    location: "Linares, Jaén",
    squareMeters: 90,
    qualityLevel: "estandar",
  }) as HomeEstimate;
  assert.equal(estimate.valid, true);
  assert.equal(estimate.zone, "ANDALUCIA");
  assert.ok(estimate.range);
  assert.ok(estimate.range.minimum > 0);
  assert.ok(estimate.range.minimum < estimate.range.median);
  assert.ok(estimate.range.median < estimate.range.maximum);
});

test("la recurrencia anualiza 60 euros semanales a 3.120 euros", () => {
  const value = annualizeHomeServiceValue({ priceCentsPerVisit: 6_000, frequency: "SEMANAL" });
  assert.equal(value.valid, true);
  assert.equal(value.visitsPerYear, 52);
  assert.equal(value.annualizedValueCents, 312_000);
});

test("el simulador privado monetiza sobre el valor recurrente y no sobre una sola visita", () => {
  const result = calculateHomeServiceMonetization({ priceCentsPerVisit: 6_000, frequency: "SEMANAL" }) as MonetizationResult;
  assert.equal(result.valid, true);
  assert.equal(result.basisCents, 312_000);
  assert.ok(result.feeCents > 6_000 * 0.01);
  assert.ok(result.basisCents);
  assert.ok(result.feeCents < result.basisCents);
});

test("el estimator de reformas aplica localidad sin exigir un índice manual", () => {
  const jaen = estimateProjectPrice({ projectType: "reforma_integral", squareMeters: 80, qualityLevel: "estandar", location: "Jaén" }) as ProjectEstimate;
  const madrid = estimateProjectPrice({ projectType: "reforma_integral", squareMeters: 80, qualityLevel: "estandar", location: "Madrid" }) as ProjectEstimate;
  assert.equal(jaen.valid, true);
  assert.equal(madrid.valid, true);
  assert.equal(jaen.input?.locationZone, "ANDALUCIA");
  assert.equal(madrid.input?.locationZone, "MADRID");
  assert.ok(jaen.range);
  assert.ok(madrid.range);
  assert.ok(madrid.range.minimum > jaen.range.minimum);
});

test("el módulo consolidado es JavaScript válido y elimina el presupuesto editable en runtime", async () => {
  execFileSync(process.execPath, ["--check", publicUiUrl.pathname], { stdio: "pipe" });
  const source = await readFile(publicUiUrl, "utf8");
  assert.match(source, /mcReplaceManualBudget/);
  assert.match(source, /hidden\.type = "hidden"/);
  assert.match(source, /\?servicio=\$\{encodeURIComponent\(route\[0\]\)\}&tipo=/);
  assert.match(source, /Crear cuenta profesional/);
  assert.match(source, /MC_SEASON_VALUE/);
  assert.match(source, /Modalidad B&B/);
  assert.doesNotMatch(source, /rate:\s*0\.0[345]/);
});

test("el override final garantiza contraste del dropdown y se carga después del resto del diseño", async () => {
  const [css, html] = await Promise.all([readFile(publicCssUrl, "utf8"), readFile(indexUrl, "utf8")]);
  assert.match(css, /site-nav-menu a[\s\S]*color:\s*var\(--mc-text\)/);
  assert.match(css, /site-nav-menu a:hover[\s\S]*color:\s*var\(--mc-action\)/);
  assert.match(html, /verified-reviews\.css[\s\S]*consolidated-ui\.css/);
  assert.match(html, /home-services-lifecycle-ui\.js[\s\S]*consolidated-ui\.js/);
});
