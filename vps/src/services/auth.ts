import type { NextFunction, Request, Response } from "express";
import type { AppConfig } from "../config.js";
import type { Database } from "../db.js";
import { createOpaqueToken, hashOpaqueToken } from "./crypto.js";

export type AuthUser = {
  id: string;
  email: string;
  name: string;
  role: "cliente" | "profesional" | "admin";
  emailVerified: boolean;
  accountStatus: string;
  verificationStatus: string;
  serviceProvince?: string | null;
  serviceLocality?: string | null;
  serviceRadiusKm?: number;
};

declare global {
  // Express uses namespace merging for request augmentation.
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthUser;
      sessionTokenHash?: string;
    }
  }
}

export function sessionCookieName(config: AppConfig) {
  return config.NODE_ENV === "production"
    ? "__Host-miconstructor_session"
    : "miconstructor_session";
}

export async function createSession(
  database: Database,
  config: AppConfig,
  userId: string,
  request: Request,
) {
  const token = createOpaqueToken();
  const tokenHash = hashOpaqueToken(token, config.SESSION_PEPPER);
  await database.query(
    `INSERT INTO auth_sessions
      (token_hash, user_id, ip_address, user_agent, expires_at)
     VALUES ($1, $2, $3, $4, now() + interval '30 days')`,
    [tokenHash, userId, request.ip ?? null, request.get("user-agent")?.slice(0, 500) ?? null],
  );
  return token;
}

export function setSessionCookie(response: Response, config: AppConfig, token: string) {
  response.cookie(sessionCookieName(config), token, {
    httpOnly: true,
    secure: config.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 30 * 24 * 60 * 60 * 1000,
  });
}

export function clearSessionCookie(response: Response, config: AppConfig) {
  response.clearCookie(sessionCookieName(config), {
    httpOnly: true,
    secure: config.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
  });
}

function bearerToken(request: Request) {
  const authorization = request.get("authorization") ?? "";
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || null;
}

export function authentication(database: Database, config: AppConfig) {
  return async (request: Request, _response: Response, next: NextFunction) => {
    try {
      const token = bearerToken(request) ?? request.cookies?.[sessionCookieName(config)];
      if (typeof token !== "string" || token.length < 32) return next();
      const tokenHash = hashOpaqueToken(token, config.SESSION_PEPPER);
      const result = await database.query<{
        id: string;
        email: string;
        name: string;
        role: AuthUser["role"];
        email_verified: boolean;
        account_status: string;
        verification_status: string;
        service_province: string | null;
        service_locality: string | null;
        service_radius_km: number;
      }>(
        `WITH active_session AS (
           UPDATE auth_sessions
              SET last_seen_at = now()
            WHERE token_hash = $1
              AND revoked_at IS NULL
              AND expires_at > now()
            RETURNING user_id
         )
         SELECT u.id, u.email, u.name, u.role, u.email_verified,
                u.account_status, u.verification_status,
                u.service_province, u.service_locality, u.service_radius_km
           FROM active_session s
           JOIN users u ON u.id = s.user_id`,
        [tokenHash],
      );
      const row = result.rows[0];
      if (row) {
        request.user = {
          id: row.id,
          email: row.email,
          name: row.name,
          role: row.role,
          emailVerified: row.email_verified,
          accountStatus: row.account_status,
          verificationStatus: row.verification_status,
          serviceProvince: row.service_province,
          serviceLocality: row.service_locality,
          serviceRadiusKm: Number(row.service_radius_km || 50),
        };
        request.sessionTokenHash = tokenHash;
      }
      next();
    } catch (error) {
      next(error);
    }
  };
}

export function requireAuth(request: Request, response: Response, next: NextFunction) {
  if (!request.user) return response.status(401).json({ error: "Debes iniciar sesión." });
  if (request.user.accountStatus !== "ACTIVO") {
    return response.status(423).json({ error: "La cuenta no está activa." });
  }
  next();
}

export function requireRole(...roles: AuthUser["role"][]) {
  return (request: Request, response: Response, next: NextFunction) => {
    if (!request.user) return response.status(401).json({ error: "Debes iniciar sesión." });
    if (!roles.includes(request.user.role)) {
      return response.status(403).json({ error: "No tienes permisos para esta operación." });
    }
    next();
  };
}

export function originProtection(config: AppConfig) {
  const allowedOrigin = new URL(config.APP_URL).origin;
  return (request: Request, response: Response, next: NextFunction) => {
    if (["GET", "HEAD", "OPTIONS"].includes(request.method)) return next();
    const origin = request.get("origin");
    if (config.NODE_ENV === "production" && origin !== allowedOrigin) {
      const authenticatedMobileRequest = Boolean(bearerToken(request));
      const declaredMobileClient = request.get("x-miconstructor-client") === "mobile" && !origin;
      if (!authenticatedMobileRequest && !declaredMobileClient) {
        return response.status(403).json({ error: "Origen de solicitud no permitido." });
      }
    }
    next();
  };
}
