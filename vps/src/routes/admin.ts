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

export function adminRouter(database: Database) {
  const router = Router();
  router.use(requireAuth, requireRole("admin"));

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
                u.id AS professional_id, u.name, u.company_name
           FROM portfolio_projects p JOIN users u ON u.id = p.professional_id
          WHERE p.status = 'PENDIENTE' ORDER BY p.created_at`,
      );
      const insurance = await database.query(
        `SELECT i.id, i.insurer, i.policy_number_masked, i.coverage_cents,
                i.valid_from, i.valid_until, i.created_at, u.id AS professional_id,
                u.name, u.company_name
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
