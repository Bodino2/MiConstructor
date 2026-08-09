import assert from "node:assert/strict";
import test from "node:test";
import {
  evaluateProfessionalAssessment,
  getPublicProfessionalAssessment,
  PROFESSIONAL_ASSESSMENT_VERSION,
} from "../lib/professional-assessment.js";
import { calculateShortlistFee } from "../lib/shortlist-pricing.js";

const correctAnswers = {
  alcance: "b",
  imprevisto: "b",
  evidencia: "a",
  liberacion: "b",
  seguridad: "a",
};

test("el test profesional exige todas las respuestas y un mínimo del 80%", () => {
  const passed = evaluateProfessionalAssessment({
    version: PROFESSIONAL_ASSESSMENT_VERSION,
    respuestas: correctAnswers,
  });
  assert.equal(passed.valid, true);
  assert.equal(passed.passed, true);
  assert.equal(passed.score, 100);

  const failed = evaluateProfessionalAssessment({
    version: PROFESSIONAL_ASSESSMENT_VERSION,
    respuestas: { ...correctAnswers, alcance: "a", imprevisto: "a" },
  });
  assert.equal(failed.valid, true);
  assert.equal(failed.passed, false);
  assert.equal(failed.score, 60);

  const incomplete = evaluateProfessionalAssessment({
    version: PROFESSIONAL_ASSESSMENT_VERSION,
    respuestas: { alcance: "b" },
  });
  assert.equal(incomplete.valid, false);
  assert.equal(incomplete.passed, false);
});

test("la API pública del test no expone las respuestas correctas", () => {
  const assessment = getPublicProfessionalAssessment();
  assert.equal(assessment.passScore, 80);
  assert.equal(assessment.questions.length, 5);
  assert.equal("correctOption" in assessment.questions[0], false);
});

test("la tarifa de shortlist usa el presupuesto estimado y nunca la obra final", () => {
  assert.equal(calculateShortlistFee(200_000).feeCents, 890);
  assert.equal(calculateShortlistFee(1_200_000).feeCents, 2_490);
  assert.equal(calculateShortlistFee(4_250_000).feeCents, 5_990);
  assert.equal(calculateShortlistFee(10_000_000).feeCents, 10_000);
  assert.equal(calculateShortlistFee(50_000_000).feeCents, 14_990);
  assert.equal(calculateShortlistFee(0).valid, false);
});
