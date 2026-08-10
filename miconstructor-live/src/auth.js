import crypto from 'node:crypto';

const TOKEN_TTL_SECONDS = 60 * 60 * 24 * 7;

function b64url(input) {
  return Buffer.from(input).toString('base64url');
}

export function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase();
}

export function hashPassword(password) {
  if (typeof password !== 'string' || password.length < 10) {
    throw new Error('password_too_short');
  }
  const salt = crypto.randomBytes(16);
  const derived = crypto.scryptSync(password, salt, 64);
  return `scrypt:${salt.toString('hex')}:${derived.toString('hex')}`;
}

export function verifyPassword(password, stored) {
  try {
    const [scheme, saltHex, hashHex] = String(stored || '').split(':');
    if (scheme !== 'scrypt' || !saltHex || !hashHex) return false;
    const actual = crypto.scryptSync(password, Buffer.from(saltHex, 'hex'), 64);
    const expected = Buffer.from(hashHex, 'hex');
    return expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
  } catch {
    return false;
  }
}

export function issueToken(user, secret = process.env.AUTH_SECRET) {
  if (!secret || secret.length < 32) throw new Error('auth_secret_invalid');
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    sub: user.id,
    role: user.role,
    email: user.email,
    iat: now,
    exp: now + TOKEN_TTL_SECONDS
  };
  const encoded = b64url(JSON.stringify(payload));
  const signature = crypto.createHmac('sha256', secret).update(encoded).digest('base64url');
  return `${encoded}.${signature}`;
}

export function verifyToken(token, secret = process.env.AUTH_SECRET) {
  if (!secret || !token) return null;
  const [encoded, signature] = String(token).split('.');
  if (!encoded || !signature) return null;
  const expected = crypto.createHmac('sha256', secret).update(encoded).digest('base64url');
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const payload = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8'));
    if (!payload.exp || payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch {
    return null;
  }
}
