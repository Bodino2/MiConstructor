import { randomUUID } from "node:crypto";
import { Router } from "express";
import { z } from "zod";
import type { Database } from "../db.js";
import { withTransaction } from "../db.js";
import { audit } from "../services/audit.js";
import { requireAuth, requireRole } from "../services/auth.js";

const publicReviewSchema = z.object({
  rating: z.coerce.number().int().min(1).max(5),
  comment: z.string().trim().min(10).max(3000),
  publicationConsent: z.boolean().default(false),
  publicPriceConsent: z.boolean().default(false),
}).refine((value) => !value.publicPriceConsent || value.publicationConsent, {
  message: "Para publicar el precio debes autorizar también la publicación de la reseña.",
  path: ["publicPriceConsent"],
});

type DatabaseError = { code?: string };

export function verifiedReviewsRouter(database: Database) {
  const router = Router();

  router.get("/projects/:id/review/me", requireAuth, requireRole("cliente"), async (request, response, next) => {
    try {
      const projectId = z.string().uuid().safeParse(request.params.id);
      if (!projectId.success) return response.status(400).json({ error: "Proyecto no válido." });
      const result = await database.query(
        `SELECT r.id, r.rating, r.comment, r.status, r.publication_consent,
                r.public_price_consent, r.publish_after, r.published_at
           FROM reviews r
           JOIN work_contracts c ON c.project_id = r.project_id
          WHERE r.project_id = $1 AND r.author_id = $2 AND c.client_id = $2
          LIMIT 1`,
        [projectId.data, request.user!.id],
      );
      response.json({ review: result.rows[0] ?? null });
    } catch (error) { next(error); }
  });

  router.post("/projects/:id/public-review", requireAuth, requireRole("cliente"), async (request, response, next) => {
    try {
      const projectId = z.string().uuid().safeParse(request.params.id);
      const body = publicReviewSchema.safeParse(request.body);
      if (!projectId.success || !body.success) {
        return response.status(400).json({ error: body.success ? "Proyecto no válido." : body.error.issues[0]?.message || "Reseña no válida." });
      }
      const reviewId = randomUUID();
      const result = await withTransaction(database, async (client) => {
        const contract = await client.query<{ professional_id: string; project_status: string }>(
          `SELECT c.professional_id, p.status AS project_status
             FROM work_contracts c
             JOIN projects p ON p.id = c.project_id
            WHERE c.project_id = $1 AND c.client_id = $2
            FOR UPDATE OF p`,
          [projectId.data, request.user!.id],
        );
        const row = contract.rows[0];
        if (!row) return { status: 404, body: { error: "Proyecto finalizado no encontrado." } };
        if (row.project_status !== "FINALIZADO") {
          return { status: 409, body: { error: "La reseña verificada se habilita cuando todos los hitos están finalizados." } };
        }
        try {
          await client.query(
            `INSERT INTO reviews
              (id, project_id, author_id, subject_id, rating, comment,
               publication_consent, publication_consent_at, public_price_consent)
             VALUES ($1,$2,$3,$4,$5,$6,$7,CASE WHEN $7 THEN now() ELSE NULL END,$8)`,
            [reviewId, projectId.data, request.user!.id, row.professional_id, body.data.rating, body.data.comment,
              body.data.publicationConsent, body.data.publicPriceConsent],
          );
        } catch (error: unknown) {
          if ((error as DatabaseError)?.code === "23505") return { status: 409, body: { error: "Ya has enviado tu reseña para este proyecto." } };
          throw error;
        }

        // Preserve blind-review semantics: before the 14-day fallback, a review
        // becomes visible immediately only when both project participants reviewed.
        await client.query(
          `UPDATE reviews
              SET status='PUBLICADA', published_at=COALESCE(published_at,now())
            WHERE project_id=$1
              AND publication_consent=true
              AND status='SELLADA'
              AND (SELECT count(*) FROM reviews WHERE project_id=$1)=2`,
          [projectId.data],
        );
        await client.query(
          `INSERT INTO work_passport_entries
            (project_id,actor_user_id,event_type,entity_type,entity_id,summary,metadata)
           VALUES ($1,$2,'REVIEW_CREADA','review',$3,'Reseña verificada del cliente registrada',$4::jsonb)`,
          [projectId.data, request.user!.id, reviewId, JSON.stringify({ publicationConsent: body.data.publicationConsent, publicPriceConsent: body.data.publicPriceConsent })],
        );
        await audit(client, {
          actorUserId: request.user!.id,
          action: "VERIFIED_REVIEW_CREATED",
          entityType: "review",
          entityId: reviewId,
          ip: request.ip,
          metadata: { projectId: projectId.data, publicationConsent: body.data.publicationConsent, publicPriceConsent: body.data.publicPriceConsent },
        });
        return {
          status: 201,
          body: {
            success: true,
            reviewId,
            status: "SELLADA",
            publicationConsent: body.data.publicationConsent,
            publicPriceConsent: body.data.publicPriceConsent,
          },
        };
      });
      response.status(result.status).json(result.body);
    } catch (error) { next(error); }
  });

  return router;
}
