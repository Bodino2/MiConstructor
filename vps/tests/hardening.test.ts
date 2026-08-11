import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import test from "node:test";

const migrationsDir = new URL("../migrations/", import.meta.url);
const authPath = new URL("../src/services/auth.ts", import.meta.url);
const billingPath = new URL("../src/routes/billing.ts", import.meta.url);
const appPath = new URL("../src/app.ts", import.meta.url);

test("las migraciones VPS no reutilizan el mismo ordinal", async () => {
  const names = (await readdir(migrationsDir)).filter((name) => /^\d{3}_.+\.sql$/.test(name)).sort();
  const ordinals = names.map((name) => name.slice(0, 3));
  assert.equal(new Set(ordinals).size, ordinals.length, `Ordinal de migración duplicado: ${names.join(", ")}`);
});

test("ninguna migración posterior puede eliminar el propósito de verificación profesional", async () => {
  const names = (await readdir(migrationsDir)).filter((name) => name.endsWith(".sql")).sort();
  let verificationPurposeIntroduced = false;
  for (const name of names) {
    const sql = await readFile(new URL(name, migrationsDir), "utf8");
    if (sql.includes("VERIFICACION_PROFESIONAL")) verificationPurposeIntroduced = true;
    if (verificationPurposeIntroduced && /ADD CONSTRAINT stored_files_purpose_check/i.test(sql)) {
      assert.match(sql, /VERIFICACION_PROFESIONAL/, `${name} elimina VERIFICACION_PROFESIONAL del constraint de archivos`);
    }
  }
});

test("el gate de dominio protege aprobación, shortlist y contrato", async () => {
  const sql = await readFile(new URL("005_domain_integrity_hardening.sql", migrationsDir), "utf8");
  assert.match(sql, /miconstructor_professional_verification_ready/);
  assert.match(sql, /users_professional_verification_guard/);
  assert.match(sql, /shortlists_professional_eligibility_guard/);
  assert.match(sql, /work_contracts_professional_eligibility_guard/);
  assert.match(sql, /contract_shortlist_required/);
  assert.match(sql, /account_status = 'ACTIVO'/);
});

test("sesionesle actualizează last_seen atomic și nu pornesc query-uri neobservate", async () => {
  const auth = await readFile(authPath, "utf8");
  assert.match(auth, /WITH active_session AS/);
  assert.doesNotMatch(auth, /void database\.query/);
  assert.match(auth, /accountStatus !== "ACTIVO"/);
});

test("cobro inmediato conserva reintentos idempotentes y webhooks recuperables", async () => {
  const [billing, migration] = await Promise.all([
    readFile(billingPath, "utf8"),
    readFile(new URL("006_billing_reliability.sql", migrationsDir), "utf8"),
  ]);
  assert.match(migration, /processing_started_at/);
  assert.match(migration, /attempts integer/);
  assert.match(billing, /miconstructor-selection-\$\{charge\.chargeId\}-attempt-\$\{attempt\}/);
  assert.match(billing, /retry_count = \$2/);
  assert.match(billing, /stripe_webhook_events\.attempts \+ 1/);
  assert.match(billing, /processing_started_at = NULL, processing_error = \$2/);
  assert.match(billing, /miconstructor_professional_verification_ready/);
  assert.doesNotMatch(
    billing,
    /syncBillingAccountState[\s\S]{0,1800}SET verification_status = 'SUSPENDIDO'/,
  );
});

test("conflictele de integritate sunt expuse ca 409, nu ca eroare internă generică", async () => {
  const app = await readFile(appPath, "utf8");
  assert.match(app, /shortlist_professional_not_eligible/);
  assert.match(app, /contract_shortlist_required/);
  assert.match(app, /home_service_private_address_required/);
  assert.match(app, /professional_schedule_capacity_exceeded/);
  assert.match(app, /response\.status\(409\)/);
});
