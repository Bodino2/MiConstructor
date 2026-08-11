import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  availabilityFit,
  calculateProjectMatchScore,
  calculateVerifiedProfessionalScore,
  capacityFit,
  locationFit,
} from "../src/services/professional-ranking.js";

const migrationPath = new URL("../migrations/004_operating_system_core.sql", import.meta.url);
const routePath = new URL("../src/routes/operating-system.ts", import.meta.url);

test("MiConstructor Verified Score rewards only verified evidence", () => {
  const excellent = calculateVerifiedProfessionalScore({
    accountVerified: true,
    qualificationApproved: true,
    technicalScore: 100,
    insured: true,
    completedProjects: 5,
    reviewAverage: 5,
    reviewCount: 5,
  });
  assert.equal(excellent.total, 100);
  assert.equal(excellent.level, "EXCELENTE");
  assert.deepEqual(excellent.components, { identity: 25, technical: 20, insurance: 15, experience: 20, reputation: 20 });

  const unverified = calculateVerifiedProfessionalScore({
    accountVerified: false,
    qualificationApproved: false,
    technicalScore: 100,
    insured: false,
    completedProjects: 0,
    reviewAverage: 5,
    reviewCount: 0,
  });
  assert.equal(unverified.total, 0);
  assert.equal(unverified.level, "INICIAL");
});

test("reviews need transaction history before they dominate reputation", () => {
  const oneReview = calculateVerifiedProfessionalScore({
    accountVerified: true,
    qualificationApproved: true,
    technicalScore: 90,
    insured: true,
    completedProjects: 1,
    reviewAverage: 5,
    reviewCount: 1,
  });
  const fiveReviews = calculateVerifiedProfessionalScore({
    accountVerified: true,
    qualificationApproved: true,
    technicalScore: 90,
    insured: true,
    completedProjects: 1,
    reviewAverage: 5,
    reviewCount: 5,
  });
  assert.equal(oneReview.components.reputation, 4);
  assert.equal(fiveReviews.components.reputation, 20);
  assert.ok(fiveReviews.total > oneReview.total);
});

test("smart matching considers location, availability and real capacity", () => {
  assert.equal(locationFit("Linares, Jaén", ["Jaen", "Úbeda"]), 100);
  assert.equal(locationFit("Linares, Jaén", []), 60);
  assert.equal(availabilityFit("2020-01-01", new Date("2026-08-11T00:00:00Z")), 100);
  assert.equal(availabilityFit("2026-08-20", new Date("2026-08-11T00:00:00Z")), 85);
  assert.equal(capacityFit(0, 2), 100);
  assert.equal(capacityFit(2, 2), 0);

  const strong = calculateProjectMatchScore({ verifiedScore: 90, technicalScore: 95, locationScore: 100, availabilityScore: 100, capacityScore: 100 });
  const busy = calculateProjectMatchScore({ verifiedScore: 90, technicalScore: 95, locationScore: 100, availabilityScore: 100, capacityScore: 0 });
  assert.equal(strong, 94);
  assert.equal(busy, 84);
});

test("operating-system migration adds availability, evidence and controlled extras", async () => {
  const migration = await readFile(migrationPath, "utf8");
  assert.match(migration, /CREATE TABLE professional_availability/);
  assert.match(migration, /CREATE TABLE work_evidence_files/);
  assert.match(migration, /CREATE TABLE change_orders/);
  assert.match(migration, /CREATE TABLE change_order_evidence/);
  assert.match(migration, /'OBRA_EVIDENCIA'/);
  assert.match(migration, /'EXTRA_SOLICITADO'/);
  assert.match(migration, /'EXTRA_APROBADO'/);
  assert.match(migration, /'EXTRA_RECHAZADO'/);
});

test("extras cannot bypass the professional request and client decision flow", async () => {
  const route = await readFile(routePath, "utf8");
  assert.match(route, /\/projects\/:id\/change-orders/);
  assert.match(route, /requireRole\("profesional"\)/);
  assert.match(route, /\/change-orders\/:id\/decision/);
  assert.match(route, /requireRole\("cliente"\)/);
  assert.match(route, /status !== "PENDIENTE"/);
  assert.match(route, /Extra · \$\{row\.title\}/);
  assert.match(route, /work_passport_entries/);
  assert.match(route, /effectiveAmountCents/);
});
