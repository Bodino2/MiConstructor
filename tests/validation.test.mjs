import assert from "node:assert/strict";
import test from "node:test";
import {
  cleanText,
  isValidEmail,
  isValidSpanishTaxId,
  toCents,
} from "../lib/validation.js";

test("valida DNI y NIE españoles con letra de control", () => {
  assert.equal(isValidSpanishTaxId("12345678Z"), true);
  assert.equal(isValidSpanishTaxId("X2482300W"), true);
  assert.equal(isValidSpanishTaxId("12345678A"), false);
});

test("valida email, importes y límites de texto", () => {
  assert.equal(isValidEmail("maria@example.com"), true);
  assert.equal(isValidEmail("maria.example.com"), false);
  assert.equal(toCents(1250.55), 125055);
  assert.equal(cleanText("  proyecto completo  ", 8), "proyecto");
});
