import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import express from "express";
import test from "node:test";
import request from "supertest";
import type { AppConfig } from "../src/config.js";
import type { Database } from "../src/db.js";
import { geospatialRouter } from "../src/routes/geospatial.js";
import {
  distanceLocationScore,
  haversineDistanceKm,
  resolveSpainLocality,
} from "../src/services/geospatial.js";

const migrationUrl = new URL("../migrations/012_geospatial_matching.sql", import.meta.url);
const appUrl = new URL("../src/app.ts", import.meta.url);
const marketingUiUrl = new URL("../public/marketing-ui.js", import.meta.url);

const config = {
  GEOAPIFY_API_KEY: "g".repeat(32),
} as AppConfig;

function professionalUser(id: string) {
  return {
    id,
    email: "pro@example.es",
    name: "Profesional",
    role: "profesional" as const,
    emailVerified: true,
    accountStatus: "ACTIVO",
    verificationStatus: "APROBADO",
  };
}

test("Haversine calcula kilómetros reales y el score respeta el radio", () => {
  const distance = haversineDistanceKm(
    { latitude: 0, longitude: 0 },
    { latitude: 0, longitude: 1 },
  );
  assert.ok(distance > 111 && distance < 112, `distance=${distance}`);
  assert.equal(distanceLocationScore(10, 50), 100);
  assert.equal(distanceLocationScore(30, 50), 80);
  assert.equal(distanceLocationScore(51, 50), 0);
});

test("Geoapify se consulta solo para ciudades dentro de España y el resultado se cachea", async () => {
  const calls: Array<{ sql: string; params?: unknown[] }> = [];
  const database = {
    async query(sql: string, params?: unknown[]) {
      calls.push({ sql, params });
      if (sql.includes("FROM geo_location_cache")) return { rows: [] };
      if (sql.includes("INSERT INTO geo_location_cache")) return { rows: [] };
      if (sql.includes("UPDATE users")) return { rows: [] };
      if (sql.includes("UPDATE projects")) return { rows: [] };
      throw new Error(`Consulta inesperada: ${sql}`);
    },
  } as unknown as Database;
  let requested = "";
  const fakeFetch = async (input: URL | RequestInfo) => {
    requested = String(input);
    return new Response(JSON.stringify({
      results: [{ lat: 38.1, lon: -3.63, formatted: "Linares, Jaén, España" }],
    }), { status: 200, headers: { "content-type": "application/json" } });
  };

  const result = await resolveSpainLocality(
    database,
    config,
    { province: "Jaén", locality: "Linares" },
    fakeFetch as typeof fetch,
  );

  const url = new URL(requested);
  assert.equal(url.hostname, "api.geoapify.com");
  assert.equal(url.searchParams.get("type"), "city");
  assert.equal(url.searchParams.get("filter"), "countrycode:es");
  assert.equal(url.searchParams.get("limit"), "1");
  assert.equal(url.searchParams.get("text"), "Linares, Jaén, España");
  assert.equal(result.latitude, 38.1);
  assert.equal(result.longitude, -3.63);
  assert.equal(result.cached, false);
  assert.ok(calls.some((call) => call.sql.includes("INSERT INTO geo_location_cache")));
});

test("Smart Matching excluye profesionales fuera de su radio real", async () => {
  const projectId = "11111111-1111-4111-8111-111111111111";
  const ownerId = "22222222-2222-4222-8222-222222222222";
  const database = {
    async query(sql: string) {
      if (sql.includes("FROM projects WHERE id=$1")) {
        return { rows: [{
          id: projectId,
          owner_id: ownerId,
          category: "electricidad",
          location: "Linares",
          status: "PUBLICADO",
          service_province: "Jaén",
          service_locality: "Linares",
          latitude: 0,
          longitude: 0,
        }] };
      }
      if (sql.includes("FROM users u")) {
        const common = {
          company_name: null,
          technical_score: "90",
          insured: true,
          completed_projects: "5",
          review_average: "4.8",
          review_count: "10",
          available_from: null,
          concurrent_capacity: "2",
          travel_radius_km: "50",
          service_areas: ["Zona"],
          active_projects: "0",
          billing_status: "ACTIVO",
          service_province: "Jaén",
          service_locality: "Zona",
          service_latitude: 0,
        };
        return { rows: [
          { ...common, id: "33333333-3333-4333-8333-333333333333", name: "Cerca", service_longitude: 0.1 },
          { ...common, id: "44444444-4444-4444-8444-444444444444", name: "Lejos", service_longitude: 1 },
        ] };
      }
      throw new Error(`Consulta inesperada: ${sql}`);
    },
  } as unknown as Database;

  const app = express();
  app.use((req, _res, next) => {
    req.user = {
      id: ownerId,
      email: "cliente@example.es",
      name: "Cliente",
      role: "cliente",
      emailVerified: true,
      accountStatus: "ACTIVO",
      verificationStatus: "NO_APLICA",
    };
    next();
  });
  app.use("/api/v1", geospatialRouter(database, config));

  const response = await request(app).get(`/api/v1/projects/${projectId}/matches`);
  assert.equal(response.status, 200, response.text);
  assert.equal(response.body.matchingMode, "GEOSPATIAL_RADIUS");
  assert.equal(response.body.matches.length, 1);
  assert.equal(response.body.matches[0].name, "Cerca");
  assert.ok(response.body.matches[0].distanceKm > 11 && response.body.matches[0].distanceKm < 12);
  assert.equal(response.body.matches[0].withinRadius, true);
});

test("el listado profesional no muestra proyectos fuera del radio configurado", async () => {
  const professionalId = "55555555-5555-4555-8555-555555555555";
  const database = {
    async query(sql: string) {
      if (sql.includes("WHERE u.id=$1 AND u.role='profesional'")) {
        return { rows: [{
          service_province: "Jaén",
          service_locality: "Base",
          service_latitude: 0,
          service_longitude: 0,
          travel_radius_km: 50,
          service_areas: ["Base"],
        }] };
      }
      if (sql.includes("FROM projects p")) {
        const common = {
          description: "Descripción suficientemente larga",
          category: "electricidad",
          project_type: "reforma_integral",
          budget_cents: "100000",
          status: "PUBLICADO",
          created_at: "2026-08-12T10:00:00Z",
          already_applied: false,
          service_province: "Jaén",
        };
        return { rows: [
          { ...common, id: "66666666-6666-4666-8666-666666666666", title: "Proyecto cerca", location: "Cerca", service_locality: "Cerca", latitude: 0, longitude: 0.1 },
          { ...common, id: "77777777-7777-4777-8777-777777777777", title: "Proyecto lejos", location: "Lejos", service_locality: "Lejos", latitude: 0, longitude: 1 },
        ] };
      }
      throw new Error(`Consulta inesperada: ${sql}`);
    },
  } as unknown as Database;
  const app = express();
  app.use((req, _res, next) => { req.user = professionalUser(professionalId); next(); });
  app.use("/api/v1", geospatialRouter(database, config));

  const response = await request(app).get("/api/v1/projects");
  assert.equal(response.status, 200, response.text);
  assert.equal(response.body.radiusFiltered, true);
  assert.equal(response.body.projects.length, 1);
  assert.equal(response.body.projects[0].title, "Proyecto cerca");
  assert.ok(response.body.projects[0].distance_km > 11 && response.body.projects[0].distance_km < 12);
});

test("una llamada manual no puede enviar propuesta fuera del radio profesional", async () => {
  const professionalId = "88888888-8888-4888-8888-888888888888";
  const projectId = "99999999-9999-4999-8999-999999999999";
  const database = {
    async query(sql: string) {
      if (sql.includes("WHERE u.id=$1 AND u.role='profesional'")) {
        return { rows: [{
          service_province: "Jaén",
          service_locality: "Base",
          service_latitude: 0,
          service_longitude: 0,
          travel_radius_km: 50,
          service_areas: ["Base"],
        }] };
      }
      if (sql.includes("SELECT location, latitude, longitude FROM projects")) {
        return { rows: [{ location: "Lejos", latitude: 0, longitude: 1 }] };
      }
      throw new Error(`Consulta inesperada: ${sql}`);
    },
  } as unknown as Database;
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => { req.user = professionalUser(professionalId); next(); });
  app.use("/api/v1", geospatialRouter(database, config));

  const response = await request(app).post("/api/v1/proposals").send({ projectId });
  assert.equal(response.status, 403, response.text);
  assert.match(response.body.error, /fuera de tu radio/);
  assert.equal(response.body.radiusKm, 50);
  assert.ok(response.body.distanceKm > 111 && response.body.distanceKm < 112);
});

test("schema și wiring păstrează adresa privată în afara matching-ului", async () => {
  const [migration, appSource, marketingUi] = await Promise.all([
    readFile(migrationUrl, "utf8"),
    readFile(appUrl, "utf8"),
    readFile(marketingUiUrl, "utf8"),
  ]);
  assert.match(migration, /CREATE TABLE geo_location_cache/);
  assert.match(migration, /service_latitude/);
  assert.match(migration, /service_longitude/);
  assert.match(migration, /projects_sync_service_coordinates/);
  assert.match(migration, /no representa la dirección privada/i);
  assert.match(appSource, /geospatialRouter\(database, config\)[\s\S]*marketplaceRouter\(database, config, stripe\)[\s\S]*operatingSystemRouter/);
  assert.match(marketingUi, /\/api\/v1\/geo\/resolve/);
  assert.match(marketingUi, /Validando localidad/);
});
