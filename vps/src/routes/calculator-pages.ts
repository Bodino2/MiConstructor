import { Router } from "express";
import type { AppConfig } from "../config.js";
import {
  calculatorQualityFactors,
  calculatorsData,
  getCalculatorData,
  type CalculatorData,
} from "../config/calculatorsData.js";

const escapeHtml = (value: unknown) => String(value ?? "").replace(/[&<>"']/g, (character) => ({
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
})[character] ?? character);

function absoluteUrl(config: Pick<AppConfig, "APP_URL">, path: string) {
  return `${config.APP_URL.replace(/\/$/, "")}${path.startsWith("/") ? path : `/${path}`}`;
}

function pageLayout(config: Pick<AppConfig, "APP_URL">, input: {
  title: string;
  description: string;
  canonicalPath: string;
  body: string;
  calculatorScript?: boolean;
}) {
  const canonical = absoluteUrl(config, input.canonicalPath);
  return `<!doctype html><html lang="es"><head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(input.title)}</title>
    <meta name="description" content="${escapeHtml(input.description)}" />
    <meta name="robots" content="index,follow,max-image-preview:large" />
    <link rel="canonical" href="${escapeHtml(canonical)}" />
    <meta property="og:type" content="website" />
    <meta property="og:site_name" content="MiConstructor" />
    <meta property="og:title" content="${escapeHtml(input.title)}" />
    <meta property="og:description" content="${escapeHtml(input.description)}" />
    <meta property="og:url" content="${escapeHtml(canonical)}" />
    <link rel="icon" href="/favicon.svg" />
    <link rel="stylesheet" href="/styles.css" />
    <link rel="stylesheet" href="/site-shell.css" />
    <link rel="stylesheet" href="/calculator-pages.css" />
    ${input.calculatorScript ? '<script src="/calculator-pages.js" defer></script>' : ""}
  </head><body>
    <header class="topbar"><a class="brand" href="/"><img src="/miconstructor-mark.svg" alt="" /><span>MiConstructor</span></a><nav aria-label="Navegación principal"><a href="/publicar?servicio=reformas">Reformas</a><a href="/publicar?servicio=limpieza">Limpieza</a><a href="/publicar?servicio=jardineria">Jardinería</a><a href="/guia">Guía de precios</a><a href="/opiniones">Opiniones</a><a href="/login">Entrar</a></nav></header>
    <main>${input.body}</main>
  </body></html>`;
}

function calculatorForm(calculator: CalculatorData) {
  const quantityLabel = calculator.unitLabel === "m²" ? "Superficie (m²)" : "Cantidad (unidades)";
  return `<div class="calculator-shell">
    <a class="calculator-back" href="/calculadores">← Todos los calculadores</a>
    <header class="calculator-hero"><span class="calculator-eyebrow">CALCULADORA MICONSTRUCTOR</span><h1>${escapeHtml(calculator.title)}</h1><p>${escapeHtml(calculator.description)}</p></header>
    <section class="calculator-grid" data-programmatic-calculator data-price-min="${calculator.pricePerM2Min}" data-price-max="${calculator.pricePerM2Max}">
      <div class="calculator-card">
        <div class="calculator-field"><label for="calculator-quantity">${escapeHtml(quantityLabel)}</label><input id="calculator-quantity" data-calculator-quantity type="number" min="0" step="0.1" inputmode="decimal" placeholder="0" autocomplete="off" /></div>
        <div class="calculator-field"><label for="calculator-quality">Calidad</label><select id="calculator-quality" data-calculator-quality><option value="${calculatorQualityFactors.basica}">Básica</option><option value="${calculatorQualityFactors.media}" selected>Media</option><option value="${calculatorQualityFactors.premium}">Premium</option></select></div>
      </div>
      <aside class="calculator-result-card" aria-live="polite"><span>Estimación orientativa</span><strong data-calculator-result data-state="empty">Introduce una cantidad válida para calcular el rango.</strong><small>Rango orientativo calculado localmente por MiConstructor. El precio final lo determina el presupuesto profesional.</small></aside>
    </section>
  </div>`;
}

function calculatorsIndex() {
  const cards = calculatorsData.map((calculator) => `<a class="calculator-index-card" href="/calculadora/${escapeHtml(calculator.slug)}"><h2>${escapeHtml(calculator.title)}</h2><p>${escapeHtml(calculator.description)}</p><span>Calcular precio →</span></a>`).join("");
  return `<div class="calculator-shell"><header class="calculator-hero"><span class="calculator-eyebrow">CALCULADORES DE OBRA</span><h1>Calculadores de reformas y servicios</h1><p>Selecciona el tipo de trabajo y obtén al instante un rango orientativo según cantidad y nivel de calidad.</p></header><section class="calculator-index" aria-label="Calculadores disponibles">${cards}</section></div>`;
}

export function calculatorPagesRouter(config: Pick<AppConfig, "APP_URL">) {
  const router = Router();

  router.get("/calculadores", (_request, response) => {
    response.type("html").send(pageLayout(config, {
      title: "Calculadores de reformas y obras | MiConstructor",
      description: "Calculadores orientativos para reformas, pintura, fachadas, ventanas, tejados, instalaciones y otros trabajos de construcción.",
      canonicalPath: "/calculadores",
      body: calculatorsIndex(),
    }));
  });

  router.get("/calculadora/:servicio", (request, response) => {
    const calculator = getCalculatorData(String(request.params.servicio || "").toLowerCase());
    if (!calculator) return response.redirect(302, "/calculadores");
    const canonicalPath = `/calculadora/${calculator.slug}`;
    return response.type("html").send(pageLayout(config, {
      title: `${calculator.title} | MiConstructor`,
      description: calculator.description,
      canonicalPath,
      body: calculatorForm(calculator),
      calculatorScript: true,
    }));
  });

  return router;
}
