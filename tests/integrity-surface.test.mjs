import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const shortlistRoute = new URL("../app/api/v1/proyectos/[id]/shortlist/route.ts", import.meta.url);

test("la shortlist D1 revalida proyecto, especialidad y propuesta", async () => {
  const source = await readFile(shortlistRoute, "utf8");
  assert.match(source, /project\.status !== "PUBLICADO"/);
  assert.doesNotMatch(source, /\["PUBLICADO", "EN_CURSO"\]/);
  assert.match(source, /getSpecialtySlugForProjectCategory/);
  assert.match(source, /professional_specialty_qualifications/);
  assert.match(source, /specialty_slug = \?2/);
  assert.match(source, /proposals[\s\S]*status = 'ENVIADA'/);
});

test("la respuesta de shortlist nu divulgă taxa din care se deduce procentul intern", async () => {
  const source = await readFile(shortlistRoute, "utf8");
  assert.doesNotMatch(source, /tarifaCentimos\s*:/);
  assert.doesNotMatch(source, /porcentaje\s*:/i);
  assert.doesNotMatch(source, /pricingVersion\s*:/);
});
