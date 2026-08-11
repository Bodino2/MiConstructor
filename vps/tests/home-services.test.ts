import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  getHomeService,
  getHomeServiceCatalog,
  nextOccurrenceDate,
  recurrenceAllowed,
} from "../../lib/home-service-catalog.js";
import {
  evaluateHomeServiceAssessment,
  getHomeServiceProfessionalSpecialties,
  getPublicHomeServiceAssessment,
} from "../../lib/home-service-assessment.js";

const migrationUrl = new URL("../migrations/005_home_services_recurring.sql", import.meta.url);
const routeUrl = new URL("../src/routes/home-services.ts", import.meta.url);

test("el catálogo mantiene MiConstructor dentro del cuidado de la propiedad", () => {
  const catalog = getHomeServiceCatalog();
  assert.equal(catalog.length, 2);
  assert.ok(getHomeService("limpieza_hogar"));
  assert.ok(getHomeService("jardineria_mantenimiento"));
  assert.equal(getHomeService("pasear_perros"), null);
});

test("la recurrencia admite limpieza semanal y bloquea servicios puntuales incompatibles", () => {
  assert.equal(recurrenceAllowed("limpieza_hogar", "SEMANAL"), true);
  assert.equal(recurrenceAllowed("limpieza_fin_obra", "SEMANAL"), false);
  assert.equal(recurrenceAllowed("poda", "PUNTUAL"), true);
});

test("el calendario recurrente conserva semanas, quincenas y fin de mes", () => {
  assert.equal(nextOccurrenceDate("2026-08-11", "SEMANAL"), "2026-08-18");
  assert.equal(nextOccurrenceDate("2026-08-11", "CADA_2_SEMANAS"), "2026-08-25");
  assert.equal(nextOccurrenceDate("2026-01-31", "MENSUAL"), "2026-02-28");
  assert.equal(nextOccurrenceDate("2026-08-11", "PUNTUAL"), null);
});

test("limpieza y jardinería tienen evaluaciones técnicas separadas de 15 preguntas", () => {
  const specialties = getHomeServiceProfessionalSpecialties();
  assert.deepEqual(specialties.map((item) => item.slug).sort(), ["jardineria", "limpieza_profesional"]);
  for (const specialty of specialties) {
    const assessment = getPublicHomeServiceAssessment(specialty.slug);
    assert.ok(assessment);
    assert.equal(assessment.questionCount, 15);
    assert.equal("correctOption" in assessment.questions[0]!, false);
  }
});

test("la evaluación no puede aprobarse sin responder las 15 preguntas", () => {
  const assessment = getPublicHomeServiceAssessment("limpieza_profesional");
  assert.ok(assessment);
  const result = evaluateHomeServiceAssessment({ specialty: "limpieza_profesional", version: assessment.version, respuestas: {} });
  assert.equal(result.valid, false);
  assert.equal(result.passed, false);
  assert.equal(result.total, 15);
});

test("la migración modela solicitud, oferta, relación recurrente, visitas y eventos append-only", async () => {
  const sql = await readFile(migrationUrl, "utf8");
  for (const table of ["home_service_requests", "home_service_offers", "home_service_engagements", "home_service_visits", "home_service_visit_events"]) {
    assert.match(sql, new RegExp(`CREATE TABLE ${table}`));
  }
  assert.match(sql, /PUNTUAL.*SEMANAL.*CADA_2_SEMANAS.*MENSUAL/s);
  assert.match(sql, /prevent_home_service_event_mutation/);
});

test("la API implementa publicación, ofertas, aceptación, pausa, reanudación y cierre de visita", async () => {
  const source = await readFile(routeUrl, "utf8");
  for (const fragment of [
    '/home-services/requests',
    '/offers/:offerId/accept',
    '/engagements/:id/pause',
    '/engagements/:id/resume',
    '/engagements/:id/cancel',
    '/visits/:id/start',
    '/visits/:id/complete',
  ]) assert.match(source, new RegExp(fragment.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.match(source, /nextOccurrenceDate/);
  assert.match(source, /professional_specialty_qualifications/);
});
