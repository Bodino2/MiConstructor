import { getD1 } from "@/lib/server/d1";

export async function getLocalProfessionals(serviceSlug: string, citySlug: string) {
  try {
    const rows = await getD1()
      .prepare(
        `SELECT u.email, u.name, u.company_name, u.professional_specialty,
                CASE WHEN EXISTS (
                  SELECT 1 FROM professional_insurance_policies i
                   WHERE i.professional_email = u.email
                     AND i.verification_status = 'APROBADA'
                     AND i.valid_until >= date('now')
                ) THEN 1 ELSE 0 END AS insured,
                ROUND(AVG(r.rating), 1) AS rating_value,
                COUNT(r.id) AS review_count
           FROM professional_service_areas a
           JOIN users u ON u.email = a.professional_email
           LEFT JOIN bilateral_reviews r ON r.subject_email = u.email
             AND r.direction = 'CLIENTE_A_PROFESIONAL'
             AND (r.status = 'PUBLICADA' OR (r.status = 'SELLADA' AND r.sealed_until <= datetime('now')))
          WHERE a.service_slug = ?1 AND a.city_slug = ?2 AND a.active = 1
            AND u.verification_status = 'APROBADO'
          GROUP BY u.email, u.name, u.company_name, u.professional_specialty
          ORDER BY review_count DESC, rating_value DESC, u.name
          LIMIT 10`,
      )
      .bind(serviceSlug, citySlug)
      .all<Record<string, unknown>>();
    return rows.results;
  } catch {
    return [];
  }
}
