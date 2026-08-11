import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, test } from "node:test";
import { Pool } from "pg";
import request from "supertest";
import { madridDateIso } from "../../lib/home-service-catalog.js";
import { createApp } from "../src/app.js";
import { loadConfig } from "../src/config.js";
import { createDatabase } from "../src/db.js";
import { migrate } from "../src/migrate.js";
import { PrivateStorage } from "../src/services/storage.js";

const source = process.env.TEST_DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:5432/miconstructor_test";
const name = `miconstructor_capacity_${process.pid}_${randomUUID().replace(/-/g, "").slice(0, 8)}`;
const adminUrl = new URL(source); adminUrl.pathname = "/postgres";
const dbUrl = new URL(source); dbUrl.pathname = `/${name}`;
const adminPool = new Pool({ connectionString: adminUrl.toString() });
let database: ReturnType<typeof createDatabase>;
let application: ReturnType<typeof createApp>;
let uploadDir = "";
type Agent = ReturnType<typeof request.agent>;

before(async () => {
  await adminPool.query(`CREATE DATABASE "${name}"`);
  const env = { ...process.env, NODE_ENV: "test", APP_URL: "http://localhost:3200", DATABASE_URL: dbUrl.toString(), SESSION_PEPPER: "q".repeat(32), TOKEN_PEPPER: "w".repeat(32), BILLING_JOB_SECRET: "e".repeat(32), ADMIN_EMAIL: "admin@miconstructor.es", REQUIRE_EXTERNAL_SERVICES: "false" };
  Object.assign(process.env, env);
  await migrate(dbUrl.toString());
  const config = loadConfig(env);
  database = createDatabase(config);
  uploadDir = await mkdtemp(join(tmpdir(), "miconstructor-capacity-"));
  const storage = new PrivateStorage(uploadDir); await storage.initialize();
  application = createApp({ database, config: { ...config, UPLOAD_DIR: uploadDir }, storage });
});

after(async () => {
  if (database) await database.end();
  await adminPool.query(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`);
  await adminPool.end();
  if (uploadDir) await rm(uploadDir, { recursive: true, force: true });
});

async function verify(email: string) {
  const mail = await database.query<{ text_body: string }>("SELECT text_body FROM email_outbox WHERE recipient=$1 ORDER BY id DESC LIMIT 1", [email]);
  const token = mail.rows[0]!.text_body.match(/token=([^\s]+)/)![1]!;
  const verified = await request(application).post("/api/v1/auth/verify-email").send({ token: decodeURIComponent(token) });
  assert.equal(verified.status, 200, verified.text);
}

async function createClient(email: string, taxId: string) {
  const result = await request(application).post("/api/v1/auth/register").send({ name: email, email, password: "Password-Seguro-2026", role: "cliente", taxId, privacyAccepted: true, termsAccepted: true });
  assert.equal(result.status, 201, result.text); await verify(email);
  const agent = request.agent(application);
  assert.equal((await agent.post("/api/v1/auth/login").send({ email, password: "Password-Seguro-2026" })).status, 200);
  return agent;
}

async function createProfessional() {
  const email = "capacity-pro@example.es";
  const assessment = (await request(application).get("/api/v1/assessments/limpieza_profesional")).body.assessment;
  const respuestas = Object.fromEntries(assessment.questions.map((question: { id: string }, index: number) => [question.id, ["a", "b", "c"][index % 3]]));
  const result = await request(application).post("/api/v1/auth/register").send({ name: "Equipo Capacidad", email, password: "Password-Seguro-2026", role: "profesional", taxId: "B12345674", companyName: "Equipo Capacidad SL", phone: "+34600303030", specialty: "limpieza_profesional", assessment: { version: assessment.version, respuestas }, privacyAccepted: true, termsAccepted: true });
  assert.equal(result.status, 201, result.text); await verify(email);
  const user = await database.query<{ id: string }>("SELECT id FROM users WHERE email=$1", [email]);
  const id = user.rows[0]!.id;
  await database.query("UPDATE users SET verification_status='APROBADO' WHERE id=$1", [id]);
  await database.query("UPDATE professional_specialty_qualifications SET verification_status='APROBADO' WHERE professional_id=$1", [id]);
  const agent = request.agent(application);
  assert.equal((await agent.post("/api/v1/auth/login").send({ email, password: "Password-Seguro-2026" })).status, 200);
  return { agent, id };
}

async function publish(client: Agent) {
  const result = await client.post("/api/v1/home-services/requests").send({
    serviceSlug: "limpieza_hogar",
    location: "Linares, Jaén",
    propertyType: "PISO",
    squareMeters: 80,
    requestedStartDate: madridDateIso(),
    preferredTimeStart: "09:00",
    preferredTimeEnd: "12:00",
    frequency: "PUNTUAL",
    notes: "Limpieza general de vivienda con cocina, baños, suelos y superficies.",
  });
  assert.equal(result.status, 201, result.text);
  return result.body.request.id as string;
}

async function makeOffer(professional: Agent, requestId: string) {
  const result = await professional.post(`/api/v1/home-services/requests/${requestId}/offers`).send({
    amountCentsPerVisit: 6000,
    estimatedDurationMinutes: 180,
    firstAvailableDate: madridDateIso(),
    message: "Servicio de tres horas con limpieza general de cocina, baños, suelos y superficies.",
  });
  assert.equal(result.status, 201, result.text);
  return result.body.offer.id as string;
}

test("la base de datos bloquea solapes por capacidad y hace rollback de la aceptación", async () => {
  const firstClient = await createClient("capacity-owner-a@example.es", "12345678Z");
  const secondClient = await createClient("capacity-owner-b@example.es", "00000000T");
  const professional = await createProfessional();

  const firstRequest = await publish(firstClient);
  const secondRequest = await publish(secondClient);
  const firstOffer = await makeOffer(professional.agent, firstRequest);
  const secondOffer = await makeOffer(professional.agent, secondRequest);

  const firstAccept = await firstClient.post(`/api/v1/home-services/requests/${firstRequest}/offers/${firstOffer}/accept`);
  assert.equal(firstAccept.status, 201, firstAccept.text);

  const blocked = await secondClient.post(`/api/v1/home-services/requests/${secondRequest}/offers/${secondOffer}/accept`);
  assert.equal(blocked.status, 409, blocked.text);
  assert.match(blocked.body.error, /capacidad/i);

  const afterBlock = await database.query<{ status: string; assigned_professional_id: string | null }>(
    "SELECT status,assigned_professional_id FROM home_service_requests WHERE id=$1",
    [secondRequest],
  );
  assert.equal(afterBlock.rows[0]!.status, "PUBLICADO");
  assert.equal(afterBlock.rows[0]!.assigned_professional_id, null);
  const secondOfferState = await database.query<{ status: string }>("SELECT status FROM home_service_offers WHERE id=$1", [secondOffer]);
  assert.equal(secondOfferState.rows[0]!.status, "ENVIADA");
  const engagementCount = await database.query<{ count: string }>("SELECT count(*)::text AS count FROM home_service_engagements WHERE request_id=$1", [secondRequest]);
  assert.equal(engagementCount.rows[0]!.count, "0");

  await database.query(
    `INSERT INTO professional_availability (professional_id, concurrent_capacity, travel_radius_km, service_areas)
     VALUES ($1,2,50,ARRAY['Linares'])
     ON CONFLICT (professional_id) DO UPDATE SET concurrent_capacity=2, updated_at=now()`,
    [professional.id],
  );

  const allowed = await secondClient.post(`/api/v1/home-services/requests/${secondRequest}/offers/${secondOffer}/accept`);
  assert.equal(allowed.status, 201, allowed.text);
  const concurrent = await database.query<{ count: string }>(
    `SELECT count(*)::text AS count
       FROM home_service_visits v
       JOIN home_service_engagements e ON e.id=v.engagement_id
      WHERE e.professional_id=$1 AND v.scheduled_date=$2::date AND v.scheduled_time='09:00' AND v.status='PROGRAMADA'`,
    [professional.id, madridDateIso()],
  );
  assert.equal(concurrent.rows[0]!.count, "2");
});
