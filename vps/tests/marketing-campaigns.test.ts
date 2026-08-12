import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import express from "express";
import test from "node:test";
import request from "supertest";
import type { Database } from "../src/db.js";
import { marketingRedirectRouter, marketingRouter } from "../src/routes/marketing.js";

const migrationUrl = new URL("../migrations/010_marketing_campaigns.sql", import.meta.url);
const routeUrl = new URL("../src/routes/marketing.ts", import.meta.url);
const uiUrl = new URL("../public/marketing-ui.js", import.meta.url);
const attributionUrl = new URL("../public/marketing-attribution.js", import.meta.url);
const cssUrl = new URL("../public/marketing.css", import.meta.url);
const indexUrl = new URL("../public/index.html", import.meta.url);
const bootstrapUrl = new URL("../public/app-bootstrap.js", import.meta.url);
const appUrl = new URL("../src/app.ts", import.meta.url);

function campaign() {
  return {
    id: "01000000-0000-4000-8000-000000000001",
    slug: "linares-reformas",
    code: "linares-clientes-v1",
    name: "Linares · Clientes · Lanzamiento QR",
    audience: "cliente",
    channel: "qr",
    landing_path: "/campana/linares-reformas",
    utm_source: "qr",
    utm_medium: "offline",
    utm_campaign: "linares_launch_clientes",
    utm_content: "flyer_general_v1",
    headline: "Antes de aceptar un presupuesto, comprueba tus opciones.",
    subheadline: "Publica tu reforma y compara propuestas.",
    cta_label: "Publicar mi reforma gratis",
    cta_path: "/registro-cliente",
  };
}

test("el QR permanente registra el scan y redirige con atribución UTM", async () => {
  const calls: Array<{ sql: string; params: unknown[] | undefined }> = [];
  const database = {
    async query(sql: string, params?: unknown[]) {
      calls.push({ sql, params });
      if (sql.includes("FROM marketing_campaigns")) return { rows: [campaign()] };
      if (sql.includes("INSERT INTO marketing_events")) return { rows: [] };
      throw new Error("Consulta inesperada");
    },
  } as unknown as Database;
  const app = express();
  app.use(marketingRedirectRouter(database));

  const response = await request(app).get("/r/linares-clientes-v1");

  assert.equal(response.status, 302, response.text);
  const location = new URL(response.headers.location, "https://miconstructor.es");
  assert.equal(location.pathname, "/campana/linares-reformas");
  assert.equal(location.searchParams.get("utm_source"), "qr");
  assert.equal(location.searchParams.get("utm_medium"), "offline");
  assert.equal(location.searchParams.get("utm_campaign"), "linares_launch_clientes");
  assert.equal(location.searchParams.get("utm_content"), "flyer_general_v1");
  assert.equal(location.searchParams.get("mc"), "linares-clientes-v1");
  assert.match(calls[1]?.sql ?? "", /'QR_SCAN'/);
  assert.deepEqual(calls[1]?.params, [campaign().id, "/r/linares-clientes-v1"]);
});

test("la landing pública devuelve CTA con la misma atribución", async () => {
  const database = {
    async query(sql: string) {
      if (sql.includes("FROM marketing_campaigns")) return { rows: [campaign()] };
      throw new Error("Consulta inesperada");
    },
  } as unknown as Database;
  const app = express();
  app.use(express.json());
  app.use("/api/v1", marketingRouter(database));

  const response = await request(app).get("/api/v1/marketing/campaigns/linares-reformas");

  assert.equal(response.status, 200, response.text);
  assert.equal(response.body.campaign.code, "linares-clientes-v1");
  const cta = new URL(response.body.campaign.ctaHref, "https://miconstructor.es");
  assert.equal(cta.pathname, "/registro-cliente");
  assert.equal(cta.searchParams.get("mc"), "linares-clientes-v1");
  assert.equal(cta.searchParams.get("utm_campaign"), "linares_launch_clientes");
});

test("los eventos públicos están limitados a la taxonomía prevista", async () => {
  let queries = 0;
  const database = {
    async query() { queries += 1; return { rows: [] }; },
  } as unknown as Database;
  const app = express();
  app.use(express.json());
  app.use("/api/v1", marketingRouter(database));

  const response = await request(app)
    .post("/api/v1/marketing/events")
    .send({ code: "linares-clientes-v1", eventType: "ARBITRARY_EVENT", path: "/campana/linares-reformas" });

  assert.equal(response.status, 400);
  assert.equal(queries, 0);
});

test("la telemetría de marketing es agregada y no guarda huellas personales", async () => {
  const [migration, route] = await Promise.all([
    readFile(migrationUrl, "utf8"),
    readFile(routeUrl, "utf8"),
  ]);
  assert.match(migration, /CREATE TABLE marketing_campaigns/);
  assert.match(migration, /CREATE TABLE marketing_events/);
  assert.match(migration, /QR_SCAN.*LANDING_VIEW.*CTA_CLICK.*SIGNUP/s);
  assert.match(migration, /No almacena IP, user-agent, fingerprint ni identificadores personales/);
  assert.doesNotMatch(migration, /ip_address|user_agent|fingerprint_id/);
  assert.doesNotMatch(route, /request\.ip|user-agent|fingerprint/i);
  assert.match(route, /requireAuth, requireRole\("admin"\)/);
});

test("la aplicación carga la landing dedicada, atribución y assets de campaña", async () => {
  execFileSync(process.execPath, ["--check", fileURLToPath(uiUrl)], { stdio: "pipe" });
  execFileSync(process.execPath, ["--check", fileURLToPath(attributionUrl)], { stdio: "pipe" });
  const [ui, attribution, css, index, bootstrap, appSource] = await Promise.all([
    readFile(uiUrl, "utf8"),
    readFile(attributionUrl, "utf8"),
    readFile(cssUrl, "utf8"),
    readFile(indexUrl, "utf8"),
    readFile(bootstrapUrl, "utf8"),
    readFile(appUrl, "utf8"),
  ]);
  assert.match(index, /marketing\.css/);
  assert.match(index, /marketing-attribution\.js[\s\S]*marketing-ui\.js/);
  assert.match(bootstrap, /startsWith\("\/campana\/"\)/);
  assert.match(appSource, /marketingRedirectRouter/);
  assert.match(appSource, /"\/campana\/:slug"/);
  assert.match(ui, /LANDING_VIEW/);
  assert.match(ui, /CTA_CLICK/);
  assert.match(attribution, /\/api\/v1\/auth\/register/);
  assert.match(attribution, /SIGNUP/);
  assert.match(css, /marketing-proof-grid/);
});

test("los cuatro QR impresos apuntan a links cortos permanentes de MiConstructor", async () => {
  for (const code of ["linares-clientes-v1", "linares-pro-v1", "linares-banos-v1", "linares-cocinas-v1"]) {
    const svg = await readFile(new URL(`../public/qr/${code}.svg`, import.meta.url), "utf8");
    assert.match(svg, /^<svg/);
    assert.match(svg, new RegExp(`https://miconstructor\\.es/r/${code}`));
    assert.match(svg, /shape-rendering="crispEdges"/);
  }
});
