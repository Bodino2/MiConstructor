import { Router } from "express";
import { z } from "zod";
import type { Database } from "../db.js";
import { withTransaction } from "../db.js";
import { audit } from "../services/audit.js";
import { requireAuth, requireRole } from "../services/auth.js";

export function homeServicesLifecycleRouter(database: Database) {
  const router = Router();

  router.post("/home-services/requests/:id/cancel", requireAuth, requireRole("cliente"), async (request, response, next) => {
    try {
      const parsed = z.string().uuid().safeParse(request.params.id);
      if (!parsed.success) return response.status(400).json({ error: "Solicitud no válida." });
      const result = await withTransaction(database, async (client) => {
        const current = await client.query<{ status: string }>(
          "SELECT status FROM home_service_requests WHERE id=$1 AND client_id=$2 FOR UPDATE",
          [parsed.data, request.user!.id],
        );
        const row = current.rows[0];
        if (!row) return { status: 404, error: "Solicitud no encontrada." };
        if (row.status !== "PUBLICADO") return { status: 409, error: "Solo puedes retirar una solicitud que todavía esté publicada." };
        await client.query("UPDATE home_service_requests SET status='CANCELADO', updated_at=now() WHERE id=$1", [parsed.data]);
        await client.query("UPDATE home_service_offers SET status='RECHAZADA', updated_at=now() WHERE request_id=$1 AND status='ENVIADA'", [parsed.data]);
        await audit(client, { actorUserId: request.user!.id, action: "HOME_SERVICE_REQUEST_CANCELLED", entityType: "home_service_request", entityId: parsed.data, ip: request.ip });
        return { status: 200, error: null };
      });
      if (result.error) return response.status(result.status).json({ error: result.error });
      response.json({ success: true, status: "CANCELADO" });
    } catch (error) { next(error); }
  });

  router.get("/home-services/my-offers", requireAuth, requireRole("profesional"), async (request, response, next) => {
    try {
      const result = await database.query(
        `SELECT o.id, o.request_id, o.amount_cents_per_visit, o.estimated_duration_minutes,
                o.first_available_date, o.message, o.status, o.created_at,
                r.vertical, r.service_slug, r.location, r.property_type,
                r.frequency, r.requested_start_date, r.status AS request_status
           FROM home_service_offers o
           JOIN home_service_requests r ON r.id=o.request_id
          WHERE o.professional_id=$1
          ORDER BY o.created_at DESC
          LIMIT 100`,
        [request.user!.id],
      );
      response.json({ offers: result.rows });
    } catch (error) { next(error); }
  });

  router.post("/home-services/offers/:id/withdraw", requireAuth, requireRole("profesional"), async (request, response, next) => {
    try {
      const parsed = z.string().uuid().safeParse(request.params.id);
      if (!parsed.success) return response.status(400).json({ error: "Oferta no válida." });
      const result = await database.query<{ request_id: string }>(
        `UPDATE home_service_offers o
            SET status='RETIRADA', updated_at=now()
           FROM home_service_requests r
          WHERE o.id=$1 AND o.professional_id=$2
            AND o.request_id=r.id
            AND o.status='ENVIADA' AND r.status='PUBLICADO'
          RETURNING o.request_id`,
        [parsed.data, request.user!.id],
      );
      const row = result.rows[0];
      if (!row) return response.status(409).json({ error: "La oferta ya no puede retirarse." });
      await audit(database, { actorUserId: request.user!.id, action: "HOME_SERVICE_OFFER_WITHDRAWN", entityType: "home_service_offer", entityId: parsed.data, ip: request.ip, metadata: { requestId: row.request_id } });
      response.json({ success: true, status: "RETIRADA" });
    } catch (error) { next(error); }
  });

  return router;
}
