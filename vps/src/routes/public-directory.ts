import { Router } from "express";
import { z } from "zod";
import type { Database } from "../db.js";

export function publicDirectoryRouter(database: Database) {
  const router = Router();

  router.get("/public/professionals", async (request, response, next) => {
    try {
      const parsed = z.coerce.number().int().min(1).max(12).safeParse(request.query.limit ?? 5);
      const limit = parsed.success ? parsed.data : 5;
      const result = await database.query<{
        id: string;
        display_name: string;
        specialty_label: string;
        location: string | null;
        rating: string | null;
        review_count: string;
        insured: boolean;
      }>(
        `SELECT u.id,
                COALESCE(NULLIF(u.company_name, ''), u.name) AS display_name,
                q.specialty_label,
                portfolio.location,
                reviews.rating::text,
                reviews.review_count::text,
                EXISTS (
                  SELECT 1 FROM insurance_policies ip
                   WHERE ip.professional_id = u.id
                     AND ip.status = 'APROBADA'
                     AND ip.valid_until >= current_date
                ) AS insured
           FROM users u
           JOIN LATERAL (
             SELECT specialty_label
               FROM professional_specialty_qualifications
              WHERE professional_id = u.id
                AND verification_status = 'APROBADO'
              ORDER BY is_primary DESC, reviewed_at DESC NULLS LAST, created_at
              LIMIT 1
           ) q ON true
           LEFT JOIN LATERAL (
             SELECT location
               FROM portfolio_projects
              WHERE professional_id = u.id AND status = 'PUBLICADO'
              ORDER BY created_at DESC
              LIMIT 1
           ) portfolio ON true
           LEFT JOIN LATERAL (
             SELECT round(avg(rating)::numeric, 1) AS rating,
                    count(*)::bigint AS review_count
               FROM reviews
              WHERE subject_id = u.id AND status = 'PUBLICADA'
           ) reviews ON true
          WHERE u.role = 'profesional'
            AND u.account_status = 'ACTIVO'
            AND u.verification_status = 'APROBADO'
          ORDER BY COALESCE(reviews.review_count, 0) DESC,
                   COALESCE(reviews.rating, 0) DESC,
                   u.created_at
          LIMIT $1`,
        [limit],
      );

      response.json({
        professionals: result.rows.map((row) => ({
          id: row.id,
          displayName: row.display_name,
          specialty: row.specialty_label,
          location: row.location,
          rating: row.rating ? Number(row.rating) : null,
          reviewCount: Number(row.review_count || 0),
          insured: row.insured,
          verified: true,
        })),
      });
    } catch (error) { next(error); }
  });

  return router;
}
