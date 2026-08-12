import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import express from "express";
import test from "node:test";
import request from "supertest";
import type { AppConfig } from "../src/config.js";
import type { Database } from "../src/db.js";
import { geospatialRouter } from "../src/routes/geospatial.js";

const migrationUrl = new URL("../migrations/013_project_area_preferences.sql", import.meta.url);
const routeUrl = new URL("../src/routes/geospatial.ts", import.meta.url);
const projectUiUrl = new URL("../public/geo-preferences-ui.js", import.meta.url);
const guideUiUrl = new URL("../public/guide-ui.js", import.meta.url);
const guideNavUrl = new URL("../public/guide-nav.js", import.meta.url);
const guideCssUrl = new URL("../public/guide.css", import.meta.url);
const indexUrl = new URL("../public/index.html", import.meta.url);
const bootstrapUrl = new URL("../public/app-bootstrap.js", import.meta.url);
const appUrl = new URL("../src/app.ts", import.meta.url);
const registrationAreaUrl = new URL("../public/marketing-registration-area.js", import.meta.url);

const config = { GEOAPIFY_API_KEY: "g".repeat(32) } as AppConfig;

function authUser(role: "cliente" | "profesional" = "cliente") {
  return {
    id: "22222222-2222-4222-8222-222222222222",
    email: `${role}@example.es`,
    name: role === "cliente" ? "Cliente" : "Profesional",
    role,
    emailVerified: true,
    accountStatus: "ACTIVO",
    verificationStatus: role === "cliente" ? "NO_APLICA" : "APROBADO",
  } as const;
}

function transactionalDatabase(location: { province: string; locality: string; latitude: number; longitude: number }) {
  const calls: Array<{ sql: string; params?: unknown[] }> = [];
  const query = async (sql: string, params?: unknown[]) => {
    calls.push({ sql, params });
    if (sql.includes("FROM geo_location_cache")) {
      return { rows: [{
        province: location.province,
        locality: location.locality,
        latitude: location.latitude,
        longitude: location.longitude,
        formatted_address: `${location.locality}, ${location.province}, España`,
      }] };
    }
    return { rows: [] };
  };
  const database = {
    query,
    async connect() {
      return { query, release() {} };
    },
  } as unknown as Database;
  return { database, calls };
}

test("editar la zona base no modifica las ubicaciones de proyectos existentes", async () => {
  const { database, calls } = transactionalDatabase({ province: "Jaén", locality: "Linares", latitude: 38.095, longitude: -3.636 });
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => { req.user = authUser("cliente"); next(); });
  app.use("/api/v1", geospatialRouter(database, config));

  const response = await request(app)
    .put("/api/v1/users/me/service-area")
    .send({ province: "Jaén", locality: "Linares", radiusKm: 75 });

  assert.equal(response.status, 200, response.text);
  assert.deepEqual(response.body.area, { province: "Jaén", locality: "Linares", radiusKm: 75 });
  assert.ok(calls.some((call) => /UPDATE users[\s\S]*service_radius_km/.test(call.sql)));
  assert.equal(calls.some((call) => /UPDATE projects/.test(call.sql)), false);
});

test("un profesional sincroniza zona y radio con professional_availability", async () => {
  const { database, calls } = transactionalDatabase({ province: "Jaén", locality: "Linares", latitude: 38.095, longitude: -3.636 });
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => { req.user = authUser("profesional"); next(); });
  app.use("/api/v1", geospatialRouter(database, config));

  const response = await request(app)
    .put("/api/v1/users/me/service-area")
    .send({ province: "Jaén", locality: "Linares", radiusKm: 100 });

  assert.equal(response.status, 200, response.text);
  const availability = calls.find((call) => /INSERT INTO professional_availability/.test(call.sql));
  assert.ok(availability);
  assert.deepEqual(availability?.params?.slice(0, 2), [authUser("profesional").id, 100]);
});

test("cada proyecto puede usar una localidad y un radio distintos del perfil del cliente", async () => {
  const { database, calls } = transactionalDatabase({ province: "Jaén", locality: "Úbeda", latitude: 38.011, longitude: -3.371 });
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => { req.user = authUser("cliente"); next(); });
  app.use("/api/v1", geospatialRouter(database, config));

  const response = await request(app)
    .post("/api/v1/projects")
    .send({
      title: "Reforma baño en Úbeda",
      description: "Reforma completa del baño con renovación de revestimientos, sanitarios e instalaciones.",
      category: "fontaneria",
      projectType: "bano",
      serviceProvince: "Jaén",
      serviceLocality: "Úbeda",
      searchRadiusKm: 25,
      squareMeters: 5,
      qualityLevel: "estandar",
    });

  assert.equal(response.status, 201, response.text);
  assert.equal(response.body.project.location, "Úbeda, Jaén");
  assert.equal(response.body.project.searchRadiusKm, 25);
  const insert = calls.find((call) => /INSERT INTO projects/.test(call.sql));
  assert.ok(insert);
  assert.equal(insert?.params?.[11], "Jaén");
  assert.equal(insert?.params?.[12], "Úbeda");
  assert.equal(insert?.params?.[15], 25);
});

test("schema y UI separan zona base de zona específica del proyecto", async () => {
  execFileSync(process.execPath, ["--check", fileURLToPath(projectUiUrl)], { stdio: "pipe" });
  execFileSync(process.execPath, ["--check", fileURLToPath(guideUiUrl)], { stdio: "pipe" });
  execFileSync(process.execPath, ["--check", fileURLToPath(guideNavUrl)], { stdio: "pipe" });
  const [migration, route, projectUi, index, registrationArea] = await Promise.all([
    readFile(migrationUrl, "utf8"),
    readFile(routeUrl, "utf8"),
    readFile(projectUiUrl, "utf8"),
    readFile(indexUrl, "utf8"),
    readFile(registrationAreaUrl, "utf8"),
  ]);
  assert.match(migration, /search_radius_km/);
  assert.match(route, /serviceProvince/);
  assert.match(route, /serviceLocality/);
  assert.match(route, /searchRadiusKm/);
  assert.match(route, /Math\.min\(professionalRadius, projectRadius\)/);
  assert.match(projectUi, /Puede ser distinta de tu localidad habitual/);
  assert.match(projectUi, /No cambia la zona guardada en tu perfil/);
  assert.match(projectUi, /Editar zona y radio/);
  assert.match(projectUi, /\/api\/v1\/users\/me\/service-area/);
  assert.match(registrationArea, /Zona base/);
  assert.match(index, /geo-preferences-ui\.js/);
});

test("Guía MiConstructor publica casos orientativos con fuentes y sin reseñas inventadas", async () => {
  const [guide, css, index, bootstrap, appSource] = await Promise.all([
    readFile(guideUiUrl, "utf8"),
    readFile(guideCssUrl, "utf8"),
    readFile(indexUrl, "utf8"),
    readFile(bootstrapUrl, "utf8"),
    readFile(appUrl, "utf8"),
  ]);
  for (const slug of ["reforma-bano-5m2", "reforma-cocina-7m2", "reforma-salon-25m2", "reforma-integral-80m2"]) {
    assert.match(guide, new RegExp(slug));
  }
  assert.match(guide, /No publicamos opiniones inventadas/);
  assert.match(guide, /3\.250 € – 3\.750 €/);
  assert.match(guide, /5\.600 € – 9\.000 €/);
  assert.match(guide, /1\.345 € – 5\.065 €/);
  assert.match(guide, /32\.000 € – 64\.000 €/);
  assert.match(guide, /Habitissimo/);
  assert.match(guide, /Cronoshare/);
  assert.match(guide, /Los importes son orientativos y no sustituyen un presupuesto profesional/);
  assert.match(css, /guide-grid/);
  assert.match(index, /guide-ui\.js/);
  assert.match(index, /guide-nav\.js/);
  assert.match(bootstrap, /dedicatedGuideRoute/);
  assert.match(appSource, /"\/guia"/);
  assert.match(appSource, /"\/guia\/:slug"/);
});
