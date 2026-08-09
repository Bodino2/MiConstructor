import { databaseError, getD1 } from "@/lib/server/d1";
import { normalizeEmail, requireIdentity } from "@/lib/server/identity";
import { cleanText, isValidEmail } from "@/lib/validation";

const REVIEW_SEAL_DAYS = 14;

export async function GET(request: Request) {
  try {
    const subjectEmail = normalizeEmail(new URL(request.url).searchParams.get("usuario"));
    if (!isValidEmail(subjectEmail)) {
      return Response.json({ error: "Usuario no válido." }, { status: 400 });
    }
    const now = new Date().toISOString();
    const rows = await getD1()
      .prepare(
        `SELECT r.rating, r.comment, r.direction, r.published_at, r.created_at,
                u.name AS author_name
           FROM bilateral_reviews r
           JOIN users u ON u.email = r.author_email
          WHERE r.subject_email = ?1
            AND (r.status = 'PUBLICADA' OR (r.status = 'SELLADA' AND r.sealed_until <= ?2))
          ORDER BY r.created_at DESC`,
      )
      .bind(subjectEmail, now)
      .all<Record<string, unknown>>();
    const ratings = rows.results.map((row) => Number(row.rating));
    const average = ratings.length
      ? Math.round((ratings.reduce((sum, rating) => sum + rating, 0) / ratings.length) * 10) / 10
      : null;
    return Response.json({ success: true, data: { average, total: ratings.length, reviews: rows.results } });
  } catch (error) {
    return Response.json({ error: databaseError(error) }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const identity = requireIdentity(request);
  if (identity instanceof Response) return identity;

  try {
    const payload = (await request.json()) as {
      proyectoId?: unknown;
      puntuacion?: unknown;
      comentario?: unknown;
    };
    const projectId = Number(payload.proyectoId);
    const rating = Number(payload.puntuacion);
    const comment = cleanText(payload.comentario, 1_500);
    if (!Number.isInteger(projectId) || projectId < 1 || !Number.isInteger(rating) || rating < 1 || rating > 5 || comment.length < 20) {
      return Response.json(
        { error: "Proyecto, puntuación y comentario detallado son obligatorios." },
        { status: 400 },
      );
    }

    const db = getD1();
    const project = await db
      .prepare(
        `SELECT owner_email, assigned_professional_email, status,
                (SELECT COUNT(*) FROM milestones WHERE project_id = projects.id) AS milestone_count,
                (SELECT COUNT(*) FROM milestones WHERE project_id = projects.id AND status <> 'LIBERADO') AS unpaid_count
           FROM projects WHERE id = ?1`,
      )
      .bind(projectId)
      .first<{
        owner_email: string;
        assigned_professional_email: string | null;
        status: string;
        milestone_count: number;
        unpaid_count: number;
      }>();
    if (
      !project ||
      project.status !== "FINALIZADO" ||
      !project.assigned_professional_email ||
      project.milestone_count < 1 ||
      project.unpaid_count > 0
    ) {
      return Response.json(
        { error: "Solo se puede valorar un proyecto finalizado y pagado íntegramente en MiConstructor." },
        { status: 409 },
      );
    }

    const isClient = identity === project.owner_email;
    const isProfessional = identity === project.assigned_professional_email;
    if (!isClient && !isProfessional) {
      return Response.json({ error: "No participaste en este proyecto." }, { status: 403 });
    }
    const subjectEmail = isClient
      ? project.assigned_professional_email
      : project.owner_email;
    const direction = isClient
      ? "CLIENTE_A_PROFESIONAL"
      : "PROFESIONAL_A_CLIENTE";
    const now = new Date();
    const sealedUntil = new Date(now.getTime() + REVIEW_SEAL_DAYS * 86_400_000).toISOString();
    const nowIso = now.toISOString();

    const created = await db
      .prepare(
        `INSERT INTO bilateral_reviews
          (project_id, author_email, subject_email, direction, rating, comment,
           sealed_until, status, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, 'SELLADA', ?8, ?8)`,
      )
      .bind(projectId, identity, subjectEmail, direction, rating, comment, sealedUntil, nowIso)
      .run();

    const counterpart = await db
      .prepare(
        `SELECT id FROM bilateral_reviews
          WHERE project_id = ?1 AND author_email = ?2 AND status = 'SELLADA'`,
      )
      .bind(projectId, subjectEmail)
      .first<{ id: number }>();
    if (counterpart) {
      await db
        .prepare(
          `UPDATE bilateral_reviews SET status = 'PUBLICADA', published_at = ?1,
                  updated_at = ?1 WHERE project_id = ?2 AND status = 'SELLADA'`,
        )
        .bind(nowIso, projectId)
        .run();
    }

    return Response.json(
      {
        success: true,
        data: {
          id: created.meta.last_row_id,
          estado: counterpart ? "PUBLICADA" : "SELLADA",
          sePublicaAlResponderOEn: sealedUntil,
        },
      },
      { status: 201 },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message.includes("UNIQUE constraint failed")) {
      return Response.json({ error: "Ya has valorado este proyecto." }, { status: 409 });
    }
    return Response.json({ error: databaseError(error) }, { status: 500 });
  }
}
