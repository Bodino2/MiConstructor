import assert from "node:assert/strict";
import test from "node:test";
import {
  evaluateProfessionalAssessment,
  getProfessionalSpecialties,
  getPublicProfessionalAssessment,
} from "../lib/professional-assessment.js";
import {
  calculateShortlistFee,
  getPublicShortlistBillingPolicy,
} from "../lib/shortlist-pricing.js";
import { estimateProjectPrice } from "../lib/project-estimator.js";
import { billingAccountStateAfterCollection, previousWeeklyPeriod } from "../lib/weekly-billing.js";
import { inspectSensitiveContactData } from "../lib/sensitive-data-filter.js";

const assessment = getPublicProfessionalAssessment("electricidad");
const correctAnswers = Object.fromEntries(
  assessment.questions.map((question, index) => [question.id, ["a", "b", "c"][index % 3]]),
);

test("el test profesional exige las 15 respuestas técnicas y un mínimo del 80%", () => {
  const passed = evaluateProfessionalAssessment({
    especialidad: "electricidad",
    version: assessment.version,
    respuestas: correctAnswers,
  });
  assert.equal(passed.valid, true);
  assert.equal(passed.passed, true);
  assert.equal(passed.score, 100);

  const failedAnswers = { ...correctAnswers };
  assessment.questions.slice(0, 4).forEach((question, index) => {
    failedAnswers[question.id] = ["b", "c", "a"][index % 3];
  });
  const failed = evaluateProfessionalAssessment({
    especialidad: "electricidad",
    version: assessment.version,
    respuestas: failedAnswers,
  });
  assert.equal(failed.valid, true);
  assert.equal(failed.passed, false);
  assert.equal(failed.score, 73);

  const incomplete = evaluateProfessionalAssessment({
    especialidad: "electricidad",
    version: assessment.version,
    respuestas: { [assessment.questions[0].id]: "a" },
  });
  assert.equal(incomplete.valid, false);
  assert.equal(incomplete.passed, false);
});

test("cada oficio habilitado tiene un test propio de 15 preguntas sin respuestas expuestas", () => {
  const specialties = getProfessionalSpecialties();
  assert.equal(specialties.length, 6);
  for (const specialty of specialties) {
    const specialtyAssessment = getPublicProfessionalAssessment(specialty.slug);
    assert.equal(specialtyAssessment.passScore, 80);
    assert.equal(specialtyAssessment.specialty.slug, specialty.slug);
    assert.equal(specialtyAssessment.questions.length, 15);
    assert.equal(new Set(specialtyAssessment.questions.map((question) => question.id)).size, 15);
    assert.equal("correctOption" in specialtyAssessment.questions[0], false);
  }
});

test("aprobar un oficio no valida otro oficio", () => {
  const result = evaluateProfessionalAssessment({
    especialidad: "fontaneria",
    version: assessment.version,
    respuestas: correctAnswers,
  });
  assert.equal(result.valid, false);
  assert.equal(result.passed, false);
});

test("la tarifa de selección aplica 5%, 4% o 3% al presupuesto estimado", () => {
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

test("la política pública cobra solo al profesional seleccionado y no expone porcentajes", () => {
  const policy = getPublicShortlistBillingPolicy();
  assert.equal(policy.chargeTrigger, "CLIENT_SELECTS_PROFESSIONAL");
  assert.equal(policy.chargedParty, "SELECTED_PROFESSIONAL_ONLY");
  assert.equal(policy.frequency, "IMMEDIATE_PER_SELECTION");
  assert.equal(policy.collectionMethod, "SEPA_DIRECT_DEBIT_OFF_SESSION");
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
  assert.deepEqual(estimate.range, { minimum: 38_675, maximum: 52_325 });
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

test("la lógica histórica semanal sigue disponible solo para compatibilidad y el impago suspende", () => {
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
