import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import express from "express";
import test from "node:test";
import request from "supertest";
import type { AppConfig } from "../src/config.js";
import type { Database } from "../src/db.js";
import { contentRouter } from "../src/routes/content.js";

const migrationUrl = new URL("../migrations/014_guide_cms_seo.sql", import.meta.url);
const routeUrl = new URL("../src/routes/content.ts", import.meta.url);
const adminUiUrl = new URL("../public/admin-guide-ui.js", import.meta.url);
const indexUrl = new URL("../public/index.html", import.meta.url);

const config = { APP_URL: "https://miconstructor.es" } as AppConfig;
const published = {
  id: "01400000-0000-4000-8000-000000000001",
  slug: "reforma-bano-5m2",
  category: "Baño",
  title: "Caso orientativo: reforma completa de baño de 5 m²",
  summary: "Resumen suficientemente largo del caso orientativo para una reforma de baño.",
  body: "Primer párrafo suficientemente largo para explicar el alcance de la reforma.\n\nSegundo párrafo con contexto adicional para comparar presupuestos.",
  price_range: "3.250 € – 3.750 €",
  price_metric: "650–750 €/m²",
  highlights: ["Demolición y retirada", "Fontanería"],
  caveats: "Mover bajantes o elegir materiales premium puede elevar el presupuesto.",
  source_label: "Fuente de ejemplo",
  source_url: "https://example.com/precios",
  source_date_label: "agosto 2026",
  author_name: "Equipo MiConstructor",
  cover_image_path: null,
  seo_title: "Precio reforma de baño de 5 m² | MiConstructor",
  seo_description: "Descripción SEO suficientemente larga para explicar el caso orientativo de reforma de baño de cinco metros cuadrados.",
  status: "PUBLICADO" as const,
  published_at: "2026-08-12T10:00:00.000Z",
  created_at: "2026-08-12T09:00:00.000Z",
  updated_at: "2026-08-12T11:00:00.000Z",
};

test("Guía SSR entrega canonical, OpenGraph y Article JSON-LD", async () => {
  const database = {
    async query(sql: string) {
      if (sql.includes("WHERE slug=$1 AND status='PUBLICADO'")) return { rows: [published] };
      throw new Error(`Consulta inesperada: ${sql}`);
    },
  } as unknown as Database;
  const app = express();
  app.use(contentRouter(database, config));
  const response = await request(app).get("/guia/reforma-bano-5m2");
  assert.equal(response.status, 200, response.text);
  assert.match(response.text, /<link rel="canonical" href="https:\/\/miconstructor\.es\/guia\/reforma-bano-5m2"/);
  assert.match(response.text, /property="og:title"/);
  assert.match(response.text, /"@type":"Article"/);
  assert.match(response.text, /datePublished/);
  assert.match(response.text, /3\.250 € – 3\.750 €/);
  assert.match(response.text, /Fuente de ejemplo/);
});

test("sitemap solo utiliza artículos PUBLICADO y robots apunta al sitemap", async () => {
  const database = {
    async query(sql: string) {
      if (sql.includes("SELECT slug, updated_at FROM guide_articles WHERE status='PUBLICADO'")) {
        return { rows: [{ slug: published.slug, updated_at: published.updated_at }] };
      }
      throw new Error(`Consulta inesperada: ${sql}`);
    },
  } as unknown as Database;
  const app = express();
  app.use(contentRouter(database, config));
  const sitemap = await request(app).get("/sitemap.xml");
  assert.equal(sitemap.status, 200);
  assert.match(sitemap.text, /https:\/\/miconstructor\.es\/guia\/reforma-bano-5m2/);
  const robots = await request(app).get("/robots.txt");
  assert.equal(robots.status, 200);
  assert.match(robots.text, /Sitemap: https:\/\/miconstructor\.es\/sitemap\.xml/);
});

test("CMS are schemă, CRUD admin, draft/publicare și seed-urile inițiale", async () => {
  execFileSync(process.execPath, ["--check", fileURLToPath(adminUiUrl)], { stdio: "pipe" });
  const [migration, route, adminUi, index] = await Promise.all([
    readFile(migrationUrl, "utf8"),
    readFile(routeUrl, "utf8"),
    readFile(adminUiUrl, "utf8"),
    readFile(indexUrl, "utf8"),
  ]);
  assert.match(migration, /CREATE TABLE guide_articles/);
  assert.match(migration, /status IN \('BORRADOR','PUBLICADO'\)/);
  assert.match(migration, /reforma-bano-5m2/);
  assert.match(migration, /reforma-cocina-7m2/);
  assert.match(migration, /reforma-salon-25m2/);
  assert.match(migration, /reforma-integral-80m2/);
  assert.match(route, /router\.post\("\/api\/v1\/admin\/guide\/articles"/);
  assert.match(route, /router\.put\("\/api\/v1\/admin\/guide\/articles\/:id"/);
  assert.match(route, /router\.delete\("\/api\/v1\/admin\/guide\/articles\/:id"/);
  assert.match(route, /requireRole\("admin"\)/);
  assert.match(adminUi, /Guía \/ Blog/);
  assert.match(adminUi, /SEO title/);
  assert.match(adminUi, /Meta description/);
  assert.match(adminUi, /PUBLICADO/);
  assert.match(index, /admin-guide\.css/);
  assert.match(index, /admin-guide-ui\.js/);
});
