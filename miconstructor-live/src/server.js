import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { URL } from 'node:url';
import { createStore, MemoryStore } from './store.js';
import { hashPassword, issueToken, verifyPassword, verifyToken, normalizeEmail } from './auth.js';

const PORT = Number(process.env.PORT || 8080);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.resolve(__dirname, '../public');

const services = [
  { slug: 'reformas-integrales', name: 'Reformas integrales' },
  { slug: 'reformas-de-banos', name: 'Reformas de baños' },
  { slug: 'reformas-de-cocinas', name: 'Reformas de cocinas' },
  { slug: 'pintores', name: 'Pintura' },
  { slug: 'electricistas', name: 'Electricidad' },
  { slug: 'fontaneros', name: 'Fontanería' },
  { slug: 'alicatadores', name: 'Alicatado' }
];

const testBank = {
  electricistas: [
    '¿Qué comprobación realizarías antes de intervenir en un cuadro eléctrico?', '¿Cómo verificas la ausencia de tensión de forma segura?',
    '¿Qué función tiene un interruptor diferencial?', '¿Qué criterio usarías para dimensionar la sección de un conductor?',
    '¿Qué diferencia hay entre magnetotérmico y diferencial?', '¿Cómo identificarías un defecto de aislamiento?',
    '¿Qué protecciones aplicarías en un cuarto de baño?', '¿Cómo documentarías una modificación de instalación?',
    '¿Qué harías si detectas una toma de tierra deficiente?', '¿Cómo comprobarías continuidad de protección?',
    '¿Qué factores influyen en la caída de tensión?', '¿Cuándo debe sustituirse un elemento recalentado?',
    '¿Qué equipo de protección individual usarías?', '¿Qué señales indican una sobrecarga recurrente?',
    '¿Cómo dejarías la instalación antes de reenergizarla?'
  ],
  fontaneros: [
    '¿Cómo localizarías una fuga no visible?', '¿Qué prueba realizarías después de reparar una tubería?',
    '¿Cuándo elegirías PEX frente a cobre?', '¿Cómo evitarías golpes de ariete?', '¿Cómo comprobarías presión y caudal?',
    '¿Qué pendiente debe respetarse en una evacuación?', '¿Qué harías ante una unión con corrosión galvánica?',
    '¿Cómo sellarías una conexión roscada?', '¿Qué precauciones tomarías con agua caliente sanitaria?',
    '¿Cómo diagnosticarías un sifón que pierde el cierre hidráulico?', '¿Cómo actuarías ante baja presión general?',
    '¿Qué pasos seguirías para sustituir una llave de paso?', '¿Cómo verificarías estanqueidad?',
    '¿Qué documentación entregarías al terminar?', '¿Cómo protegerías la zona de trabajo?'
  ]
};

function json(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(body),
    'access-control-allow-origin': '*',
    'access-control-allow-headers': 'content-type,authorization',
    'access-control-allow-methods': 'GET,POST,OPTIONS'
  });
  res.end(body);
}

async function readJson(req) {
  let raw = '';
  for await (const chunk of req) {
    raw += chunk;
    if (raw.length > 1_000_000) throw new Error('payload_too_large');
  }
  if (!raw) return {};
  try { return JSON.parse(raw); } catch { throw new Error('invalid_json'); }
}

function publicUser(user) {
  return { id: user.id, email: user.email, role: user.role, fullName: user.fullName, phone: user.phone, createdAt: user.createdAt };
}

function validateRegistration(body) {
  const role = String(body.role || '').toUpperCase();
  if (!['CLIENT', 'PROFESSIONAL'].includes(role)) return 'invalid_role';
  if (!/^\S+@\S+\.\S+$/.test(normalizeEmail(body.email))) return 'invalid_email';
  if (!body.fullName || String(body.fullName).trim().length < 3) return 'full_name_required';
  if (!body.phone || String(body.phone).trim().length < 7) return 'phone_required';
  if (typeof body.password !== 'string' || body.password.length < 10) return 'password_too_short';
  if (body.acceptPrivacy !== true || body.acceptTerms !== true) return 'legal_consent_required';
  if (role === 'PROFESSIONAL') {
    if (!body.nifCif || !body.specialty || !body.province || !body.locality) return 'professional_fields_required';
    if (!services.some(item => item.slug === body.specialty)) return 'invalid_specialty';
  }
  return null;
}

function estimate(query) {
  const type = query.get('type') || 'reformas-integrales';
  const sqm = Math.max(1, Number(query.get('sqm') || 50));
  const quality = query.get('quality') || 'estandar';
  const base = { 'reformas-integrales': 650, 'reformas-de-banos': 900, 'reformas-de-cocinas': 850, pintores: 18, electricistas: 55, fontaneros: 60, alicatadores: 42 }[type] || 650;
  const factor = { basico: 0.8, estandar: 1, premium: 1.35 }[quality] || 1;
  const midpoint = Math.round(base * sqm * factor);
  return { type, sqm, quality, min: Math.round(midpoint * 0.85), max: Math.round(midpoint * 1.2), currency: 'EUR', breakdown: { manoDeObra: Math.round(midpoint * 0.45), materiales: Math.round(midpoint * 0.45), residuosYLogistica: Math.round(midpoint * 0.1) } };
}

function serveIndex(res) {
  fs.readFile(path.join(publicDir, 'index.html'), (err, data) => {
    if (err) return json(res, 500, { error: 'frontend_unavailable' });
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'content-length': data.length });
    res.end(data);
  });
}

export function createServer(options = {}) {
  const store = options.store || createStore();
  const authSecret = options.authSecret || process.env.AUTH_SECRET || (process.env.NODE_ENV === 'test' ? 'test-secret-which-is-longer-than-32-characters' : null);
  let initialized = false;

  async function ensureStore() {
    if (!initialized) { await store.init(); initialized = true; }
  }

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://localhost');
    try {
      await ensureStore();
      if (req.method === 'OPTIONS') return json(res, 204, {});
      if (req.method === 'GET' && url.pathname === '/') return serveIndex(res);
      if (req.method === 'GET' && url.pathname === '/api/health') return json(res, 200, { status: 'ok', service: 'miconstructor-live', version: '0.2.0', database: store instanceof MemoryStore ? 'memory' : 'postgres' });
      if (req.method === 'GET' && url.pathname === '/api/v1/services') return json(res, 200, { services });
      if (req.method === 'GET' && url.pathname === '/api/v1/estimate') return json(res, 200, estimate(url.searchParams));

      if (req.method === 'POST' && url.pathname === '/api/v1/auth/register') {
        const body = await readJson(req);
        const error = validateRegistration(body);
        if (error) return json(res, 400, { error });
        const now = new Date().toISOString();
        const user = await store.createUser({
          email: normalizeEmail(body.email), passwordHash: hashPassword(body.password), role: String(body.role).toUpperCase(),
          fullName: String(body.fullName).trim(), phone: String(body.phone).trim(), privacyAcceptedAt: now, termsAcceptedAt: now,
          nifCif: body.nifCif ? String(body.nifCif).trim() : null, specialty: body.specialty || null,
          province: body.province ? String(body.province).trim() : null, locality: body.locality ? String(body.locality).trim() : null
        });
        return json(res, 201, { user: publicUser(user), token: issueToken(user, authSecret) });
      }

      if (req.method === 'POST' && url.pathname === '/api/v1/auth/login') {
        const body = await readJson(req);
        const user = await store.findUserByEmail(body.email);
        if (!user || !verifyPassword(String(body.password || ''), user.passwordHash)) return json(res, 401, { error: 'invalid_credentials' });
        return json(res, 200, { user: publicUser(user), token: issueToken(user, authSecret) });
      }

      if (req.method === 'GET' && url.pathname === '/api/v1/me') {
        const token = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
        const claims = verifyToken(token, authSecret);
        if (!claims) return json(res, 401, { error: 'unauthorized' });
        const user = await store.getUserById(claims.sub);
        if (!user) return json(res, 401, { error: 'unauthorized' });
        const professionalProfile = user.role === 'PROFESSIONAL' ? await store.getProfessionalProfile(user.id) : null;
        return json(res, 200, { user: publicUser(user), professionalProfile });
      }

      const testMatch = url.pathname.match(/^\/api\/v1\/professional-tests\/([^/]+)$/);
      if (req.method === 'GET' && testMatch) {
        const specialty = decodeURIComponent(testMatch[1]);
        const questions = testBank[specialty];
        if (!questions) return json(res, 404, { error: 'specialty_not_found' });
        return json(res, 200, { specialty, minimumRequired: 12, questions });
      }
      return json(res, 404, { error: 'not_found' });
    } catch (error) {
      if (error?.message === 'email_exists') return json(res, 409, { error: 'email_exists' });
      if (['invalid_json', 'payload_too_large'].includes(error?.message)) return json(res, 400, { error: error.message });
      console.error(error);
      return json(res, 500, { error: 'internal_error' });
    }
  });

  server.on('close', () => { if (initialized) store.close().catch(() => {}); });
  return server;
}

if (process.env.NODE_ENV !== 'test') {
  if (!process.env.AUTH_SECRET || process.env.AUTH_SECRET.length < 32) {
    console.error('AUTH_SECRET must contain at least 32 characters');
    process.exit(1);
  }
  createServer().listen(PORT, '0.0.0.0', () => console.log(`MiConstructor live listening on ${PORT}`));
}
