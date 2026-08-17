import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
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
import { hashPassword } from "../src/services/crypto.js";
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
    insurance_policies, portfolio_files, portfolio_projects,
    professional_verification_documents, stored_files,
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

async function approveProfessionalForTests(professionalId: string) {
  await database.query(
    "UPDATE professional_specialty_qualifications SET verification_status = 'APROBADO', reviewed_at = now() WHERE professional_id = $1",
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
  await database.query("UPDATE users SET verification_status = 'APROBADO' WHERE id = $1", [professionalId]);
  const status = await database.query<{ verification_status: string }>("SELECT verification_status FROM users WHERE id = $1", [professionalId]);
  assert.equal(status.rows[0]?.verification_status, "APROBADO");
}

test("flujo real: alta, verificación, propuesta, shortlist, contrato y cargo pendiente", async () => {
  const clientEmail = "cliente@example.es";
  const professionalEmail = "electricista@example.es";
  const clientRegister = await request(application).post("/api/v1/auth/register").send({
    name: "María Cliente",
    email: clientEmail,
    password: "Password-Seguro-2026",
    role: "cliente",
    taxId: "12345678Z",
    privacyAccepted: true,
    termsAccepted: true,
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
    termsAccepted: true,
  });
  assert.equal(professionalRegister.status, 201, professionalRegister.text);
  await verifyLatestEmail(professionalEmail);

  const acceptedTerms = await database.query<{ terms_version: string | null; terms_accepted_at: Date | null }>(
    "SELECT terms_version, terms_accepted_at FROM users WHERE email = $1",
    [clientEmail],
  );
  assert.equal(acceptedTerms.rows[0]?.terms_version, "2026-08-10");
  assert.ok(acceptedTerms.rows[0]?.terms_accepted_at);

  const professional = await database.query<{ id: string }>("SELECT id FROM users WHERE email = $1", [professionalEmail]);
  const professionalId = professional.rows[0]!.id;

  await database.query("UPDATE users SET verification_status = 'APROBADO' WHERE id = $1", [professionalId]);
  const prematureApproval = await database.query<{ verification_status: string }>(
    "SELECT verification_status FROM users WHERE id = $1",
    [professionalId],
  );
  assert.equal(prematureApproval.rows[0]?.verification_status, "PENDIENTE_REVISION");

  await approveProfessionalForTests(professionalId);
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
  const proposalId = proposal.body.proposal.id;

  await database.query(
    "UPDATE professional_specialty_qualifications SET verification_status = 'RECHAZADO' WHERE professional_id = $1 AND specialty_slug = 'electricidad'",
    [professionalId],
  );
  const staleShortlist = await clientAgent.post(`/api/v1/projects/${projectId}/shortlist`).send({ professionalId });
  assert.equal(staleShortlist.status, 409, staleShortlist.text);
  assert.match(staleShortlist.body.error, /ya no cumple los requisitos/);
  await database.query(
    "UPDATE professional_specialty_qualifications SET verification_status = 'APROBADO' WHERE professional_id = $1 AND specialty_slug = 'electricidad'",
    [professionalId],
  );

  const contractBeforeSelection = await clientAgent.post(`/api/v1/projects/${projectId}/contracts/accept`).send({
    proposalId,
    milestones: [{
      title: "Instalación completa",
      description: "Ejecución y certificación de la instalación eléctrica acordada.",
      amountCents: 950_000,
    }],
  });
  assert.equal(contractBeforeSelection.status, 409, contractBeforeSelection.text);
  assert.match(contractBeforeSelection.body.error, /seleccionar al profesional/);

  const shortlist = await clientAgent.post(`/api/v1/projects/${projectId}/shortlist`).send({ professionalId });
  assert.equal(shortlist.status, 201, shortlist.text);
  assert.equal(shortlist.body.contact.email, professionalEmail);
  assert.equal("feeCents" in shortlist.body, false);
  assert.equal("percentage" in shortlist.body, false);

  const billable = await database.query<{ amount_cents: string; status: string }>("SELECT amount_cents::text, status FROM billable_items WHERE professional_id = $1", [professionalId]);
  assert.deepEqual(billable.rows, [{ amount_cents: "21200", status: "PENDIENTE" }]);

  const duplicate = await clientAgent.post(`/api/v1/projects/${projectId}/shortlist`).send({ professionalId });
  assert.equal(duplicate.status, 200);
  const count = await database.query<{ count: string }>("SELECT count(*)::text AS count FROM billable_items WHERE professional_id = $1", [professionalId]);
  assert.equal(count.rows[0]!.count, "1");

  const contract = await clientAgent.post(`/api/v1/projects/${projectId}/contracts/accept`).send({
    proposalId,
    milestones: [{
      title: "Instalación completa",
      description: "Ejecución y certificación de la instalación eléctrica acordada.",
      amountCents: 950_000,
    }],
  });
  assert.equal(contract.status, 201, contract.text);
  assert.equal(contract.body.projectStatus, "EN_CURSO");
});

test("el panel admin controla cuentas y expone overview, proyectos y auditoría", async () => {
  const adminId = randomUUID();
  const targetId = randomUUID();
  const adminPassword = "Admin-Seguro-2026-Test";
  const targetPassword = "Cliente-Seguro-2026-Test";
  const [adminHash, targetHash] = await Promise.all([
    hashPassword(adminPassword, config.SESSION_PEPPER),
    hashPassword(targetPassword, config.SESSION_PEPPER),
  ]);

  await database.query(
    `INSERT INTO users
      (id, email, name, password_hash, role, tax_id, email_verified, account_status,
       verification_status, privacy_version, privacy_accepted_at)
     VALUES
      ($1, 'admin-test@miconstructor.es', 'Admin Test', $2, 'admin', $3, true, 'ACTIVO', 'NO_APLICA', 'test-v1', now()),
      ($4, 'cuenta-control@example.es', 'Cuenta Control', $5, 'cliente', $6, true, 'ACTIVO', 'NO_APLICA', 'test-v1', now())`,
    [adminId, adminHash, `ADMIN-${adminId}`, targetId, targetHash, `CLIENT-${targetId}`],
  );

  const anonymous = await request(application).get("/api/v1/admin/overview");
  assert.equal(anonymous.status, 401);

  const adminAgent = request.agent(application);
  const login = await adminAgent.post("/api/v1/auth/login").send({ email: "admin-test@miconstructor.es", password: adminPassword });
  assert.equal(login.status, 200, login.text);
  assert.equal(login.body.user.role, "admin");

  const overview = await adminAgent.get("/api/v1/admin/overview");
  assert.equal(overview.status, 200, overview.text);
  assert.ok(overview.body.usersTotal >= 2);
  assert.ok(overview.body.projectsTotal >= 1);

  const users = await adminAgent.get("/api/v1/admin/users?limit=200");
  assert.equal(users.status, 200, users.text);
  assert.ok(users.body.users.some((user: { id: string }) => user.id === targetId));

  const projects = await adminAgent.get("/api/v1/admin/projects?limit=200");
  assert.equal(projects.status, 200, projects.text);
  assert.ok(projects.body.projects.length >= 1);

  const cannotSuspendAdmin = await adminAgent.post(`/api/v1/admin/users/${adminId}/account-status`).send({
    action: "SUSPENDER",
    reason: "No debe permitirse suspender administradores desde el panel.",
  });
  assert.equal(cannotSuspendAdmin.status, 400);

  const suspended = await adminAgent.post(`/api/v1/admin/users/${targetId}/account-status`).send({
    action: "SUSPENDER",
    reason: "Suspensión controlada para validar el flujo administrativo.",
  });
  assert.equal(suspended.status, 200, suspended.text);
  assert.equal(suspended.body.status, "SUSPENDIDO");

  const blockedLogin = await request(application).post("/api/v1/auth/login").send({
    email: "cuenta-control@example.es",
    password: targetPassword,
  });
  assert.equal(blockedLogin.status, 423, blockedLogin.text);

  const auditLog = await adminAgent.get("/api/v1/admin/audit?limit=200");
  assert.equal(auditLog.status, 200, auditLog.text);
  assert.ok(auditLog.body.events.some((event: { action: string; entity_id: string }) => event.action === "USER_ACCOUNT_SUSPENDED" && event.entity_id === targetId));

  const reactivated = await adminAgent.post(`/api/v1/admin/users/${targetId}/account-status`).send({
    action: "REACTIVAR",
    reason: "Cuenta revisada y reactivada después de la comprobación.",
  });
  assert.equal(reactivated.status, 200, reactivated.text);
  assert.equal(reactivated.body.status, "ACTIVO");

  const restoredLogin = await request(application).post("/api/v1/auth/login").send({
    email: "cuenta-control@example.es",
    password: targetPassword,
  });
  assert.equal(restoredLogin.status, 200, restoredLogin.text);
});

test("aceptaciones legales, páginas públicas, mandato SEPA y chat de soporte", async () => {
  const rejected = await request(application).post("/api/v1/auth/register").send({
    name: "Sin Términos",
    email: "sin-terminos@example.es",
    password: "Password-Seguro-2026",
    role: "cliente",
    taxId: "12345678Z",
    privacyAccepted: true,
  });
  assert.equal(rejected.status, 400, rejected.text);
  assert.match(rejected.body.error, /Términos y Condiciones/);

  const publicConfig = await request(application).get("/api/v1/config");
  assert.equal(publicConfig.status, 200);
  assert.equal(publicConfig.body.contactEmail, "admin@miconstructor.es");
  assert.equal(publicConfig.body.termsVersion, "2026-08-10");

  for (const route of ["/aviso-legal", "/privacidad", "/cookies", "/terminos", "/sepa", "/contacto"]) {
    const page = await request(application).get(route);
    assert.equal(page.status, 200, route);
    assert.match(page.text, /site-shell\.js/);
  }

  const userId = randomUUID();
  const adminId = randomUUID();
  const professionalId = randomUUID();
  const userPassword = "Support-User-2026-Test";
  const adminPassword = "Support-Admin-2026-Test";
  const professionalPassword = "Support-Pro-2026-Test";
  const [userHash, adminHash, professionalHash] = await Promise.all([
    hashPassword(userPassword, config.SESSION_PEPPER),
    hashPassword(adminPassword, config.SESSION_PEPPER),
    hashPassword(professionalPassword, config.SESSION_PEPPER),
  ]);

  await database.query(
    `INSERT INTO users
      (id, email, name, password_hash, role, tax_id, email_verified, account_status,
       verification_status, privacy_version, privacy_accepted_at)
     VALUES
      ($1, 'support-user@example.es', 'Support User', $2, 'cliente', $3, true, 'ACTIVO', 'NO_APLICA', 'test-v1', now()),
      ($4, 'support-admin@miconstructor.es', 'Support Admin', $5, 'admin', $6, true, 'ACTIVO', 'NO_APLICA', 'test-v1', now()),
      ($7, 'support-pro@example.es', 'Support Pro', $8, 'profesional', $9, true, 'ACTIVO', 'PENDIENTE_REVISION', 'test-v1', now())`,
    [userId, userHash, `CLIENT-${userId}`, adminId, adminHash, `ADMIN-${adminId}`, professionalId, professionalHash, `PRO-${professionalId}`],
  );
  await database.query("INSERT INTO billing_accounts (professional_id, status) VALUES ($1, 'PENDIENTE_MANDATO')", [professionalId]);

  const userAgent = request.agent(application);
  const userLogin = await userAgent.post("/api/v1/auth/login").send({ email: "support-user@example.es", password: userPassword });
  assert.equal(userLogin.status, 200, userLogin.text);
  const sent = await userAgent.post("/api/v1/support/messages").send({ body: "Necesito ayuda con mi proyecto." });
  assert.equal(sent.status, 201, sent.text);

  const adminAgent = request.agent(application);
  const adminLogin = await adminAgent.post("/api/v1/auth/login").send({ email: "support-admin@miconstructor.es", password: adminPassword });
  assert.equal(adminLogin.status, 200, adminLogin.text);
  const threads = await adminAgent.get("/api/v1/support/admin/threads");
  assert.equal(threads.status, 200, threads.text);
  assert.ok(threads.body.threads.some((thread: { user_id: string }) => thread.user_id === userId));
  const adminReply = await adminAgent.post(`/api/v1/support/admin/threads/${userId}/messages`).send({ body: "Hemos recibido tu consulta y la revisamos." });
  assert.equal(adminReply.status, 201, adminReply.text);
  const conversation = await userAgent.get("/api/v1/support/messages");
  assert.equal(conversation.status, 200, conversation.text);
  assert.equal(conversation.body.messages.length, 2);

  const professionalAgent = request.agent(application);
  const professionalLogin = await professionalAgent.post("/api/v1/auth/login").send({ email: "support-pro@example.es", password: professionalPassword });
  assert.equal(professionalLogin.status, 200, professionalLogin.text);
  const noSepaAcceptance = await professionalAgent.post("/api/v1/billing/setup-intent").send({});
  assert.equal(noSepaAcceptance.status, 400, noSepaAcceptance.text);
  const acceptedSepa = await professionalAgent.post("/api/v1/billing/setup-intent").send({ termsAccepted: true });
  assert.equal(acceptedSepa.status, 503, acceptedSepa.text);
  const sepaStored = await database.query<{ sepa_terms_version: string | null; sepa_terms_accepted_at: Date | null }>(
    "SELECT sepa_terms_version, sepa_terms_accepted_at FROM billing_accounts WHERE professional_id = $1",
    [professionalId],
  );
  assert.equal(sepaStored.rows[0]?.sepa_terms_version, "2026-08-10");
  assert.ok(sepaStored.rows[0]?.sepa_terms_accepted_at);
});

test("las rutas privadas rechazan usuarios anónimos", async () => {
  const response = await request(application).get("/api/v1/projects");
  assert.equal(response.status, 401);
});
