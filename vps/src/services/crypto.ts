import { createHash, randomBytes, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
const KEY_LENGTH = 64;
const COST = 32_768;

function deriveKey(value: string, salt: string, length: number, options: { N: number; r: number; p: number; maxmem: number }) {
  return new Promise<Buffer>((resolve, reject) => {
    scryptCallback(value, salt, length, options, (error, key) => {
      if (error) reject(error);
      else resolve(key);
    });
  });
}

export async function hashPassword(password: string, pepper: string) {
  const salt = randomBytes(16).toString("hex");
  const key = await deriveKey(`${password}${pepper}`, salt, KEY_LENGTH, {
    N: COST,
    r: 8,
    p: 1,
    maxmem: 64 * 1024 * 1024,
  });
  return `scrypt$${COST}$8$1$${salt}$${key.toString("hex")}`;
}

export async function verifyPassword(password: string, encoded: string, pepper: string) {
  const [algorithm, cost, r, p, salt, expectedHex] = encoded.split("$");
  if (algorithm !== "scrypt" || !cost || !r || !p || !salt || !expectedHex) return false;
  const expected = Buffer.from(expectedHex, "hex");
  const actual = await deriveKey(`${password}${pepper}`, salt, expected.length, {
    N: Number(cost),
    r: Number(r),
    p: Number(p),
    maxmem: 64 * 1024 * 1024,
  });
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export function createOpaqueToken() {
  return randomBytes(32).toString("base64url");
}

export function hashOpaqueToken(token: string, pepper: string) {
  return createHash("sha256").update(`${token}${pepper}`).digest("hex");
}
