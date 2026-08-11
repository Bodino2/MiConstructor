import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const shortlistRoute = new URL("../app/api/v1/proyectos/[id]/shortlist/route.ts", import.meta.url);
const quoteRoute = new URL("../app/api/v1/presupuestos/route.ts", import.meta.url);
const contractRoute = new URL("../app/api/v1/proyectos/[id]/contrato/route.ts", import.meta.url);

test("la shortlist D1 revalida proyecto, especialidad y propuesta", async () => {
  const source = await readFile(shortlistRoute, "utf8");
  assert.match(source, /project\.status !== "PUBLICADO"/);
  assert.doesNotMatch(source, /\["PUBLICADO", "EN_CURSO"\]/);
  assert.match(source, /getSpecialtySlugForProjectCategory/);
  assert.match(source, /professional_specialty_qualifications/);
  assert.match(source, /specialty_slug = \?2/);
  assert.match(source, /proposals[\s\S]*status = 'ENVIADA'/);
});

test("la respuesta de shortlist no divulga la tarifa que revela el porcentaje interno", async () => {
  const source = await readFile(shortlistRoute, "utf8");
  assert.doesNotMatch(source, /tarifaCentimos\s*:/);
  assert.doesNotMatch(source, /porcentaje\s*:/i);
  assert.doesNotMatch(source, /pricingVersion\s*:/);
});

test("el presupuesto estructurado exige especialidad exacta y limpia inserciones parciales", async () => {
  const source = await readFile(quoteRoute, "utf8");
  assert.match(source, /getSpecialtySlugForProjectCategory/);
  assert.match(source, /professional_specialty_qualifications/);
  assert.match(source, /specialty_slug = \?2/);
  assert.match(source, /DELETE FROM structured_quote_items/);
  assert.match(source, /DELETE FROM structured_quotes/);
  assert.match(source, /La vigencia del presupuesto no puede estar vencida/);
});

test("el contrato D1 exige shortlist y revalida profesional antes de congelar el PDF", async () => {
  const source = await readFile(contractRoute, "utf8");
  assert.match(source, /project_shortlists/);
  assert.match(source, /contact_unlocked_at IS NOT NULL/);
  assert.match(source, /professional_specialty_qualifications/);
  assert.match(source, /professional_billing_accounts/);
  assert.match(source, /El presupuesto ha caducado/);
  assert.match(source, /getR2\(\)\.delete\(objectKey\)/);
  assert.match(source, /DELETE FROM work_contracts/);
  assert.match(source, /status = 'PUBLICADO'/);
});
