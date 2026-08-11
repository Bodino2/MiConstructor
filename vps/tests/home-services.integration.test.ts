import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, test } from "node:test";
import { Pool } from "pg";
import request from "supertest";
import { madridDateIso, nextOccurrenceDate } from "../../lib/home-service-catalog.js";
import { createApp } from "../src/app.js";
import { loadConfig } from "../src/config.js";
import { createDatabase } from "../src/db.js";
import { migrate } from "../src/migrate.js";
import { PrivateStorage } from "../src/services/storage.js";

const sourceDatabaseUrl = process.env.TEST_DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:5432/miconstructor_test";
const uniqueDatabaseName = `miconstructor_home_${process.pid}_${randomUUID().replace(/-/g, "").slice(0, 10)}`;
const adminUrl = new URL(sourceDatabaseUrl);
adminUrl.pathname = "/postgres";
const testUrl = new URL(sourceDatabaseUrl);
testUrl.pathname = `/${uniqueDatabaseName}`;

const adminPool = new Pool({ connectionString: adminUrl.toString() });
let database: ReturnType<typeof createDatabase>;
let application: ReturnType<typeof createApp>;
let uploadDir = "";

const environment = {
  ...process.env,
  NODE_ENV: "test",
  APP_URL: "http://localhost:3200",
  DATABASE_URL: testUrl.toString(),
  SESSION_PEPPER: "h".repeat(32),
  TOKEN_PEPPER: "o".repeat(32),
  BILLING_JOB_SECRET: "m".repeat(32),
  ADMIN_EMAIL: "admin@miconstructor.es",
  REQUIRE_EXTERNAL_SERVICES: "false",
};

before(async () => {
  await adminPool.query(`CREATE DATABASE "${uniqueDatabaseName}"`);
  Object.assign(process.env, environment);
  await migrate(testUrl.toString());
  const config = loadConfig(environment);
  database = createDatabase(config);
  uploadDir = await mkdtemp(join(tmpdir(), "miconstructor-home-services-"));
  const storage = new PrivateStorage(uploadDir);
  await storage.initialize();
  application = createApp({ database, config: { ...config, UPLOAD_DIR: uploadDir }, storage });
});

after(async () => {
  if (database) await database.end();
  await adminPool.query(`DROP DATABASE IF EXISTS "${uniqueDatabaseName}" WITH (FORCE)`);
  await adminPool.end();
  if (uploadDir) await rm(uploadDir, { recursive: true, force: true });
});

async function verifyLatestEmail(email: string) {
  const mail = await database.query<{ text_body: string }>(
    "SELECT text_body FROM email_outbox WHERE recipient=$1 ORDER BY id DESC LIMIT 1",
    [email],
  );
  const token = mail.rows[0]?.text_body.match(/token=([^\s]+)/)?.[1];
  assert.ok(token);
  const response = await request(application).post("/api/v1/auth/verify-email").send({ token: decodeURIComponent(token) });
  assert.equal(response.status, 200, response.text);
}

async function registerClient(email: string, taxId: string) {
  const response = await request(application).post("/api/v1/auth/register").send({
    name: `Cliente ${email}`,
    email,
    password: "Password-Seguro-2026",
    role: "cliente",
    taxId,
    privacyAccepted: true,
    termsAccepted: true,
  });
  assert.equal(response.status, 201, response.text);
  await verifyLatestEmail(email);
}

test("las fechas mensuales conservan el día ancla y la fecha de negocio usa Europe/Madrid", () => {
  assert.equal(nextOccurrenceDate("2026-01-31", "MENSUAL", 31), "2026-02-28");
  assert.equal(nextOccurrenceDate("2026-02-28", "MENSUAL", 31), "2026-03-31");
  assert.equal(nextOccurrenceDate("2028-01-31", "MENSUAL", 31), "2028-02-29");
  assert.equal(madridDateIso(new Date("2026-01-01T23:30:00Z")), "2026-01-02");
  assert.equal(madridDateIso(new Date("2026-07-01T22:30:00Z")), "2026-07-02");
});

test("flujo recurrente completo: onboarding, autorización, ofertas, visita, pausa y reanudación", async () => {
  const catalog = await request(application).get("/api/v1/assessments");
  assert.equal(catalog.status, 200, catalog.text);
  assert.ok(catalog.body.specialties.some((item: { slug: string }) => item.slug === "limpieza_profesional"));
  assert.ok(catalog.body.specialties.some((item: { slug: string }) => item.slug === "jardineria"));

  const publicAssessment = await request(application).get("/api/v1/assessments/limpieza_profesional");
  assert.equal(publicAssessment.status, 200, publicAssessment.text);
  assert.equal(publicAssessment.body.assessment.questionCount, 15);
  const assessment = publicAssessment.body.assessment as {
    version: string;
    questions: Array<{ id: string }>;
  };
  const answers = Object.fromEntries(assessment.questions.map((question, index) => [question.id, ["a", "b", "c"][index % 3]]));

  const professionalEmail = "limpieza-pro@example.es";
  const professionalRegister = await request(application).post("/api/v1/auth/register").send({
    name: "Ana Limpieza",
    email: professionalEmail,
    password: "Password-Seguro-2026",
    role: "profesional",
    taxId: "B12345674",
    companyName: "Limpieza Ana SL",
    phone: "+34600101010",
    specialty: "limpieza_profesional",
    assessment: { version: assessment.version, respuestas: answers },
    privacyAccepted: true,
    termsAccepted: true,
  });
  assert.equal(professionalRegister.status, 201, professionalRegister.text);
  await verifyLatestEmail(professionalEmail);

  await registerClient("home-owner@example.es", "12345678Z");
  await registerClient("other-owner@example.es", "00000000T");

  const professional = await database.query<{ id: string }>("SELECT id FROM users WHERE email=$1", [professionalEmail]);
  const professionalId = professional.rows[0]!.id;
  const qualification = await database.query<{ specialty_slug: string; verification_status: string }>(
    "SELECT specialty_slug,verification_status FROM professional_specialty_qualifications WHERE professional_id=$1",
    [professionalId],
  );
  assert.deepEqual(qualification.rows, [{ specialty_slug: "limpieza_profesional", verification_status: "PENDIENTE_REVISION" }]);

  const clientAgent = request.agent(application);
  assert.equal((await clientAgent.post("/api/v1/auth/login").send({ email: "home-owner@example.es", password: "Password-Seguro-2026" })).status, 200);
  const otherClientAgent = request.agent(application);
  assert.equal((await otherClientAgent.post("/api/v1/auth/login").send({ email: "other-owner@example.es", password: "Password-Seguro-2026" })).status, 200);
  const professionalAgent = request.agent(application);
  assert.equal((await professionalAgent.post("/api/v1/auth/login").send({ email: professionalEmail, password: "Password-Seguro-2026" })).status, 200);

  const today = madridDateIso();
  const serviceRequest = await clientAgent.post("/api/v1/home-services/requests").send({
    serviceSlug: "limpieza_hogar",
    location: "Linares, Jaén",
    propertyType: "PISO",
    squareMeters: 85,
    bedrooms: 3,
    bathrooms: 2,
    estimatedHours: 3,
    notes: "Limpieza recurrente de vivienda, cocina, baños y zonas comunes.",
    requestedStartDate: today,
    preferredTimeStart: "09:00",
    preferredTimeEnd: "12:00",
    frequency: "SEMANAL",
  });
  assert.equal(serviceRequest.status, 201, serviceRequest.text);
  const requestId = serviceRequest.body.request.id as string;

  const blockedMarket = await professionalAgent.get("/api/v1/home-services/requests");
  assert.equal(blockedMarket.status, 403, blockedMarket.text);

  await database.query("UPDATE users SET verification_status='APROBADO' WHERE id=$1", [professionalId]);
  await database.query("UPDATE professional_specialty_qualifications SET verification_status='APROBADO' WHERE professional_id=$1 AND specialty_slug='limpieza_profesional'", [professionalId]);

  const market = await professionalAgent.get("/api/v1/home-services/requests");
  assert.equal(market.status, 200, market.text);
  assert.ok(market.body.requests.some((item: { id: string }) => item.id === requestId));

  const offer = await professionalAgent.post(`/api/v1/home-services/requests/${requestId}/offers`).send({
    amountCentsPerVisit: 6500,
    estimatedDurationMinutes: 180,
    firstAvailableDate: today,
    message: "Incluye limpieza general, cocina, baños, suelos y repaso de superficies en cada visita.",
  });
  assert.equal(offer.status, 201, offer.text);
  const offerId = offer.body.offer.id as string;

  const hiddenOffers = await otherClientAgent.get(`/api/v1/home-services/requests/${requestId}/offers`);
  assert.equal(hiddenOffers.status, 404, hiddenOffers.text);

  const offers = await clientAgent.get(`/api/v1/home-services/requests/${requestId}/offers`);
  assert.equal(offers.status, 200, offers.text);
  assert.equal(offers.body.offers.length, 1);
  const visibleOffer = offers.body.offers[0] as Record<string, unknown>;
  assert.equal(visibleOffer.id, offerId);
  assert.equal("email" in visibleOffer, false);
  assert.equal("phone" in visibleOffer, false);
  assert.equal("tax_id" in visibleOffer, false);

  await database.query("UPDATE users SET account_status='SUSPENDIDO' WHERE id=$1", [professionalId]);
  const suspendedAccept = await clientAgent.post(`/api/v1/home-services/requests/${requestId}/offers/${offerId}/accept`);
  assert.equal(suspendedAccept.status, 409, suspendedAccept.text);
  await database.query("UPDATE users SET account_status='ACTIVO', verification_status='RECHAZADO' WHERE id=$1", [professionalId]);
  const rejectedAccept = await clientAgent.post(`/api/v1/home-services/requests/${requestId}/offers/${offerId}/accept`);
  assert.equal(rejectedAccept.status, 409, rejectedAccept.text);
  await database.query("UPDATE users SET verification_status='APROBADO' WHERE id=$1", [professionalId]);

  const accepted = await clientAgent.post(`/api/v1/home-services/requests/${requestId}/offers/${offerId}/accept`);
  assert.equal(accepted.status, 201, accepted.text);
  const engagementId = accepted.body.engagement.id as string;
  const firstVisitId = accepted.body.visit.id as string;
  assert.ok(accepted.body.visit.scheduledDate >= today);

  const prematureComplete = await professionalAgent.post(`/api/v1/home-services/visits/${firstVisitId}/complete`).send({ notes: "No debe completarse directamente." });
  assert.equal(prematureComplete.status, 409, prematureComplete.text);

  const started = await professionalAgent.post(`/api/v1/home-services/visits/${firstVisitId}/start`);
  assert.equal(started.status, 200, started.text);

  const pauseInProgress = await clientAgent.post(`/api/v1/home-services/engagements/${engagementId}/pause`);
  assert.equal(pauseInProgress.status, 409, pauseInProgress.text);
  const cancelInProgress = await clientAgent.post(`/api/v1/home-services/engagements/${engagementId}/cancel`).send({ reason: "Intento durante visita en curso." });
  assert.equal(cancelInProgress.status, 409, cancelInProgress.text);

  const completed = await professionalAgent.post(`/api/v1/home-services/visits/${firstVisitId}/complete`).send({ notes: "Servicio realizado correctamente." });
  assert.equal(completed.status, 200, completed.text);
  assert.equal(completed.body.engagementStatus, "ACTIVO");
  const nextVisitId = completed.body.nextVisit.id as string;
  assert.ok(completed.body.nextVisit.scheduledDate > today);

  const futureStart = await professionalAgent.post(`/api/v1/home-services/visits/${nextVisitId}/start`);
  assert.equal(futureStart.status, 409, futureStart.text);

  const paused = await clientAgent.post(`/api/v1/home-services/engagements/${engagementId}/pause`);
  assert.equal(paused.status, 200, paused.text);
  const afterPause = await database.query<{ status: string; count: string }>(
    "SELECT status,count(*)::text AS count FROM home_service_visits WHERE engagement_id=$1 GROUP BY status ORDER BY status",
    [engagementId],
  );
  assert.equal(afterPause.rows.some((row) => row.status === "PROGRAMADA"), false);
  assert.ok(afterPause.rows.some((row) => row.status === "CANCELADA_CLIENTE"));

  const resumed = await clientAgent.post(`/api/v1/home-services/engagements/${engagementId}/resume`);
  assert.equal(resumed.status, 200, resumed.text);
  const pending = await database.query<{ count: string }>(
    "SELECT count(*)::text AS count FROM home_service_visits WHERE engagement_id=$1 AND status='PROGRAMADA'",
    [engagementId],
  );
  assert.equal(pending.rows[0]!.count, "1");

  const appendOnlyEvent = await database.query<{ id: string }>("SELECT min(id)::text AS id FROM home_service_visit_events");
  assert.ok(appendOnlyEvent.rows[0]?.id);
  await assert.rejects(
    database.query("UPDATE home_service_visit_events SET metadata='{}'::jsonb WHERE id=$1", [appendOnlyEvent.rows[0]!.id]),
    /append-only/,
  );
});
