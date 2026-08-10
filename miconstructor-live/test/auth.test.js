import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from '../src/server.js';
import { MemoryStore } from '../src/store.js';

async function withServer(run) {
  const server = createServer({ store: new MemoryStore(), authSecret: 'test-secret-which-is-longer-than-32-characters' });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  try { await run(`http://127.0.0.1:${port}`); }
  finally { await new Promise(resolve => server.close(resolve)); }
}

async function post(base, path, body) {
  return fetch(`${base}${path}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
}

test('client can register, login and load profile', async () => {
  await withServer(async base => {
    const registration = { role: 'CLIENT', email: 'Cliente@Example.com', password: 'Password123!', fullName: 'Cliente Demo', phone: '600000001', acceptPrivacy: true, acceptTerms: true };
    const created = await post(base, '/api/v1/auth/register', registration);
    assert.equal(created.status, 201);
    const createdBody = await created.json();
    assert.equal(createdBody.user.email, 'cliente@example.com');
    assert.equal(createdBody.user.role, 'CLIENT');
    assert.ok(createdBody.token);

    const me = await fetch(`${base}/api/v1/me`, { headers: { authorization: `Bearer ${createdBody.token}` } });
    assert.equal(me.status, 200);
    assert.equal((await me.json()).user.fullName, 'Cliente Demo');

    const login = await post(base, '/api/v1/auth/login', { email: registration.email, password: registration.password });
    assert.equal(login.status, 200);
  });
});

test('professional registration requires trade data and starts pending', async () => {
  await withServer(async base => {
    const missing = await post(base, '/api/v1/auth/register', { role: 'PROFESSIONAL', email: 'pro@example.com', password: 'Password123!', fullName: 'Profesional Demo', phone: '600000002', acceptPrivacy: true, acceptTerms: true });
    assert.equal(missing.status, 400);
    assert.equal((await missing.json()).error, 'professional_fields_required');

    const created = await post(base, '/api/v1/auth/register', { role: 'PROFESSIONAL', email: 'pro@example.com', password: 'Password123!', fullName: 'Profesional Demo', phone: '600000002', acceptPrivacy: true, acceptTerms: true, nifCif: '12345678Z', specialty: 'electricistas', province: 'Jaén', locality: 'Linares' });
    const body = await created.json();
    assert.equal(created.status, 201);
    const me = await fetch(`${base}/api/v1/me`, { headers: { authorization: `Bearer ${body.token}` } });
    const profile = (await me.json()).professionalProfile;
    assert.equal(profile.verificationStatus, 'PENDING');
    assert.equal(profile.testStatus, 'PENDING');
  });
});

test('duplicate email and wrong password are rejected', async () => {
  await withServer(async base => {
    const registration = { role: 'CLIENT', email: 'same@example.com', password: 'Password123!', fullName: 'Same User', phone: '600000003', acceptPrivacy: true, acceptTerms: true };
    assert.equal((await post(base, '/api/v1/auth/register', registration)).status, 201);
    assert.equal((await post(base, '/api/v1/auth/register', registration)).status, 409);
    assert.equal((await post(base, '/api/v1/auth/login', { email: registration.email, password: 'wrong-password' })).status, 401);
  });
});
