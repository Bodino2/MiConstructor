import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, test } from "node:test";
import { Pool } from "pg";
import request from "supertest";
import type Stripe from "stripe";
import { getPublicProfessionalAssessment } from "../../lib/professional-assessment.js";
import { createApp } from "../src/app.js";
import { loadConfig } from "../src/config.js";
import { createDatabase } from "../src/db.js";
import { migrate } from "../src/migrate.js";
import { failSelectionCharge } from "../src/routes/billing.js";
import { PrivateStorage } from "../src/services/storage.js";

const source = process.env.TEST_DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:5432/miconstructor_test";
const name = `miconstructor_immediate_billing_${process.pid}_${randomUUID().replace(/-/g, "").slice(0, 8)}`;
const adminUrl = new URL(source); adminUrl.pathname = "/postgres";
const dbUrl = new URL(source); dbUrl.pathname = `/${name}`;
const adminPool = new Pool({ connectionString: adminUrl.toString() });
let database: ReturnType<typeof createDatabase>;
let application: ReturnType<typeof createApp>;
let uploadDir = "";

const paymentCalls: Array<{ params: Record<string, unknown>; idempotencyKey?: string }> = [];
let paymentStatus: "processing" | "succeeded" = "processing";
const fakeStripe = {
  paymentIntents: {
    create: async (params: Record<string, unknown>, options?: { idempotencyKey?: string }) => {
      paymentCalls.push({ params, idempotencyKey: options?.idempotencyKey });
      return {
        id: `pi_selection_${paymentCalls.length}`,
        status: paymentStatus,
        last_payment_error: null,
      };
    },
  },
} as unknown as Stripe;

const environment = {
  ...process.env,
  NODE_ENV: "test",
  APP_URL: "http://localhost:3200",
  DATABASE_URL: dbUrl.toString(),
  SESSION_PEPPER: "i".repeat(32),
  TOKEN_PEPPER: "m".repeat(32),
  BILLING_JOB_SECRET: "x".repeat(32),
  ADMIN_EMAIL: "admin@miconstructor.es",
  REQUIRE_EXTERNAL_SERVICES: "false",
};

before(async () => {
  await adminPool.query(`CREATE DATABASE "${name}"`);
  Object.assign(process.env, environment);
  await migrate(dbUrl.toString());
  const config = loadConfig(environment);
  database = createDatabase(config);
  uploadDir = await mkdtemp(join(tmpdir(), "miconstructor-immediate-billing-"));
  const storage = new PrivateStorage(uploadDir);
  await storage.initialize();
  application = createApp({ database, config: { ...config, UPLOAD_DIR: uploadDir }, storage, stripe: fakeStripe });
});

after(async () => {
  if (database) await database.end();
  await adminPool.query(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`);
  await adminPool.end();
  if (uploadDir) await rm(uploadDir, { recursive: true, force: true });
});

async function verify(email: string) {
  const mail = await database.query<{ text_body: string }>(
    "SELECT text_body FROM email_outbox WHERE recipient=$1 ORDER BY id DESC LIMIT 1",
    [email],
  );
  const token = mail.rows[0]?.text_body.match(/token=([^\s]+)/)?.[1];
  assert.ok(token);
  const verified = await request(application).post("/api/v1/auth/verify-email").send({ token: decodeURIComponent(token) });
  assert.equal(verified.status, 200, verified.text);
}

async function approveProfessional(professionalId: string) {
  await database.query(
    "UPDATE professional_specialty_qualifications SET verification_status='APROBADO', reviewed_at=now() WHERE professional_id=$1",
    [professionalId],
  );
  const identityFileId = randomUUID();
  const taxFileId = randomUUID();
  await database.query(
    `INSERT INTO stored_files
      (id, owner_id, purpose, object_key, original_name, content_type, size_bytes, sha256, moderation_status)
     VALUES
      ($1, $3, 'VERIFICACION_PROFESIONAL', $4, 'identidad.pdf', 'application/pdf', 1, $6, 'APROBADO'),
      ($2, $3, 'VERIFICACION_PROFESIONAL', $5, 'situacion-fiscal.pdf', 'application/pdf', 1, $6, 'APROBADO')`,
    [identityFileId, taxFileId, professionalId, `tests/${identityFileId}`, `tests/${taxFileId}`, "a".repeat(64)],
  );
  await database.query(
    `INSERT INTO professional_verification_documents
      (id, professional_id, file_id, document_type, status, reviewed_at)
     VALUES
      ($1, $3, $4, 'IDENTIDAD', 'APROBADO', now()),
      ($2, $3, $5, 'SITUACION_FISCAL', 'APROBADO', now())`,
    [randomUUID(), randomUUID(), professionalId, identityFileId, taxFileId],
  );
  await database.query("UPDATE users SET verification_status='APROBADO' WHERE id=$1", [professionalId]);
}

async function registerClient() {
  const email = "billing-client@example.es";
  const created = await request(application).post("/api/v1/auth/register").send({
    name: "Cliente Billing",
    email,
    password: "Password-Seguro-2026",
    role: "cliente",
    taxId: "12345678Z",
    privacyAccepted: true,
    termsAccepted: true,
  });
  assert.equal(created.status, 201, created.text);
  await verify(email);
  const agent = request.agent(application);
  const login = await agent.post("/api/v1/auth/login").send({ email, password: "Password-Seguro-2026" });
  assert.equal(login.status, 200, login.text);
  return agent;
}

async function registerProfessional(index: number, taxId: string) {
  const email = `billing-pro-${index}@example.es`;
  const assessment = getPublicProfessionalAssessment("electricidad");
  assert.ok(assessment);
  const answers = Object.fromEntries(assessment.questions.map((question, questionIndex) => [question.id, ["a", "b", "c"][questionIndex % 3]]));
  const created = await request(application).post("/api/v1/auth/register").send({
    name: `Profesional Billing ${index}`,
    email,
    password: "Password-Seguro-2026",
    role: "profesional",
    taxId,
    companyName: `Billing ${index} SL`,
    phone: `+34600100${index}0`,
    specialty: "electricidad",
    assessment: { version: assessment.version, respuestas: answers },
    privacyAccepted: true,
    termsAccepted: true,
  });
  assert.equal(created.status, 201, created.text);
  await verify(email);
  const user = await database.query<{ id: string }>("SELECT id FROM users WHERE email=$1", [email]);
  const id = user.rows[0]!.id;
  await approveProfessional(id);
  await database.query(
    `UPDATE billing_accounts
        SET status='ACTIVO', stripe_customer_id=$2, stripe_payment_method_id=$3, sepa_mandate_reference=$4
      WHERE professional_id=$1`,
    [id, `cus_pro_${index}`, `pm_pro_${index}`, `mandate_pro_${index}`],
  );
  const agent = request.agent(application);
  const login = await agent.post("/api/v1/auth/login").send({ email, password: "Password-Seguro-2026" });
  assert.equal(login.status, 200, login.text);
  return { id, email, agent };
}

test("solo el profesional seleccionado genera un cobro inmediato y nunca una factura semanal nueva", async () => {
  const client = await registerClient();
  const selectedProfessional = await registerProfessional(1, "B12345674");
  const unselectedProfessional = await registerProfessional(2, "00000000T");

  const project = await client.post("/api/v1/projects").send({
    title: "Instalación eléctrica vivienda",
    description: "Renovación de cuadro, cableado, mecanismos, pruebas y certificado final de toda la instalación.",
    category: "electricidad",
    projectType: "bano",
    location: "Linares, Jaén",
    squareMeters: 10,
    qualityLevel: "estandar",
    budgetCents: 1_000_000,
  });
  assert.equal(project.status, 201, project.text);
  const projectId = project.body.project.id as string;

  for (const professional of [selectedProfessional, unselectedProfessional]) {
    const proposal = await professional.agent.post("/api/v1/proposals").send({
      projectId,
      amountCents: 950_000,
      estimatedDays: 12,
      message: "Incluye cuadro eléctrico, cableado, mecanismos, pruebas reglamentarias y certificado de instalación.",
    });
    assert.equal(proposal.status, 201, proposal.text);
  }

  const selection = await client.post(`/api/v1/projects/${projectId}/shortlist`).send({ professionalId: selectedProfessional.id });
  assert.equal(selection.status, 201, selection.text);
  assert.equal(selection.body.contact.email, selectedProfessional.email);
  assert.equal("feeCents" in selection.body, false);
  assert.equal("percentage" in selection.body, false);

  assert.equal(paymentCalls.length, 1);
  assert.equal(paymentCalls[0]!.params.amount, 40_000);
  assert.equal(paymentCalls[0]!.params.customer, "cus_pro_1");
  assert.equal(paymentCalls[0]!.params.payment_method, "pm_pro_1");
  assert.equal((paymentCalls[0]!.params.metadata as Record<string, string>).professional_id, selectedProfessional.id);
  assert.match(paymentCalls[0]!.idempotencyKey || "", /^miconstructor-selection-/);

  const selectedCharge = await database.query<{
    id: string;
    amount_cents: string;
    status: string;
    stripe_payment_intent_id: string | null;
    invoice_id: string | null;
  }>(
    "SELECT id,amount_cents::text,status,stripe_payment_intent_id,invoice_id FROM billable_items WHERE professional_id=$1",
    [selectedProfessional.id],
  );
  assert.equal(selectedCharge.rows.length, 1);
  assert.equal(selectedCharge.rows[0]!.amount_cents, "40000");
  assert.equal(selectedCharge.rows[0]!.status, "PROCESANDO");
  assert.equal(selectedCharge.rows[0]!.stripe_payment_intent_id, "pi_selection_1");
  assert.equal(selectedCharge.rows[0]!.invoice_id, null);

  const unselectedCharges = await database.query<{ count: string }>(
    "SELECT count(*)::text AS count FROM billable_items WHERE professional_id=$1",
    [unselectedProfessional.id],
  );
  assert.equal(unselectedCharges.rows[0]!.count, "0");

  const weeklyInvoices = await database.query<{ count: string }>("SELECT count(*)::text AS count FROM weekly_invoices");
  assert.equal(weeklyInvoices.rows[0]!.count, "0");
  const weeklyJob = await request(application).post("/api/v1/jobs/weekly-billing").send({});
  assert.equal(weeklyJob.status, 410, weeklyJob.text);
  assert.equal(weeklyJob.body.billingMode, "IMMEDIATE_PER_SELECTION");

  const duplicate = await client.post(`/api/v1/projects/${projectId}/shortlist`).send({ professionalId: selectedProfessional.id });
  assert.equal(duplicate.status, 200, duplicate.text);
  assert.equal(duplicate.body.alreadySelected, true);
  assert.equal(paymentCalls.length, 1, "una selección duplicada no puede crear otro PaymentIntent");

  const billing = await selectedProfessional.agent.get("/api/v1/billing/me");
  assert.equal(billing.status, 200, billing.text);
  assert.equal(billing.body.charges.length, 1);
  assert.equal(billing.body.charges[0].status, "PROCESANDO");
  assert.equal(billing.body.legacyInvoices.length, 0);

  const chargeId = selectedCharge.rows[0]!.id;
  await failSelectionCharge(database, chargeId, "Adeudo rechazado de prueba");
  const suspended = await database.query<{ billing_status: string; verification_status: string; overdue: string }>(
    `SELECT b.status AS billing_status,u.verification_status,b.overdue_balance_cents::text AS overdue
       FROM billing_accounts b JOIN users u ON u.id=b.professional_id WHERE b.professional_id=$1`,
    [selectedProfessional.id],
  );
  assert.equal(suspended.rows[0]!.billing_status, "SUSPENDIDO_IMPAGO");
  assert.equal(suspended.rows[0]!.verification_status, "APROBADO");
  assert.equal(suspended.rows[0]!.overdue, "40000");

  paymentStatus = "succeeded";
  const retry = await selectedProfessional.agent.post(`/api/v1/billing/charges/${chargeId}/retry`).send({});
  assert.equal(retry.status, 200, retry.text);
  assert.equal(retry.body.status, "PAGADO");
  assert.equal(paymentCalls.length, 2);
  assert.match(paymentCalls[1]!.idempotencyKey || "", /attempt-1$/);

  const restored = await database.query<{ billing_status: string; verification_status: string; overdue: string; charge_status: string }>(
    `SELECT b.status AS billing_status,u.verification_status,b.overdue_balance_cents::text AS overdue,
            bi.status AS charge_status
       FROM billing_accounts b
       JOIN users u ON u.id=b.professional_id
       JOIN billable_items bi ON bi.professional_id=b.professional_id
      WHERE b.professional_id=$1`,
    [selectedProfessional.id],
  );
  assert.equal(restored.rows[0]!.billing_status, "ACTIVO");
  assert.equal(restored.rows[0]!.verification_status, "APROBADO");
  assert.equal(restored.rows[0]!.overdue, "0");
  assert.equal(restored.rows[0]!.charge_status, "PAGADO");
});
