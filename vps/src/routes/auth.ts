import { Router } from "express";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import {
  evaluateProfessionalAssessment,
  normalizeProfessionalSpecialty,
} from "../../../lib/professional-assessment.js";
import {
  evaluateHomeServiceAssessment,
  normalizeHomeServiceProfessionalSpecialty,
} from "../../../lib/home-service-assessment.js";
import { isValidSpanishTaxId } from "../../../lib/validation.js";
import type { AppConfig } from "../config.js";
import type { Database } from "../db.js";
import { withTransaction } from "../db.js";
import { audit } from "../services/audit.js";
import {
  clearSessionCookie,
  createSession,
  requireAuth,
  setSessionCookie,
} from "../services/auth.js";
import { createOpaqueToken, hashOpaqueToken, hashPassword, verifyPassword } from "../services/crypto.js";
import { enqueueMail } from "../services/mail.js";

const passwordRule = z.string().min(12).max(128)
  .refine((value) => /[a-z]/.test(value) && /[A-Z]/.test(value) && /\d/.test(value), {
    message: "La contraseña debe incluir mayúscula, minúscula y número.",
  });

const registerSchema = z.object({
  name: z.string().trim().min(2).max(100),
  email: z.string().trim().toLowerCase().email().max(254),
  password: passwordRule,
  role: z.enum(["cliente", "profesional"]),
  taxId: z.string().trim().min(8).max(20),
  companyName: z.string().trim().max(120).optional(),
  phone: z.string().trim().max(30).optional(),
  specialty: z.string().trim().max(80).optional(),
  assessment: z.unknown().optional(),
  serviceProvince: z.string().trim().min(2).max(100).optional(),
  serviceLocality: z.string().trim().min(2).max(100).optional(),
  serviceRadiusKm: z.coerce.number().int().min(5).max(200).default(50),
  privacyAccepted: z.literal(true),
});

const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(1).max(128),
});

type RegistrationAssessment =
  | ReturnType<typeof evaluateProfessionalAssessment>
  | ReturnType<typeof evaluateHomeServiceAssessment>;

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

async function createEmailToken(database: Database, config: AppConfig, userId: string, type: "VERIFY_EMAIL" | "RESET_PASSWORD") {
  const token = createOpaqueToken();
  const tokenHash = hashOpaqueToken(token, config.TOKEN_PEPPER);
  await withTransaction(database, async (client) => {
    await client.query("DELETE FROM auth_tokens WHERE user_id = $1 AND type = $2 AND consumed_at IS NULL", [userId, type]);
    await client.query(
      `INSERT INTO auth_tokens (token_hash, user_id, type, expires_at)
       VALUES ($1, $2, $3, now() + CASE WHEN $3 = 'VERIFY_EMAIL' THEN interval '24 hours' ELSE interval '1 hour' END)`,
      [tokenHash, userId, type],
    );
  });
  return token;
}

export function authRouter(database: Database, config: AppConfig) {
  const router = Router();

  router.post("/register", async (request, response, next) => {
    try {
      const parsed = registerSchema.safeParse(request.body);
      if (!parsed.success) return response.status(400).json({ error: parsed.error.issues[0]?.message });
      const input = parsed.data;
      const taxId = input.taxId.toUpperCase().replace(/[\s-]/g, "");
      if (!isValidSpanishTaxId(taxId)) return response.status(400).json({ error: "NIF, NIE o CIF no válido." });

      const hasProvince = Boolean(input.serviceProvince);
      const hasLocality = Boolean(input.serviceLocality);
      if (hasProvince !== hasLocality) {
        return response.status(400).json({ error: "Provincia y localidad deben indicarse juntas." });
      }

      let assessment: RegistrationAssessment | null = null;
      if (input.role === "profesional") {
        const constructionSpecialty = normalizeProfessionalSpecialty(input.specialty);
        const homeServiceSpecialty = normalizeHomeServiceProfessionalSpecialty(input.specialty);
        const specialty = constructionSpecialty ?? homeServiceSpecialty;
        if (!input.companyName || !input.phone || !specialty) {
          return response.status(400).json({ error: "Empresa, teléfono y especialidad son obligatorios." });
        }
        const assessmentPayload = {
          ...(input.assessment && typeof input.assessment === "object" ? input.assessment : {}),
          especialidad: specialty,
        };
        assessment = constructionSpecialty
          ? evaluateProfessionalAssessment(assessmentPayload)
          : evaluateHomeServiceAssessment(assessmentPayload);
        if (!assessment.valid) return response.status(400).json({ error: assessment.error });
        if (!assessment.passed) {
          return response.status(422).json({ error: "Debes superar el test técnico de tu especialidad.", score: assessment.score, minimum: 80 });
        }
      }

      const userId = randomUUID();
      const passwordHash = await hashPassword(input.password, config.SESSION_PEPPER);
      const verificationToken = createOpaqueToken();
      const verificationHash = hashOpaqueToken(verificationToken, config.TOKEN_PEPPER);
      await withTransaction(database, async (client) => {
        await client.query(
          `INSERT INTO users
            (id, email, name, password_hash, role, tax_id, company_name, phone,
             service_province, service_locality, service_radius_km,
             email_verified, account_status, verification_status,
             privacy_version, privacy_accepted_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11,
                   false, 'ACTIVO', $12, '2026-08-09', now())`,
          [
            userId, input.email, input.name, passwordHash, input.role, taxId,
            input.companyName ?? null, input.phone ?? null,
            input.serviceProvince ?? null, input.serviceLocality ?? null, input.serviceRadiusKm,
            input.role === "profesional" ? "PENDIENTE_REVISION" : "NO_APLICA",
          ],
        );
        await client.query(
          `INSERT INTO auth_tokens (token_hash, user_id, type, expires_at)
           VALUES ($1, $2, 'VERIFY_EMAIL', now() + interval '24 hours')`,
          [verificationHash, userId],
        );
        if (assessment) {
          await client.query(
            `INSERT INTO professional_specialty_qualifications
              (id, professional_id, specialty_slug, specialty_label, is_primary,
               assessment_version, question_count, score, passed_at, verification_status)
             VALUES ($1, $2, $3, $4, true, $5, $6, $7, now(), 'PENDIENTE_REVISION')`,
            [randomUUID(), userId, assessment.specialtySlug, assessment.specialtyLabel, assessment.version, assessment.total, assessment.score],
          );
          await client.query(
            `INSERT INTO billing_accounts (professional_id, status)
             VALUES ($1, 'PENDIENTE_MANDATO')`,
            [userId],
          );
        }
        const verifyUrl = `${config.APP_URL}/verificar-email?token=${encodeURIComponent(verificationToken)}`;
        await enqueueMail(client, {
          recipient: input.email,
          subject: "Verifica tu cuenta de MiConstructor",
          text: `Confirma tu email: ${verifyUrl}`,
          html: `<p>Confirma tu cuenta de MiConstructor:</p><p><a href="${verifyUrl}">Verificar email</a></p>`,
        });
        await audit(client, {
          actorUserId: userId,
          action: "USER_REGISTERED",
          entityType: "user",
          entityId: userId,
          ip: request.ip,
          metadata: input.serviceProvince && input.serviceLocality
            ? { serviceAreaConfigured: true, serviceRadiusKm: input.serviceRadiusKm }
            : { serviceAreaConfigured: false },
        });
      });
      return response.status(201).json({ success: true, message: "Cuenta creada. Revisa tu email para activarla." });
    } catch (error: unknown) {
      if (typeof error === "object" && error && "code" in error && error.code === "23505") {
        return response.status(409).json({ error: "El email o NIF/CIF ya está registrado." });
      }
      next(error);
    }
  });

  router.post("/verify-email", async (request, response, next) => {
    try {
      const token = z.string().min(32).safeParse(request.body?.token);
      if (!token.success) return response.status(400).json({ error: "Token no válido." });
      const tokenHash = hashOpaqueToken(token.data, config.TOKEN_PEPPER);
      const verified = await withTransaction(database, async (client) => {
        const result = await client.query<{ user_id: string }>(
          `UPDATE auth_tokens
              SET consumed_at = now()
            WHERE token_hash = $1 AND type = 'VERIFY_EMAIL' AND consumed_at IS NULL AND expires_at > now()
            RETURNING user_id`,
          [tokenHash],
        );
        const row = result.rows[0];
        if (!row) return false;
        await client.query("UPDATE users SET email_verified = true, updated_at = now() WHERE id = $1", [row.user_id]);
        return true;
      });
      if (!verified) return response.status(400).json({ error: "El enlace ha caducado o ya fue utilizado." });
      return response.json({ success: true });
    } catch (error) { next(error); }
  });

  router.post("/login", async (request, response, next) => {
    try {
      const parsed = loginSchema.safeParse(request.body);
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
      setSessionCookie(response, config, token);
      await audit(database, { actorUserId: String(row.id), action: "USER_LOGIN", entityType: "session", ip: request.ip });
      return response.json({ success: true, user: publicUser(row) });
    } catch (error) { next(error); }
  });

  router.post("/logout", requireAuth, async (request, response, next) => {
    try {
      if (request.sessionTokenHash) {
        await database.query("UPDATE auth_sessions SET revoked_at = now() WHERE token_hash = $1", [request.sessionTokenHash]);
      }
      clearSessionCookie(response, config);
      response.status(204).end();
    } catch (error) { next(error); }
  });

  router.get("/me", requireAuth, (request, response) => response.json({ user: request.user }));

  router.post("/forgot-password", async (request, response, next) => {
    try {
      const email = z.string().trim().toLowerCase().email().safeParse(request.body?.email);
      if (email.success) {
        const user = await database.query<{ id: string }>("SELECT id FROM users WHERE email = $1", [email.data]);
        if (user.rows[0]) {
          const token = await createEmailToken(database, config, user.rows[0].id, "RESET_PASSWORD");
          const resetUrl = `${config.APP_URL}/restablecer?token=${encodeURIComponent(token)}`;
          await enqueueMail(database, {
            recipient: email.data,
            subject: "Restablece tu contraseña de MiConstructor",
            text: `Restablece tu contraseña: ${resetUrl}`,
            html: `<p><a href="${resetUrl}">Restablecer contraseña</a></p>`,
          });
        }
      }
      response.json({ success: true, message: "Si la cuenta existe, recibirás un email." });
    } catch (error) { next(error); }
  });

  router.post("/reset-password", async (request, response, next) => {
    try {
      const parsed = z.object({ token: z.string().min(32), password: passwordRule }).safeParse(request.body);
      if (!parsed.success) return response.status(400).json({ error: parsed.error.issues[0]?.message });
      const tokenHash = hashOpaqueToken(parsed.data.token, config.TOKEN_PEPPER);
      const passwordHash = await hashPassword(parsed.data.password, config.SESSION_PEPPER);
      const reset = await withTransaction(database, async (client) => {
        const token = await client.query<{ user_id: string }>(
          `UPDATE auth_tokens SET consumed_at = now()
            WHERE token_hash = $1 AND type = 'RESET_PASSWORD' AND consumed_at IS NULL AND expires_at > now()
            RETURNING user_id`,
          [tokenHash],
        );
        const row = token.rows[0];
        if (!row) return false;
        await client.query("UPDATE users SET password_hash = $1, failed_login_attempts = 0, locked_until = NULL, updated_at = now() WHERE id = $2", [passwordHash, row.user_id]);
        await client.query("UPDATE auth_sessions SET revoked_at = now() WHERE user_id = $1", [row.user_id]);
        return true;
      });
      if (!reset) return response.status(400).json({ error: "El enlace ha caducado o ya fue utilizado." });
      response.json({ success: true });
    } catch (error) { next(error); }
  });

  return router;
}
