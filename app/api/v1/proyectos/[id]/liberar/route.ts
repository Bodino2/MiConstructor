import { releaseDecision } from "@/lib/business-rules";
import { databaseError, getD1 } from "@/lib/server/d1";
import { requireIdentity } from "@/lib/server/identity";

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const identity = requireIdentity(request);
  if (identity instanceof Response) return identity;

  try {
    const { id } = await context.params;
    const projectId = Number(id);
    if (!Number.isInteger(projectId) || projectId < 1) {
      return Response.json({ error: "Proyecto no válido." }, { status: 400 });
    }

    const db = getD1();
    const project = await db
      .prepare(
        `SELECT id, owner_email, status, auto_release_at, dispute_open
           FROM projects
          WHERE id = ?1`,
      )
      .bind(projectId)
      .first<Record<string, unknown>>();
    if (!project) {
      return Response.json({ error: "Proyecto no encontrado." }, { status: 404 });
    }
    if (project.owner_email !== identity) {
      return Response.json(
        { error: "Solo el cliente propietario puede liberar el proyecto." },
        { status: 403 },
      );
    }

    const now = new Date();
    const decision = releaseDecision({
      currentStatus: String(project.status),
      disputeOpen: Boolean(project.dispute_open),
      releaseAt: project.auto_release_at ? String(project.auto_release_at) : null,
      now,
    });
    if (!decision.allowed) {
      return Response.json(
        { error: decision.message, code: decision.code },
        { status: 409 },
      );
    }

    const releasedAt = now.toISOString();
    await db.batch([
      db
        .prepare(
          `UPDATE projects
              SET status = 'RELEASED', escrow_status = 'RELEASED',
                  released_at = ?1, updated_at = ?1
            WHERE id = ?2`,
        )
        .bind(releasedAt, projectId),
      db
        .prepare(
          `UPDATE milestones
              SET status = 'LIBERADO', updated_at = ?1
            WHERE project_id = ?2 AND status <> 'DISPUTADO'`,
        )
        .bind(releasedAt, projectId),
      db
        .prepare(
          `INSERT INTO events
            (project_id, actor_email, type, message, created_at)
           VALUES (?1, ?2, 'ESCROW_LIBERADO', ?3, ?4)`,
        )
        .bind(projectId, identity, "Fondos simulados liberados.", releasedAt),
    ]);

    return Response.json({
      success: true,
      data: {
        id: projectId,
        estado: "RELEASED",
        escrowStatus: "RELEASED",
        releasedAt,
      },
    });
  } catch (error) {
    return Response.json({ error: databaseError(error) }, { status: 500 });
  }
}
