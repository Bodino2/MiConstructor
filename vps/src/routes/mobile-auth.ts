import { Router } from "express";
import { z } from "zod";
import type { AppConfig } from "../config.js";
import type { Database } from "../db.js";
import { audit } from "../services/audit.js";
import { createSession } from "../services/auth.js";
import { verifyPassword } from "../services/crypto.js";

const mobileLoginSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(1).max(128),
  platform: z.enum(["ios", "android"]).optional(),
});

function publicUser(row: Record<string, unknown>) {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    role: row.role,
    emailVerified: row.email_verified,
    accountStatus: row.account_status,
    verificationStatus: row.verification_status,
  };
}

export function mobileAuthRouter(database: Database, config: AppConfig) {
  const router = Router();

  router.post("/mobile-login", async (request, response, next) => {
    try {
      const parsed = mobileLoginSchema.safeParse(request.body);
      if (!parsed.success) return response.status(400).json({ error: "Credenciales no válidas." });
      const result = await database.query<Record<string, unknown>>(
        `SELECT id, email, name, role, password_hash, email_verified,
                account_status, verification_status, failed_login_attempts, locked_until
           FROM users WHERE email = $1`,
        [parsed.data.email],
      );
      const row = result.rows[0];
      const locked = row?.locked_until && new Date(String(row.locked_until)) > new Date();
      const valid = row && !locked && await verifyPassword(parsed.data.password, String(row.password_hash), config.SESSION_PEPPER);
      if (!valid) {
        if (row && !locked) {
          await database.query(
            `UPDATE users SET failed_login_attempts = failed_login_attempts + 1,
               locked_until = CASE WHEN failed_login_attempts + 1 >= 5 THEN now() + interval '15 minutes' ELSE locked_until END
             WHERE id = $1`,
            [row.id],
          );
        }
        return response.status(401).json({ error: "Email o contraseña incorrectos." });
      }
      if (!row.email_verified) return response.status(403).json({ error: "Debes verificar tu email antes de entrar." });
      if (row.account_status !== "ACTIVO") return response.status(423).json({ error: "La cuenta no está activa." });
      await database.query("UPDATE users SET failed_login_attempts = 0, locked_until = NULL, last_login_at = now() WHERE id = $1", [row.id]);
      const token = await createSession(database, config, String(row.id), request);
      await audit(database, {
        actorUserId: String(row.id),
        action: "USER_MOBILE_LOGIN",
        entityType: "session",
        ip: request.ip,
        metadata: { platform: parsed.data.platform ?? "unknown" },
      });
      response.json({
        success: true,
        token,
        tokenType: "Bearer",
        expiresInSeconds: 30 * 24 * 60 * 60,
        user: publicUser(row),
      });
    } catch (error) { next(error); }
  });

  return router;
}
