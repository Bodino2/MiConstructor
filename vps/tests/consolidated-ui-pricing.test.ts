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

interface CatalogService {
  slug?: string;
  [key: string]: unknown;
}

interface CatalogVertical {
  services?: CatalogService[];
}

interface HomeEstimate {
  valid: boolean;
  zone?: string;
  pricingPeriod?: string;
  range?: { minimum: number; median: number; maximum: number };
  annualizedRange?: { minimum: number; median: number; maximum: number } | null;
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
  realistic?: number;
}

const publicUiUrl = new URL("../public/consolidated-ui.js", import.meta.url);
const estimatorMatrixUiUrl = new URL("../public/estimator-matrix-ui.js", import.meta.url);
const publicCssUrl = new URL("../public/consolidated-ui.css", import.meta.url);
const indexUrl = new URL("../public/index.html", import.meta.url);
const marketplaceUrl = new URL("../src/routes/marketplace.ts", import.meta.url);

test("el catálogo incorpora B&B sin exponer la matriz interna de precios", () => {
  const bnb = getHomeService("limpieza_alojamiento_turistico");
  assert.ok(bnb);
  assert.equal(bnb.bnb, true);
  assert.equal(bnb.seasonal, true);
  const catalog = getHomeServiceCatalog() as CatalogVertical[];
  const service = catalog.flatMap((vertical) => vertical.services ?? [])
    .find((item) => item.slug === "limpieza_alojamiento_turistico");
  assert.ok(service);
  assert.equal("pricing" in service, false);
  assert.equal("feeCents" in service, false);
  assert.equal("percentage" in service, false);
});

test("la estimación de servicios aplica la matriz determinista oficial y el rango de ±15%", () => {
  const puntual = estimateHomeServicePrice({
    serviceSlug: "limpieza_profunda",
    location: "Linares, Jaén",
    squareMeters: 90,
    frequency: "PUNTUAL",
  }) as HomeEstimate;
  assert.equal(puntual.valid, true);
  assert.equal(puntual.zone, "ANDALUCIA");
  assert.deepEqual(puntual.range, { minimum: 91_800, median: 108_000, maximum: 124_200 });

  const recurrente = estimateHomeServicePrice({
    serviceSlug: "limpieza_hogar",
    location: "Linares, Jaén",
    estimatedHours: 4,
    frequency: "SEMANAL",
  }) as HomeEstimate;
  assert.equal(recurrente.valid, true);
  assert.equal(recurrente.pricingPeriod, "VISITA");
  assert.deepEqual(recurrente.range, { minimum: 4_760, median: 5_600, maximum: 6_440 });
  assert.deepEqual(recurrente.annualizedRange, { minimum: 247_520, median: 291_200, maximum: 334_880 });

  const jardin = estimateHomeServicePrice({
    serviceSlug: "jardineria_mantenimiento",
    location: "Jaén",
    squareMeters: 150,
    frequency: "MENSUAL",
  }) as HomeEstimate;
  assert.equal(jardin.pricingPeriod, "MES");
  assert.deepEqual(jardin.range, { minimum: 10_200, median: 12_000, maximum: 13_800 });

  const piscina = estimateHomeServicePrice({
    serviceSlug: "mantenimiento_piscina",
    location: "Jaén",
    frequency: "MENSUAL",
  }) as HomeEstimate;
  assert.equal(piscina.pricingPeriod, "ANO");
  assert.deepEqual(piscina.range, { minimum: 102_000, median: 120_000, maximum: 138_000 });
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

test("el estimator de reformas aplica exactamente la matriz oficial sin multiplicadores territoriales", () => {
  const bano5 = estimateProjectPrice({ projectType: "bano", squareMeters: 5, qualityLevel: "estandar", location: "Jaén" }) as ProjectEstimate;
  assert.equal(bano5.valid, true);
  assert.equal(bano5.realistic, 4_200);
  assert.deepEqual(bano5.range, { minimum: 3_570, maximum: 4_830 });

  const bano20Premium = estimateProjectPrice({ projectType: "bano", squareMeters: 20, qualityLevel: "premium", location: "Madrid" }) as ProjectEstimate;
  assert.equal(bano20Premium.realistic, 12_500);
  assert.deepEqual(bano20Premium.range, { minimum: 10_625, maximum: 14_375 });

  const integralJaen = estimateProjectPrice({ projectType: "reforma_integral", squareMeters: 80, qualityLevel: "estandar", location: "Jaén" }) as ProjectEstimate;
  const integralMadrid = estimateProjectPrice({ projectType: "reforma_integral", squareMeters: 80, qualityLevel: "estandar", location: "Madrid" }) as ProjectEstimate;
  assert.equal(integralJaen.realistic, 52_000);
  assert.deepEqual(integralJaen.range, { minimum: 44_200, maximum: 59_800 });
  assert.deepEqual(integralMadrid.range, integralJaen.range);
  assert.equal(integralJaen.input?.locationZone, "ANDALUCIA");
  assert.equal(integralMadrid.input?.locationZone, "MADRID");

  const parcial = estimateProjectPrice({ projectType: "reforma_parcial", squareMeters: 50, qualityLevel: "basico" }) as ProjectEstimate;
  assert.equal(parcial.realistic, 6_000);
  assert.deepEqual(parcial.range, { minimum: 5_100, maximum: 6_900 });

  const fachada = estimateProjectPrice({ projectType: "fachadas_exteriores", squareMeters: 100, qualityLevel: "estandar" }) as ProjectEstimate;
  assert.equal(fachada.realistic, 8_500);
  assert.deepEqual(fachada.range, { minimum: 7_225, maximum: 9_775 });
});

test("el endpoint de estimación existente enruta también servicios sin crear una API pública nueva", async () => {
  const source = await readFile(marketplaceUrl, "utf8");
  assert.match(source, /router\.post\("\/estimate"/);
  assert.match(source, /estimateHomeServicePrice\(body\)/);
  assert.match(source, /estimateProjectPrice\(body\)/);
  assert.match(source, /"reforma_parcial"/);
  assert.match(source, /"fachadas_exteriores"/);
});

test("el módulo consolidado es JavaScript válido y elimina el presupuesto editable en runtime", async () => {
  execFileSync(process.execPath, ["--check", publicUiUrl.pathname], { stdio: "pipe" });
  execFileSync(process.execPath, ["--check", estimatorMatrixUiUrl.pathname], { stdio: "pipe" });
  const [source, matrixUi, html] = await Promise.all([
    readFile(publicUiUrl, "utf8"),
    readFile(estimatorMatrixUiUrl, "utf8"),
    readFile(indexUrl, "utf8"),
  ]);
  assert.match(source, /mcReplaceManualBudget/);
  assert.match(source, /hidden\.type = "hidden"/);
  assert.match(source, /\?servicio=\$\{encodeURIComponent\(route\[0\]\)\}&tipo=/);
  assert.match(source, /Crear cuenta profesional/);
  assert.match(source, /MC_SEASON_VALUE/);
  assert.match(source, /Modalidad B&B/);
  assert.match(source, /fetch\("\/api\/v1\/estimate"/);
  assert.doesNotMatch(source, /rate:\s*0\.0[345]/);
  assert.match(matrixUi, /Rango orientativo calculado por la plataforma\. El precio final lo determina el presupuesto profesional\./);
  assert.match(matrixUi, /payload\.frequency = context\.frequency/);
  assert.match(matrixUi, /reforma_parcial/);
  assert.match(matrixUi, /fachadas_exteriores/);
  assert.match(matrixUi, /estandar:\s*\{ base:\s*4_200, incrementPerExtraSquareMeter:\s*220 \}/);
  assert.match(matrixUi, /minimum:\s*Math\.round\(realistic \* 0\.85\)/);
  assert.match(matrixUi, /maximum:\s*Math\.round\(realistic \* 1\.15\)/);
  assert.match(matrixUi, /form\.dataset\.mcProjectEstimate = "true"/);
  assert.match(matrixUi, /const squareMeters = Number\.parseFloat\(rawSquareMeters\)/);
  assert.match(matrixUi, /!rawSquareMeters \|\| Number\.isNaN\(squareMeters\) \|\| squareMeters <= 0/);
  assert.doesNotMatch(matrixUi, /console\.error|useEffect/);
  assert.doesNotMatch(matrixUi, /Calculando rango orientativo/);

  const syncStart = matrixUi.indexOf("function mcEstimatorSetupProject");
  const syncEnd = matrixUi.indexOf("function mcEstimatorFormatHomeRange");
  assert.ok(syncStart >= 0 && syncEnd > syncStart);
  const syncSource = matrixUi.slice(syncStart, syncEnd);
  assert.doesNotMatch(syncSource, /\basync\b|\bawait\b|\bfetch\s*\(|setTimeout|MutationObserver/);
  assert.match(syncSource, /form\.elements\.squareMeters\?\.addEventListener\("input", calculate\)/);
  assert.match(syncSource, /form\.elements\.projectType\?\.addEventListener\("change", calculate\)/);
  assert.match(syncSource, /form\.elements\.qualityLevel\?\.addEventListener\("change", calculate\)/);

  const observerStart = matrixUi.indexOf("const mcEstimatorObserver = new MutationObserver");
  assert.ok(observerStart >= 0);
  const observerSource = matrixUi.slice(observerStart);
  assert.match(observerSource, /mutation\.addedNodes/);
  assert.match(observerSource, /mcEstimatorFindUnboundProjectForm/);
  assert.doesNotMatch(observerSource, /mcEstimatorPresentResults|\.innerHTML\s*=|\.textContent\s*=/);
  assert.match(html, /estimator-matrix-ui\.js[\s\S]*consolidated-ui\.js/);
});

test("el override final garantiza contraste del dropdown y se carga después del resto del diseño", async () => {
  const [css, html] = await Promise.all([readFile(publicCssUrl, "utf8"), readFile(indexUrl, "utf8")]);
  assert.match(css, /site-nav-menu a[\s\S]*color:\s*var\(--mc-text\)/);
  assert.match(css, /site-nav-menu a:hover[\s\S]*color:\s*var\(--mc-action\)/);
  assert.match(html, /verified-reviews\.css[\s\S]*consolidated-ui\.css/);
  assert.match(html, /home-services-lifecycle-ui\.js[\s\S]*consolidated-ui\.js/);
});