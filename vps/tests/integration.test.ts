import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, test } from "node:test";
import request from "supertest";
import { getPublicProfessionalAssessment } from "../../lib/professional-assessment.js";
import { createApp } from "../src/app.js";
import { loadConfig } from "../src/config.js";
import { createDatabase } from "../src/db.js";
import { migrate } from "../src/migrate.js";
import { PrivateStorage } from "../src/services/storage.js";

const databaseUrl = process.env.TEST_DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:5432/miconstructor_test";
const environment = {
  ...process.env,
  NODE_ENV: "test",
  APP_URL: "http://localhost:3200",
  DATABASE_URL: databaseUrl,
  SESSION_PEPPER: "s".repeat(32),
  TOKEN_PEPPER: "t".repeat(32),
  BILLING_JOB_SECRET: "b".repeat(32),
  ADMIN_EMAIL: "admin@miconstructor.es",
  REQUIRE_EXTERNAL_SERVICES: "false",
};
const config = loadConfig(environment);
const database = createDatabase(config);
let uploadDir = "";
let application: ReturnType<typeof createApp>;

before(async () => {
  Object.assign(process.env, environment);
  await migrate(databaseUrl);
  await database.query(`TRUNCATE TABLE
    messages, conversations, reviews, milestone_evidence, milestones,
    insurance_policies, portfolio_files, portfolio_projects, stored_files,
    billable_items, weekly_invoices, shortlists, proposals, projects,
    billing_accounts, professional_specialty_qualifications, auth_tokens,
    auth_sessions, email_outbox, audit_events, stripe_webhook_events, users
    RESTART IDENTITY CASCADE`);
  uploadDir = await mkdtemp(join(tmpdir(), "miconstructor-test-"));
  const storage = new PrivateStorage(uploadDir);
  await storage.initialize();
  application = createApp({ database, config: { ...config, UPLOAD_DIR: uploadDir }, storage });
});

after(async () => {
  await database.end();
  if (uploadDir) await rm(uploadDir, { recursive: true, force: true });
});

async function verifyLatestEmail(email: string) {
  const mail = await database.query<{ text_body: string }>(
    "SELECT text_body FROM email_outbox WHERE recipient = $1 ORDER BY id DESC LIMIT 1",
    [email],
  );
  const match = mail.rows[0]?.text_body.match(/token=([^\s]+)/);
  assert.ok(match?.[1]);
  const response = await request(application).post("/api/v1/auth/verify-email").send({ token: decodeURIComponent(match[1]) });
  assert.equal(response.status, 200);
}

test("flujo real: alta, verificación, propuesta, shortlist y cargo semanal pendiente", async () => {
  const clientEmail = "cliente@example.es";
  const professionalEmail = "electricista@example.es";
  const clientRegister = await request(application).post("/api/v1/auth/register").send({
    name: "María Cliente",
    email: clientEmail,
    password: "Password-Seguro-2026",
    role: "cliente",
    taxId: "12345678Z",
    privacyAccepted: true,
  });
  assert.equal(clientRegister.status, 201, clientRegister.text);
  await verifyLatestEmail(clientEmail);

  const assessment = getPublicProfessionalAssessment("electricidad");
  assert.ok(assessment);
  const answers = Object.fromEntries(assessment.questions.map((question, index) => [question.id, ["a", "b", "c"][index % 3]]));
  const professionalRegister = await request(application).post("/api/v1/auth/register").send({
    name: "Carlos Electricista",
    email: professionalEmail,
    password: "Password-Seguro-2026",
    role: "profesional",
    taxId: "B12345674",
    companyName: "Electricidad Carlos SL",
    phone: "+34600111222",
    specialty: "electricidad",
    assessment: { version: assessment.version, respuestas: answers },
    privacyAccepted: true,
  });
  assert.equal(professionalRegister.status, 201, professionalRegister.text);
  await verifyLatestEmail(professionalEmail);

  const professional = await database.query<{ id: string }>("SELECT id FROM users WHERE email = $1", [professionalEmail]);
  const professionalId = professional.rows[0]!.id;
  await database.query("UPDATE users SET verification_status = 'APROBADO' WHERE id = $1", [professionalId]);
  await database.query("UPDATE professional_specialty_qualifications SET verification_status = 'APROBADO' WHERE professional_id = $1", [professionalId]);
  await database.query("UPDATE billing_accounts SET status = 'ACTIVO', stripe_customer_id = 'cus_test', stripe_payment_method_id = 'pm_test' WHERE professional_id = $1", [professionalId]);

  const clientAgent = request.agent(application);
  const clientLogin = await clientAgent.post("/api/v1/auth/login").send({ email: clientEmail, password: "Password-Seguro-2026" });
  assert.equal(clientLogin.status, 200, clientLogin.text);
  const projectCreate = await clientAgent.post("/api/v1/projects").send({
    title: "Renovación eléctrica completa",
    description: "Sustitución completa de cableado, cuadro, mecanismos y certificado final de la instalación.",
    category: "electricidad",
    projectType: "bano",
    location: "Linares, Jaén",
    squareMeters: 10,
    qualityLevel: "estandar",
    budgetCents: 1_000_000,
  });
  assert.equal(projectCreate.status, 201, projectCreate.text);
  const projectId = projectCreate.body.project.id;

  const professionalAgent = request.agent(application);
  const professionalLogin = await professionalAgent.post("/api/v1/auth/login").send({ email: professionalEmail, password: "Password-Seguro-2026" });
  assert.equal(professionalLogin.status, 200, professionalLogin.text);
  const marketplace = await professionalAgent.get("/api/v1/projects");
  assert.equal(marketplace.status, 200);
  assert.equal(marketplace.body.projects.length, 1);
  const proposal = await professionalAgent.post("/api/v1/proposals").send({
    projectId,
    amountCents: 950_000,
    estimatedDays: 12,
    message: "Incluye nuevo cuadro, cableado, mecanismos, pruebas reglamentarias y certificado de instalación.",
  });
  assert.equal(proposal.status, 201, proposal.text);

  const shortlist = await clientAgent.post(`/api/v1/projects/${projectId}/shortlist`).send({ professionalId });
  assert.equal(shortlist.status, 201, shortlist.text);
  assert.equal(shortlist.body.contact.email, professionalEmail);
  assert.equal("feeCents" in shortlist.body, false);
  assert.equal("percentage" in shortlist.body, false);

  const billable = await database.query<{ amount_cents: string; status: string }>("SELECT amount_cents::text, status FROM billable_items WHERE professional_id = $1", [professionalId]);
  assert.deepEqual(billable.rows, [{ amount_cents: "40000", status: "PENDIENTE" }]);

  const duplicate = await clientAgent.post(`/api/v1/projects/${projectId}/shortlist`).send({ professionalId });
  assert.equal(duplicate.status, 200);
  const count = await database.query<{ count: string }>("SELECT count(*)::text AS count FROM billable_items WHERE professional_id = $1", [professionalId]);
  assert.equal(count.rows[0]!.count, "1");
});

test("las rutas privadas rechazan usuarios anónimos", async () => {
  const response = await request(application).get("/api/v1/projects");
  assert.equal(response.status, 401);
});
