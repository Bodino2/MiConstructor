import assert from "node:assert/strict";
import test from "node:test";
import { loadConfig } from "../src/config.js";
import { createOpaqueToken, hashOpaqueToken, hashPassword, verifyPassword } from "../src/services/crypto.js";
import { calculateShortlistFee } from "../../lib/shortlist-pricing.js";
import { getPublicProfessionalAssessment } from "../../lib/professional-assessment.js";

test("las contraseñas se almacenan con scrypt, sal aleatoria y comparación segura", async () => {
  const first = await hashPassword("Password-Seguro-2026", "p".repeat(32));
  const second = await hashPassword("Password-Seguro-2026", "p".repeat(32));
  assert.notEqual(first, second);
  assert.equal(await verifyPassword("Password-Seguro-2026", first, "p".repeat(32)), true);
  assert.equal(await verifyPassword("incorrecta", first, "p".repeat(32)), false);
});

test("los tokens guardados nunca contienen el secreto enviado al usuario", () => {
  const token = createOpaqueToken();
  const stored = hashOpaqueToken(token, "t".repeat(32));
  assert.notEqual(stored, token);
  assert.equal(stored.length, 64);
});

test("producción rechaza HTTP y credenciales externas ausentes", () => {
  assert.throws(() => loadConfig({
    NODE_ENV: "production",
    HOST: "127.0.0.1",
    PORT: "3200",
    APP_URL: "http://app.miconstructor.es",
    DATABASE_URL: "postgresql://localhost/test",
    SESSION_PEPPER: "s".repeat(32),
    TOKEN_PEPPER: "t".repeat(32),
    BILLING_JOB_SECRET: "b".repeat(32),
    ADMIN_EMAIL: "admin@miconstructor.es",
    REQUIRE_EXTERNAL_SERVICES: "true",
  }), /servicios externos|HTTPS/);
});

test("la lógica económica conserva los porcentajes únicamente en servidor", () => {
  assert.equal(calculateShortlistFee(100_000).feeCents, 5_000);
  assert.equal(calculateShortlistFee(500_000).feeCents, 20_000);
  assert.equal(calculateShortlistFee(2_000_000).feeCents, 60_000);
});

test("la evaluación pública no expone respuestas correctas", () => {
  const assessment = getPublicProfessionalAssessment("electricidad");
  assert.ok(assessment);
  assert.equal(assessment.questions.length, 15);
  assert.equal("correctOption" in assessment.questions[0]!, false);
});
