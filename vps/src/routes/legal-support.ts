import { Router, type NextFunction, type Request, type Response } from "express";
import { z } from "zod";
import type { Database } from "../db.js";
import { audit } from "../services/audit.js";
import { requireAuth, requireRole } from "../services/auth.js";

export const TERMS_VERSION = "2026-08-10";
export const SEPA_TERMS_VERSION = "2026-08-10";

function accepted(value: unknown) {
  return value === true || value === "true" || value === "on";
}

export function registrationLegalGate(request: Request, response: Response, next: NextFunction) {
  if (!accepted(request.body?.termsAccepted)) {
    return response.status(400).json({ error: "Debes aceptar los Términos y Condiciones para crear la cuenta." });
  }
  next();
}

export function sepaLegalGate(database: Database) {
  return async (request: Request, response: Response, next: NextFunction) => {
    try {
      if (!request.user) return next();
      if (request.user.role !== "profesional") return next();
      if (!accepted(request.body?.termsAccepted)) {
        return response.status(400).json({ error: "Debes aceptar las condiciones del mandato SEPA antes de activar la domiciliación." });
      }
      await database.query(
        `UPDATE billing_accounts
            SET sepa_terms_version = $2, sepa_terms_accepted_at = now(), updated_at = now()
          WHERE professional_id = $1`,
        [request.user.id, SEPA_TERMS_VERSION],
      );
      await audit(database, {
        actorUserId: request.user.id,
        action: "SEPA_TERMS_ACCEPTED",
        entityType: "billing_account",
        entityId: request.user.id,
        ip: request.ip,
        metadata: { version: SEPA_TERMS_VERSION },
      });
      next();
    } catch (error) { next(error); }
  };
}

const messageSchema = z.object({
  body: z.string().trim().min(1).max(4000),
});

export function legalSupportRouter(database: Database) {
  const router = Router();

  router.get("/support/messages", requireAuth, async (request, response, next) => {
    try {
      await database.query(
        `UPDATE support_messages SET read_by_user_at = now()
          WHERE user_id = $1 AND sender_role = 'admin' AND read_by_user_at IS NULL`,
        [request.user!.id],
      );
      const messages = await database.query(
        `SELECT id, sender_role, body, created_at
           FROM support_messages
          WHERE user_id = $1
          ORDER BY created_at, id
          LIMIT 200`,
        [request.user!.id],
      );
      response.json({ messages: messages.rows });
    } catch (error) { next(error); }
  });

  router.post("/support/messages", requireAuth, async (request, response, next) => {
    try {
      if (request.user!.role === "admin") {
        return response.status(400).json({ error: "Utiliza la bandeja de soporte de administración." });
      }
      const parsed = messageSchema.safeParse(request.body);
      if (!parsed.success) return response.status(400).json({ error: "Mensaje no válido." });
      const created = await database.query(
        `INSERT INTO support_messages (user_id, sender_user_id, sender_role, body)
         VALUES ($1, $1, 'usuario', $2)
         RETURNING id, sender_role, body, created_at`,
        [request.user!.id, parsed.data.body],
      );
      response.status(201).json({ message: created.rows[0] });
    } catch (error) { next(error); }
  });

  router.get("/support/admin/threads", requireAuth, requireRole("admin"), async (_request, response, next) => {
    try {
      const threads = await database.query(
        `SELECT u.id AS user_id, u.name, u.email, u.role,
                max(m.created_at) AS last_message_at,
                count(*) FILTER (WHERE m.sender_role = 'usuario' AND m.read_by_admin_at IS NULL)::int AS unread_count,
                (array_agg(m.body ORDER BY m.created_at DESC, m.id DESC))[1] AS last_message
           FROM support_messages m
           JOIN users u ON u.id = m.user_id
          GROUP BY u.id, u.name, u.email, u.role
          ORDER BY max(m.created_at) DESC
          LIMIT 200`,
      );
      response.json({ threads: threads.rows });
    } catch (error) { next(error); }
  });

  router.get("/support/admin/threads/:userId/messages", requireAuth, requireRole("admin"), async (request, response, next) => {
    try {
      const userId = z.string().uuid().safeParse(request.params.userId);
      if (!userId.success) return response.status(400).json({ error: "Usuario no válido." });
      const user = await database.query(
        "SELECT id, name, email, role, account_status FROM users WHERE id = $1",
        [userId.data],
      );
      if (!user.rows[0]) return response.status(404).json({ error: "Usuario no encontrado." });
      await database.query(
        `UPDATE support_messages SET read_by_admin_at = now()
          WHERE user_id = $1 AND sender_role = 'usuario' AND read_by_admin_at IS NULL`,
        [userId.data],
      );
      const messages = await database.query(
        `SELECT id, sender_role, body, created_at
           FROM support_messages WHERE user_id = $1
          ORDER BY created_at, id LIMIT 500`,
        [userId.data],
      );
      response.json({ user: user.rows[0], messages: messages.rows });
    } catch (error) { next(error); }
  });

  router.post("/support/admin/threads/:userId/messages", requireAuth, requireRole("admin"), async (request, response, next) => {
    try {
      const userId = z.string().uuid().safeParse(request.params.userId);
      const parsed = messageSchema.safeParse(request.body);
      if (!userId.success || !parsed.success) return response.status(400).json({ error: "Mensaje o usuario no válido." });
      const user = await database.query("SELECT id FROM users WHERE id = $1 AND role <> 'admin'", [userId.data]);
      if (!user.rows[0]) return response.status(404).json({ error: "Usuario no encontrado." });
      const created = await database.query(
        `INSERT INTO support_messages (user_id, sender_user_id, sender_role, body, read_by_admin_at)
         VALUES ($1, $2, 'admin', $3, now())
         RETURNING id, sender_role, body, created_at`,
        [userId.data, request.user!.id, parsed.data.body],
      );
      response.status(201).json({ message: created.rows[0] });
    } catch (error) { next(error); }
  });

  return router;
}
