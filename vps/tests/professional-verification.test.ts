import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migrationPath = new URL("../migrations/004_professional_verification_documents.sql", import.meta.url);
const routePath = new URL("../src/routes/professional-verification.ts", import.meta.url);
const indexPath = new URL("../public/index.html", import.meta.url);
const uiPath = new URL("../public/professional-verification-ui.js", import.meta.url);

test("la verificación profesional conserva documentos auditables por tipo", async () => {
  const migration = await readFile(migrationPath, "utf8");
  assert.match(migration, /professional_verification_documents/);
  assert.match(migration, /'IDENTIDAD'/);
  assert.match(migration, /'SITUACION_FISCAL'/);
  assert.match(migration, /'VERIFICACION_PROFESIONAL'/);
  assert.match(migration, /reviewed_by uuid REFERENCES users/);
});

test("la aprobación técnica queda ligada a la verificación documental sin levantar suspensiones ajenas", async () => {
  const route = await readFile(routePath, "utf8");
  assert.match(route, /documentsApproved: Number\(row\?\.approved_document_count/);
  assert.match(route, /qualificationApproved: Boolean\(row\?\.has_approved_qualification\)/);
  assert.match(route, /const approved = readiness\.documentsApproved && readiness\.qualificationApproved/);
  assert.match(route, /\/admin\/qualifications\/:id\/decision/);
  assert.match(route, /const wasSuspended = existing\.verification_status === "SUSPENDIDO"/);
  assert.match(route, /explicitlyReapprovingSuspendedQualification/);
  assert.match(route, /!explicitlyReapprovingSuspendedQualification/);
});

test("el profesional debe enviar identidad y situación fiscal en el mismo paquete", async () => {
  const route = await readFile(routePath, "utf8");
  assert.match(route, /name: "identity", maxCount: 1/);
  assert.match(route, /name: "taxStatus", maxCount: 1/);
  assert.match(route, /if \(!identity \|\| !taxStatus\)/);
  assert.match(route, /PROFESSIONAL_VERIFICATION_DOCUMENTS_SUBMITTED/);
});

test("web carga el panel documental para profesional y administrador", async () => {
  const [index, ui] = await Promise.all([
    readFile(indexPath, "utf8"),
    readFile(uiPath, "utf8"),
  ]);
  assert.match(index, /professional-verification-ui\.js/);
  assert.match(ui, /professional-verification-form/);
  assert.match(ui, /\/api\/v1\/professionals\/verification-documents/);
  assert.match(ui, /\/api\/v1\/admin\/verification-documents/);
  assert.match(ui, /La cuenta solo queda aprobada cuando coinciden test técnico aprobado y ambos documentos aprobados/);
});
