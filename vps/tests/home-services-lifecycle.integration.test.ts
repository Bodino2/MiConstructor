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
const name = `miconstructor_lifecycle_${process.pid}_${randomUUID().replace(/-/g, "").slice(0, 8)}`;
const adminUrl = new URL(source); adminUrl.pathname = "/postgres";
const dbUrl = new URL(source); dbUrl.pathname = `/${name}`;
const adminPool = new Pool({ connectionString: adminUrl.toString() });
let database: ReturnType<typeof createDatabase>;
let application: ReturnType<typeof createApp>;
let uploadDir = "";
type TestAgent = ReturnType<typeof request.agent>;

before(async () => {
  await adminPool.query(`CREATE DATABASE "${name}"`);
  const env = { ...process.env, NODE_ENV: "test", APP_URL: "http://localhost:3200", DATABASE_URL: dbUrl.toString(), SESSION_PEPPER: "l".repeat(32), TOKEN_PEPPER: "c".repeat(32), BILLING_JOB_SECRET: "y".repeat(32), ADMIN_EMAIL: "admin@miconstructor.es", REQUIRE_EXTERNAL_SERVICES: "false" };
  Object.assign(process.env, env);
  await migrate(dbUrl.toString());
  const config = loadConfig(env);
  database = createDatabase(config);
  uploadDir = await mkdtemp(join(tmpdir(), "miconstructor-lifecycle-"));
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
  const row = await database.query<{ text_body: string }>("SELECT text_body FROM email_outbox WHERE recipient=$1 ORDER BY id DESC LIMIT 1", [email]);
  const token = row.rows[0]!.text_body.match(/token=([^\s]+)/)![1]!;
  assert.equal((await request(application).post("/api/v1/auth/verify-email").send({ token: decodeURIComponent(token) })).status, 200);
}

async function createClient(email: string, taxId: string) {
  const result = await request(application).post("/api/v1/auth/register").send({ name: email, email, password: "Password-Seguro-2026", role: "cliente", taxId, privacyAccepted: true, termsAccepted: true });
  assert.equal(result.status, 201, result.text); await verify(email);
}

async function createProfessional() {
  const email = "withdraw-pro@example.es";
  const assessment = (await request(application).get("/api/v1/assessments/limpieza_profesional")).body.assessment;
  const respuestas = Object.fromEntries(assessment.questions.map((question: { id: string }, index: number) => [question.id, ["a", "b", "c"][index % 3]]));
  const result = await request(application).post("/api/v1/auth/register").send({ name: "Pro Withdraw", email, password: "Password-Seguro-2026", role: "profesional", taxId: "B12345674", companyName: "Pro Withdraw SL", phone: "+34600202020", specialty: "limpieza_profesional", assessment: { version: assessment.version, respuestas }, privacyAccepted: true, termsAccepted: true });
  assert.equal(result.status, 201, result.text); await verify(email);
  const user = await database.query<{ id: string }>("SELECT id FROM users WHERE email=$1", [email]);
  await database.query("UPDATE users SET verification_status='APROBADO' WHERE id=$1", [user.rows[0]!.id]);
  await database.query("UPDATE professional_specialty_qualifications SET verification_status='APROBADO' WHERE professional_id=$1", [user.rows[0]!.id]);
  return email;
}

async function publish(agent: TestAgent) {
  const result = await agent.post("/api/v1/home-services/requests").send({ serviceSlug: "limpieza_hogar", location: "Linares, Jaén", propertyType: "PISO", squareMeters: 70, requestedStartDate: madridDateIso(), frequency: "PUNTUAL", notes: "Limpieza puntual completa de vivienda con cocina, baños y suelos." });
  assert.equal(result.status, 201, result.text); return result.body.request.id as string;
}

async function offer(agent: TestAgent, requestId: string) {
  const result = await agent.post(`/api/v1/home-services/requests/${requestId}/offers`).send({ amountCentsPerVisit: 5500, estimatedDurationMinutes: 150, firstAvailableDate: madridDateIso(), message: "Incluye limpieza de cocina, baños, suelos y superficies según el alcance solicitado." });
  assert.equal(result.status, 201, result.text); return result.body.offer.id as string;
}

test("cliente retira solicitud y profesional retira oferta sin dejar estados bloqueados", async () => {
  await createClient("withdraw-owner@example.es", "12345678Z");
  await createClient("withdraw-other@example.es", "00000000T");
  const professionalEmail = await createProfessional();
  const owner = request.agent(application); assert.equal((await owner.post("/api/v1/auth/login").send({ email: "withdraw-owner@example.es", password: "Password-Seguro-2026" })).status, 200);
  const other = request.agent(application); assert.equal((await other.post("/api/v1/auth/login").send({ email: "withdraw-other@example.es", password: "Password-Seguro-2026" })).status, 200);
  const professional = request.agent(application); assert.equal((await professional.post("/api/v1/auth/login").send({ email: professionalEmail, password: "Password-Seguro-2026" })).status, 200);

  const firstRequest = await publish(owner);
  const firstOffer = await offer(professional, firstRequest);
  const mine = await professional.get("/api/v1/home-services/my-offers");
  assert.equal(mine.status, 200, mine.text);
  assert.ok(mine.body.offers.some((item: { id: string; status: string }) => item.id === firstOffer && item.status === "ENVIADA"));

  const foreignCancel = await other.post(`/api/v1/home-services/requests/${firstRequest}/cancel`);
  assert.equal(foreignCancel.status, 404, foreignCancel.text);
  const withdrawn = await professional.post(`/api/v1/home-services/offers/${firstOffer}/withdraw`);
  assert.equal(withdrawn.status, 200, withdrawn.text);
  assert.equal((await professional.post(`/api/v1/home-services/offers/${firstOffer}/withdraw`)).status, 409);
  const cancelled = await owner.post(`/api/v1/home-services/requests/${firstRequest}/cancel`);
  assert.equal(cancelled.status, 200, cancelled.text);
  const firstState = await database.query<{ status: string }>("SELECT status FROM home_service_requests WHERE id=$1", [firstRequest]);
  assert.equal(firstState.rows[0]!.status, "CANCELADO");

  const secondRequest = await publish(owner);
  const secondOffer = await offer(professional, secondRequest);
  assert.equal((await owner.post(`/api/v1/home-services/requests/${secondRequest}/cancel`)).status, 200);
  const offerState = await database.query<{ status: string }>("SELECT status FROM home_service_offers WHERE id=$1", [secondOffer]);
  assert.equal(offerState.rows[0]!.status, "RECHAZADA");
  const lateOffer = await professional.post(`/api/v1/home-services/requests/${secondRequest}/offers`).send({ amountCentsPerVisit: 6000, estimatedDurationMinutes: 150, firstAvailableDate: madridDateIso(), message: "Esta oferta no debe aceptarse porque la solicitud ya fue retirada por el cliente." });
  assert.equal(lateOffer.status, 409, lateOffer.text);
});
