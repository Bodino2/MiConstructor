import assert from "node:assert/strict";
import test from "node:test";
import {
  evaluateProfessionalAssessment,
  getPublicProfessionalAssessment,
  PROFESSIONAL_ASSESSMENT_VERSION,
} from "../lib/professional-assessment.js";
import {
  calculateShortlistFee,
  getPublicShortlistBillingPolicy,
} from "../lib/shortlist-pricing.js";
import { estimateProjectPrice } from "../lib/project-estimator.js";
import { billingAccountStateAfterCollection, previousWeeklyPeriod } from "../lib/weekly-billing.js";
import { inspectSensitiveContactData } from "../lib/sensitive-data-filter.js";

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

test("la tarifa de shortlist aplica 5%, 4% o 3% al presupuesto estimado", () => {
  assert.deepEqual(
    { fee: calculateShortlistFee(100_000).feeCents, rate: calculateShortlistFee(100_000).rate },
    { fee: 5_000, rate: 0.05 },
  );
  assert.equal(calculateShortlistFee(150_000).feeCents, 7_500);
  assert.deepEqual(
    { fee: calculateShortlistFee(150_001).feeCents, rate: calculateShortlistFee(150_001).rate },
    { fee: 6_000, rate: 0.04 },
  );
  assert.equal(calculateShortlistFee(500_000).feeCents, 20_000);
  assert.equal(calculateShortlistFee(1_000_000).feeCents, 40_000);
  assert.deepEqual(
    { fee: calculateShortlistFee(1_000_001).feeCents, rate: calculateShortlistFee(1_000_001).rate },
    { fee: 30_000, rate: 0.03 },
  );
  assert.equal(calculateShortlistFee(2_000_000).feeCents, 60_000);
  assert.equal(calculateShortlistFee(0).valid, false);
});

test("la política pública no expone porcentajes ni coeficientes internos", () => {
  const policy = getPublicShortlistBillingPolicy();
  assert.equal(policy.frequency, "WEEKLY");
  assert.equal(policy.collectionMethod, "SEPA_DIRECT_DEBIT");
  assert.equal("tiers" in policy, false);
  assert.equal("percentage" in policy, false);
  assert.equal("rate" in policy, false);
});

test("el estimador devuelve rango y partidas que cuadran con el total", () => {
  const estimate = estimateProjectPrice({
    projectType: "reforma_integral",
    squareMeters: 70,
    qualityLevel: "estandar",
  });
  assert.equal(estimate.valid, true);
  assert.deepEqual(estimate.range, { minimum: 32_200, maximum: 45_500 });
  const minimumParts = Object.values(estimate.breakdown).reduce(
    (sum, item) => sum + item.minimum,
    0,
  );
  const maximumParts = Object.values(estimate.breakdown).reduce(
    (sum, item) => sum + item.maximum,
    0,
  );
  assert.equal(minimumParts, estimate.range.minimum);
  assert.equal(maximumParts, estimate.range.maximum);
  assert.equal(estimateProjectPrice({ projectType: "x", squareMeters: 70, qualityLevel: "estandar" }).valid, false);
});

test("la semana de facturación cierra el lunes y el impago suspende", () => {
  assert.deepEqual(previousWeeklyPeriod(new Date("2026-08-12T10:00:00Z")), {
    start: "2026-08-03T00:00:00.000Z",
    end: "2026-08-10T00:00:00.000Z",
  });
  assert.equal(
    billingAccountStateAfterCollection({ status: "FALLIDA", overdueBalanceCents: 200 }).shouldBlockAccess,
    true,
  );
  assert.equal(
    billingAccountStateAfterCollection({ status: "PAGADA", overdueBalanceCents: 0 }).billingStatus,
    "ACTIVO",
  );
});

test("el chat bloquea datos de contacto antes del desbloqueo", () => {
  assert.equal(inspectSensitiveContactData("Escríbeme a obra@example.com").blocked, true);
  assert.equal(inspectSensitiveContactData("Mi IBAN es ES91 2100 0418 4502 0005 1332").blocked, true);
  assert.equal(inspectSensitiveContactData("He terminado la instalación del salón").blocked, false);
});
