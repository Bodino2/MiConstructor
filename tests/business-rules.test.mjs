import assert from "node:assert/strict";
import test from "node:test";
import {
  autoReleaseAt,
  completionDecision,
  publicationDecision,
  releaseDecision,
  startDecision,
} from "../lib/business-rules.js";

test("un proyecto sin garantía se puede publicar", () => {
  assert.equal(
    publicationDecision({
      requiresGuarantee: false,
      guaranteeChargeStatus: "NOT_REQUIRED",
    }).allowed,
    true,
  );
});

test("un proyecto con garantía requiere GuaranteeCharge PAID", () => {
  const pending = publicationDecision({
    requiresGuarantee: true,
    guaranteeChargeStatus: "PENDING",
  });
  assert.equal(pending.allowed, false);
  assert.equal(pending.code, "GUARANTEE_PAYMENT_REQUIRED");
  assert.equal(
    publicationDecision({
      requiresGuarantee: true,
      guaranteeChargeStatus: "PAID",
    }).allowed,
    true,
  );
});

test("IN_PROGRESS necesită escrow HELD", () => {
  assert.equal(startDecision({ escrowStatus: "PENDING" }).allowed, false);
  assert.equal(startDecision({ escrowStatus: "HELD" }).allowed, true);
});

test("COMPLETED pornește fereastra de 7 zile", () => {
  assert.equal(completionDecision({ currentStatus: "PUBLICADO" }).allowed, false);
  assert.equal(completionDecision({ currentStatus: "IN_PROGRESS" }).allowed, true);
  assert.equal(
    autoReleaseAt("2026-08-01T10:00:00.000Z"),
    "2026-08-08T10:00:00.000Z",
  );
});

test("eliberarea automată cere termen expirat și nicio dispută", () => {
  const input = {
    currentStatus: "COMPLETED",
    releaseAt: "2026-08-08T10:00:00.000Z",
  };
  assert.equal(
    releaseDecision({
      ...input,
      disputeOpen: false,
      now: new Date("2026-08-08T09:59:59.000Z"),
    }).code,
    "RELEASE_WINDOW_ACTIVE",
  );
  assert.equal(
    releaseDecision({
      ...input,
      disputeOpen: true,
      now: new Date("2026-08-09T10:00:00.000Z"),
    }).code,
    "OPEN_DISPUTE",
  );
  assert.equal(
    releaseDecision({
      ...input,
      disputeOpen: false,
      now: new Date("2026-08-09T10:00:00.000Z"),
    }).allowed,
    true,
  );
});
