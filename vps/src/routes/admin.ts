import { Router } from "express";
import { z } from "zod";
import type { Database } from "../db.js";
import { withTransaction } from "../db.js";
import { audit } from "../services/audit.js";
import { requireAuth, requireRole } from "../services/auth.js";

const decisionSchema = z.object({
  decision: z.enum(["APROBAR", "RECHAZAR", "SUSPENDER"]),
  reason: z.string().trim().min(5).max(1000),
});

const accountActionSchema = z.object({
  action: z.enum(["SUSPENDER", "REACTIVAR"]),
  reason: z.string().trim().min(5).max(1000),
});

const userListSchema = z.object({
  role: z.enum(["cliente", "profesional", "admin"]).optional(),
  q: z.string().trim().max(120).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(100),
});

const projectListSchema = z.object({
  status: z.enum(["BORRADOR", "PUBLICADO", "EN_CURSO", "FINALIZADO", "CANCELADO"]).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(100),
});

const auditListSchema = z.object({
  q: z.string().trim().max(120).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(100),
});

export function adminRouter(database: Database) {
  const router = Router();
  router.use(requireAuth, requireRole("admin"));

  router.get("/admin/overview", async (_request, response, next) => {
    try {
      const result = await database.query<Record<string, string>>(
        `SELECT
           (SELECT count(*) FROM users)::text AS users_total,
           (SELECT count(*) FROM users WHERE role = 'cliente')::text AS clients_total,
           (SELECT count(*) FROM users WHERE role = 'profesional')::text AS professionals_total,
           (SELECT count(*) FROM users WHERE account_status = 'SUSPENDIDO')::text AS suspended_accounts,
           (SELECT count(*) FROM projects)::text AS projects_total,
           (SELECT count(*) FROM projects WHERE status IN ('PUBLICADO','EN_CURSO'))::text AS active_projects,
           (SELECT count(*) FROM professional_specialty_qualifications WHERE verification_status = 'PENDIENTE_REVISION')::text AS pending_qualifications,
           (SELECT count(*) FROM portfolio_projects WHERE status = 'PENDIENTE')::text AS pending_portfolios,
           (SELECT count(*) FROM insurance_policies WHERE status = 'PENDIENTE')::text AS pending_insurance,
           COALESCE((SELECT sum(overdue_balance_cents) FROM billing_accounts), 0)::text AS overdue_balance_cents`,
      );
      const row = result.rows[0]!;
      response.json({
        usersTotal: Number(row.users_total),
        clientsTotal: Number(row.clients_total),
        professionalsTotal: Number(row.professionals_total),
        suspendedAccounts: Number(row.suspended_accounts),
        projectsTotal: Number(row.projects_total),
        activeProjects: Number(row.active_projects),
        pendingQualifications: Number(row.pending_qualifications),
        pendingPortfolios: Number(row.pending_portfolios),
        pendingInsurance: Number(row.pending_insurance),
        overdueBalanceCents: Number(row.overdue_balance_cents),
      });
    } catch (error) { next(error); }
  });

  router.get("/admin/users", async (request, response, next) => {
    try {
      const query = userListSchema.safeParse(request.query);
      if (!query.success) return response.status(400).json({ error: "Filtros de usuarios no válidos." });
      const role = query.data.role ?? null;
      const search = query.data.q?.trim() || null;
      const result = await database.query(
        `SELECT u.id, u.email, u.name, u.role, u.company_name, u.phone,
                u.email_verified, u.account_status, u.verification_status,
                u.verification_reason, u.last_login_at, u.created_at,
                b.status AS billing_status,
                COALESCE(b.overdue_balance_cents, 0)::text AS overdue_balance_cents
           FROM users u
           LEFT JOIN billing_accounts b ON b.professional_id = u.id
          WHERE ($1::text IS NULL OR u.role = $1)
            AND ($2::text IS NULL OR u.email ILIKE '%' || $2 || '%'
              OR u.name ILIKE '%' || $2 || '%'
              OR COALESCE(u.company_name, '') ILIKE '%' || $2 || '%')
          ORDER BY u.created_at DESC
          LIMIT $3`,
        [role, search, query.data.limit],
      );
      response.json({ users: result.rows });
    } catch (error) { next(error); }
  });

  router.post("/admin/users/:id/account-status", async (request, response, next) => {
    try {
      const id = z.string().uuid().safeParse(request.params.id);
      const body = accountActionSchema.safeParse(request.body);
      if (!id.success || !body.success) return response.status(400).json({ error: "Acción de cuenta no válida." });
      const target = await database.query<{ role: string; account_status: string }>(
        "SELECT role, account_status FROM users WHERE id = $1",
        [id.data],
      );
      const user = target.rows[0];
      if (!user) return response.status(404).json({ error: "Usuario no encontrado." });
      if (user.role === "admin") return response.status(400).json({ error: "Las cuentas de administrador no se modifican desde este panel." });
      if (!["ACTIVO", "SUSPENDIDO"].includes(user.account_status)) {
        return response.status(409).json({ error: "El estado actual de la cuenta requiere revisión manual." });
      }
      const status = body.data.action === "SUSPENDER" ? "SUSPENDIDO" : "ACTIVO";
      await withTransaction(database, async (client) => {
        await client.query("UPDATE users SET account_status = $2, updated_at = now() WHERE id = $1", [id.data, status]);
        if (status === "SUSPENDIDO") {
          await client.query("UPDATE auth_sessions SET revoked_at = now() WHERE user_id = $1 AND revoked_at IS NULL", [id.data]);
        }
        await audit(client, {
          actorUserId: request.user!.id,
          action: status === "SUSPENDIDO" ? "USER_ACCOUNT_SUSPENDED" : "USER_ACCOUNT_REACTIVATED",
          entityType: "user",
          entityId: id.data,
          ip: request.ip,
          metadata: { reason: body.data.reason },
        });
      });
      response.json({ success: true, status });
    } catch (error) { next(error); }
  });

  router.get("/admin/projects", async (request, response, next) => {
    try {
      const query = projectListSchema.safeParse(request.query);
      if (!query.success) return response.status(400).json({ error: "Filtros de proyectos no válidos." });
      const result = await database.query(
        `SELECT p.id, p.title, p.category, p.project_type, p.location, p.budget_cents,
                p.status, p.created_at, p.updated_at,
                owner.id AS owner_id, owner.name AS owner_name, owner.email AS owner_email,
                pro.id AS professional_id, pro.name AS professional_name, pro.company_name AS professional_company,
                (SELECT count(*) FROM proposals pr WHERE pr.project_id = p.id)::text AS proposal_count,
                (SELECT count(*) FROM shortlists s WHERE s.project_id = p.id)::text AS shortlist_count,
                EXISTS (SELECT 1 FROM work_contracts c WHERE c.project_id = p.id) AS has_contract
           FROM projects p
           JOIN users owner ON owner.id = p.owner_id
           LEFT JOIN users pro ON pro.id = p.assigned_professional_id
          WHERE ($1::text IS NULL OR p.status = $1)
          ORDER BY p.created_at DESC
          LIMIT $2`,
        [query.data.status ?? null, query.data.limit],
      );
      response.json({ projects: result.rows });
    } catch (error) { next(error); }
  });

  router.get("/admin/audit", async (request, response, next) => {
    try {
      const query = auditListSchema.safeParse(request.query);
      if (!query.success) return response.status(400).json({ error: "Filtros de auditoría no válidos." });
      const search = query.data.q?.trim() || null;
      const result = await database.query(
        `SELECT a.id, a.action, a.entity_type, a.entity_id, a.ip_address,
                a.metadata, a.created_at,
                u.id AS actor_user_id, u.name AS actor_name, u.email AS actor_email
           FROM audit_events a
           LEFT JOIN users u ON u.id = a.actor_user_id
          WHERE ($1::text IS NULL OR a.action ILIKE '%' || $1 || '%'
             OR a.entity_type ILIKE '%' || $1 || '%'
             OR COALESCE(a.entity_id, '') ILIKE '%' || $1 || '%'
             OR COALESCE(u.email, '') ILIKE '%' || $1 || '%')
          ORDER BY a.created_at DESC, a.id DESC
          LIMIT $2`,
        [search, query.data.limit],
      );
      response.json({ events: result.rows });
    } catch (error) { next(error); }
  });

  router.get("/admin/review-queue", async (_request, response, next) => {
    try {
      const qualifications = await database.query(
        `SELECT q.id, q.specialty_slug, q.specialty_label, q.score, q.passed_at,
                u.id AS professional_id, u.name, u.email, u.company_name, u.tax_id
           FROM professional_specialty_qualifications q
           JOIN users u ON u.id = q.professional_id
          WHERE q.verification_status = 'PENDIENTE_REVISION'
          ORDER BY q.created_at`,
      );
      const portfolios = await database.query(
        `SELECT p.id, p.title, p.description, p.category, p.location, p.created_at,
                u.id AS professional_id, u.name, u.email, u.company_name
           FROM portfolio_projects p JOIN users u ON u.id = p.professional_id
          WHERE p.status = 'PENDIENTE' ORDER BY p.created_at`,
      );
      const insurance = await database.query(
        `SELECT i.id, i.insurer, i.policy_number_masked, i.coverage_cents,
                i.valid_from, i.valid_until, i.created_at, u.id AS professional_id,
                u.name, u.email, u.company_name
           FROM insurance_policies i JOIN users u ON u.id = i.professional_id
          WHERE i.status = 'PENDIENTE' ORDER BY i.created_at`,
      );
      response.json({ qualifications: qualifications.rows, portfolios: portfolios.rows, insurance: insurance.rows });
    } catch (error) { next(error); }
  });

  router.post("/admin/qualifications/:id/decision", async (request, response, next) => {
    try {
      const id = z.string().uuid().safeParse(request.params.id);
      const body = decisionSchema.safeParse(request.body);
      if (!id.success || !body.success) return response.status(400).json({ error: "Decisión no válida." });
      const status = { APROBAR: "APROBADO", RECHAZAR: "RECHAZADO", SUSPENDER: "SUSPENDIDO" }[body.data.decision];
      const result = await withTransaction(database, async (client) => {
        const updated = await client.query<{ professional_id: string }>(
          `UPDATE professional_specialty_qualifications
              SET verification_status = $2, reviewed_at = now(), reviewed_by = $3,
                  review_reason = $4, updated_at = now()
            WHERE id = $1 RETURNING professional_id`,
          [id.data, status, request.user!.id, body.data.reason],
        );
        const row = updated.rows[0];
        if (!row) return false;
        await client.query(
          `UPDATE users SET verification_status = CASE
             WHEN $2 = 'APROBADO' THEN 'APROBADO'
             WHEN $2 = 'SUSPENDIDO' THEN 'SUSPENDIDO'
             ELSE 'PENDIENTE_REVISION' END,
             verification_reason = $3, updated_at = now()
           WHERE id = $1`,
          [row.professional_id, status, body.data.reason],
        );
        await audit(client, { actorUserId: request.user!.id, action: `QUALIFICATION_${status}`, entityType: "qualification", entityId: id.data, ip: request.ip, metadata: { reason: body.data.reason } });
        return true;
      });
      if (!result) return response.status(404).json({ error: "Evaluación no encontrada." });
      response.json({ success: true, status });
    } catch (error) { next(error); }
  });

  router.post("/admin/portfolios/:id/decision", async (request, response, next) => {
    try {
      const id = z.string().uuid().safeParse(request.params.id);
      const body = decisionSchema.safeParse(request.body);
      if (!id.success || !body.success || body.data.decision === "SUSPENDER") return response.status(400).json({ error: "Decisión no válida." });
      const status = body.data.decision === "APROBAR" ? "PUBLICADO" : "RECHAZADO";
      const moderation = body.data.decision === "APROBAR" ? "APROBADO" : "RECHAZADO";
      const result = await withTransaction(database, async (client) => {
        const updated = await client.query("UPDATE portfolio_projects SET status = $2, updated_at = now() WHERE id = $1 RETURNING id", [id.data, status]);
        if (!updated.rows[0]) return false;
        await client.query(
          `UPDATE stored_files SET moderation_status = $2
            WHERE id IN (SELECT file_id FROM portfolio_files WHERE portfolio_id = $1)`,
          [id.data, moderation],
        );
        await audit(client, { actorUserId: request.user!.id, action: `PORTFOLIO_${status}`, entityType: "portfolio", entityId: id.data, ip: request.ip, metadata: { reason: body.data.reason } });
        return true;
      });
      if (!result) return response.status(404).json({ error: "Portfolio no encontrado." });
      response.json({ success: true, status });
    } catch (error) { next(error); }
  });

  router.post("/admin/insurance/:id/decision", async (request, response, next) => {
    try {
      const id = z.string().uuid().safeParse(request.params.id);
      const body = decisionSchema.safeParse(request.body);
      if (!id.success || !body.success || body.data.decision === "SUSPENDER") return response.status(400).json({ error: "Decisión no válida." });
      const status = body.data.decision === "APROBAR" ? "APROBADA" : "RECHAZADA";
      const moderation = body.data.decision === "APROBAR" ? "APROBADO" : "RECHAZADO";
      const result = await withTransaction(database, async (client) => {
        const updated = await client.query<{ file_id: string }>(
          `UPDATE insurance_policies SET status = $2, reviewed_at = now(), reviewed_by = $3,
              review_reason = $4 WHERE id = $1 RETURNING file_id`,
          [id.data, status, request.user!.id, body.data.reason],
        );
        if (!updated.rows[0]) return false;
        await client.query("UPDATE stored_files SET moderation_status = $2 WHERE id = $1", [updated.rows[0].file_id, moderation]);
        await audit(client, { actorUserId: request.user!.id, action: `INSURANCE_${status}`, entityType: "insurance", entityId: id.data, ip: request.ip, metadata: { reason: body.data.reason } });
        return true;
      });
      if (!result) return response.status(404).json({ error: "Póliza no encontrada." });
      response.json({ success: true, status });
    } catch (error) { next(error); }
  });

  return router;
}
