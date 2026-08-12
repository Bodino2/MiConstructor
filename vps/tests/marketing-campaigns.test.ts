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
const serviceAreaMigrationUrl = new URL("../migrations/011_user_service_area.sql", import.meta.url);
const routeUrl = new URL("../src/routes/marketing.ts", import.meta.url);
const authRouteUrl = new URL("../src/routes/auth.ts", import.meta.url);
const uiUrl = new URL("../public/marketing-ui.js", import.meta.url);
const attributionUrl = new URL("../public/marketing-attribution.js", import.meta.url);
const areaBridgeUrl = new URL("../public/marketing-registration-area.js", import.meta.url);
const cssUrl = new URL("../public/marketing.css", import.meta.url);
const indexUrl = new URL("../public/index.html", import.meta.url);
const bootstrapUrl = new URL("../public/app-bootstrap.js", import.meta.url);
const appUrl = new URL("../src/app.ts", import.meta.url);

function campaign() {
  return {
    id: "01000000-0000-4000-8000-000000000001",
    slug: "espana-reformas",
    code: "espana-clientes-v1",
    name: "España · Clientes · QR nacional",
    audience: "cliente",
    channel: "qr",
    landing_path: "/campana/espana-reformas",
    utm_source: "qr",
    utm_medium: "offline",
    utm_campaign: "espana_launch_clientes",
    utm_content: "qr_nacional_clientes_v1",
    headline: "Tu reforma, con profesionales verificados de tu zona.",
    subheadline: "Selecciona tu provincia y localidad.",
    cta_label: "Continuar con mi zona",
    cta_path: "/registro-cliente",
  };
}

test("el QR nacional registra el scan y redirige con atribución UTM", async () => {
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

  const response = await request(app).get("/r/espana-clientes-v1");

  assert.equal(response.status, 302, response.text);
  const redirectLocation = response.headers.location;
  assert.equal(typeof redirectLocation, "string");
  const location = new URL(String(redirectLocation), "https://miconstructor.es");
  assert.equal(location.pathname, "/campana/espana-reformas");
  assert.equal(location.searchParams.get("utm_source"), "qr");
  assert.equal(location.searchParams.get("utm_medium"), "offline");
  assert.equal(location.searchParams.get("utm_campaign"), "espana_launch_clientes");
  assert.equal(location.searchParams.get("utm_content"), "qr_nacional_clientes_v1");
  assert.equal(location.searchParams.get("mc"), "espana-clientes-v1");
  assert.match(calls[1]?.sql ?? "", /'QR_SCAN'/);
  assert.deepEqual(calls[1]?.params, [campaign().id, "/r/espana-clientes-v1"]);
});

test("la landing nacional devuelve CTA con la misma atribución", async () => {
  const database = {
    async query(sql: string) {
      if (sql.includes("FROM marketing_campaigns")) return { rows: [campaign()] };
      throw new Error("Consulta inesperada");
    },
  } as unknown as Database;
  const app = express();
  app.use(express.json());
  app.use("/api/v1", marketingRouter(database));

  const response = await request(app).get("/api/v1/marketing/campaigns/espana-reformas");

  assert.equal(response.status, 200, response.text);
  assert.equal(response.body.campaign.code, "espana-clientes-v1");
  const cta = new URL(response.body.campaign.ctaHref, "https://miconstructor.es");
  assert.equal(cta.pathname, "/registro-cliente");
  assert.equal(cta.searchParams.get("mc"), "espana-clientes-v1");
  assert.equal(cta.searchParams.get("utm_campaign"), "espana_launch_clientes");
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
    .send({ code: "espana-clientes-v1", eventType: "ARBITRARY_EVENT", path: "/campana/espana-reformas" });

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

test("la landing nacional exige zona y usa 50 km como radio recomendado", async () => {
  execFileSync(process.execPath, ["--check", fileURLToPath(uiUrl)], { stdio: "pipe" });
  const ui = await readFile(uiUrl, "utf8");
  assert.match(ui, /marketing-province/);
  assert.match(ui, /marketing-locality/);
  assert.match(ui, /marketing-radius/);
  assert.match(ui, /<option value="50" selected>\+50 km<\/option>/);
  assert.match(ui, /searchParams\.set\("provincia"/);
  assert.match(ui, /searchParams\.set\("localidad"/);
  assert.match(ui, /searchParams\.set\("radioKm"/);
  assert.match(ui, /searchParams\.set\("zona"/);
  assert.match(ui, /"Jaén"/);
  assert.match(ui, /"Madrid"/);
  assert.match(ui, /"Valencia\/València"/);
});

test("la zona QR llega al formulario y se persiste para cliente y profesional", async () => {
  execFileSync(process.execPath, ["--check", fileURLToPath(areaBridgeUrl)], { stdio: "pipe" });
  const [bridge, areaMigration, authRoute, index] = await Promise.all([
    readFile(areaBridgeUrl, "utf8"),
    readFile(serviceAreaMigrationUrl, "utf8"),
    readFile(authRouteUrl, "utf8"),
    readFile(indexUrl, "utf8"),
  ]);

  assert.match(index, /marketing-registration-area\.js/);
  assert.match(bridge, /serviceProvince/);
  assert.match(bridge, /serviceLocality/);
  assert.match(bridge, /serviceRadiusKm/);
  assert.match(bridge, /Zona de trabajo/);
  assert.match(bridge, /Zona del proyecto/);

  assert.match(areaMigration, /ADD COLUMN service_province text/);
  assert.match(areaMigration, /ADD COLUMN service_locality text/);
  assert.match(areaMigration, /service_radius_km integer NOT NULL DEFAULT 50/);
  assert.match(areaMigration, /BETWEEN 5 AND 200/);

  assert.match(authRoute, /serviceProvince: z\.string/);
  assert.match(authRoute, /serviceLocality: z\.string/);
  assert.match(authRoute, /serviceRadiusKm: z\.coerce\.number/);
  assert.match(authRoute, /service_province, service_locality, service_radius_km/);
  assert.match(authRoute, /INSERT INTO professional_availability/);
  assert.match(authRoute, /travel_radius_km = EXCLUDED\.travel_radius_km/);
  assert.match(authRoute, /service_areas = EXCLUDED\.service_areas/);
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
  assert.match(index, /marketing-attribution\.js[\s\S]*marketing-ui\.js[\s\S]*marketing-registration-area\.js/);
  assert.match(bootstrap, /startsWith\("\/campana\/"\)/);
  assert.match(appSource, /marketingRedirectRouter/);
  assert.match(appSource, /"\/campana\/:slug"/);
  assert.match(ui, /LANDING_VIEW/);
  assert.match(ui, /CTA_CLICK/);
  assert.match(attribution, /\/api\/v1\/auth\/register/);
  assert.match(attribution, /SIGNUP/);
  assert.match(css, /marketing-proof-grid/);
  assert.match(css, /marketing-zone-fields/);
  assert.match(css, /marketing-zone-hint/);
});

test("solo existen dos QR nacionales imprimibles para toda España", async () => {
  for (const code of ["espana-clientes-v1", "espana-profesionales-v1"]) {
    const svg = await readFile(new URL(`../public/qr/${code}.svg`, import.meta.url), "utf8");
    assert.match(svg, /^<svg/);
    assert.match(svg, new RegExp(`https://miconstructor\\.es/r/${code}`));
    assert.match(svg, /shape-rendering="crispEdges"/);
  }
  const migration = await readFile(migrationUrl, "utf8");
  assert.doesNotMatch(migration, /linares-(clientes|pro|banos|cocinas)-v1/);
  assert.match(migration, /espana-clientes-v1/);
  assert.match(migration, /espana-profesionales-v1/);
});
