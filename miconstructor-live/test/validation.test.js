import test from 'node:test';
import assert from 'node:assert/strict';
import { validateRegistration, normalizeEmail } from '../src/validation.js';

test('client registration requires RGPD and all profile fields', () => {
  const result = validateRegistration({ role: 'CLIENT', email: 'cliente@example.es', password: 'Segura12345', fullName: 'Ana López', phone: '600123123', province: 'Jaén', municipality: 'Linares', acceptPrivacy: true, acceptTerms: true });
  assert.equal(result.valid, true);
});

test('professional requires NIF/CIF and specialty', () => {
  const result = validateRegistration({ role: 'PROFESSIONAL', email: 'pro@example.es', password: 'Segura12345', fullName: 'Pro Reformas', phone: '600123123', province: 'Jaén', municipality: 'Linares', acceptPrivacy: true, acceptTerms: true });
  assert.equal(result.valid, false);
  assert.equal(result.errors.nifCif, 'required');
  assert.equal(result.errors.specialty, 'required');
});

test('privacy consent cannot be omitted', () => {
  const result = validateRegistration({ role: 'CLIENT', email: 'cliente@example.es', password: 'Segura12345', fullName: 'Ana López', phone: '600123123', province: 'Jaén', municipality: 'Linares', acceptTerms: true });
  assert.equal(result.valid, false);
  assert.equal(result.errors.acceptPrivacy, 'required');
});

test('normalizes emails', () => assert.equal(normalizeEmail('  TEST@Example.ES '), 'test@example.es'));
