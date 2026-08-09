import {
  autoReleaseAt,
  completionDecision,
  startDecision,
} from "@/lib/business-rules";
import { databaseError, getD1 } from "@/lib/server/d1";
import { requireIdentity } from "@/lib/server/identity";
import { cleanText } from "@/lib/validation";

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const identity = requireIdentity(request);
  if (identity instanceof Response) return identity;

  try {
    const { id } = await context.params;
    const projectId = Number(id);
    const payload = (await request.json()) as {
      estado?: unknown;
      escrowStatus?: unknown;
    };
    const nextStatus = cleanText(payload.estado, 30).toUpperCase();
    const escrowStatus = cleanText(payload.escrowStatus, 30).toUpperCase();
    if (!Number.isInteger(projectId) || projectId < 1) {
      return Response.json({ error: "Proyecto no válido." }, { status: 400 });
    }

    const db = getD1();
    const project = await db
      .prepare(
        `SELECT id, owner_email, status, escrow_status
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
        { error: "Solo el cliente propietario puede cambiar el estado." },
        { status: 403 },
      );
    }

    const now = new Date().toISOString();
    if (nextStatus === "IN_PROGRESS") {
      if (project.status !== "PUBLICADO") {
        return Response.json(
          { error: "Solo un proyecto publicado puede comenzar." },
          { status: 409 },
        );
      }
      const decision = startDecision({ escrowStatus });
      if (!decision.allowed) {
        return Response.json(
          { error: decision.message, code: decision.code },
          { status: 409 },
        );
      }
      await db.batch([
        db
          .prepare(
            `UPDATE projects
                SET status = 'IN_PROGRESS', escrow_status = 'HELD',
                    escrow_held_at = ?1, updated_at = ?1
              WHERE id = ?2`,
          )
          .bind(now, projectId),
        db
          .prepare(
            `UPDATE milestones
                SET status = 'RETENIDO', updated_at = ?1
              WHERE project_id = ?2 AND status = 'PREVISTO'`,
          )
          .bind(now, projectId),
        db
          .prepare(
            `INSERT INTO events
              (project_id, actor_email, type, message, created_at)
             VALUES (?1, ?2, 'PROYECTO_INICIADO', ?3, ?4)`,
          )
          .bind(projectId, identity, "Escrow confirmado como HELD.", now),
      ]);
      return Response.json({
        success: true,
        data: { id: projectId, estado: "IN_PROGRESS", escrowStatus: "HELD" },
      });
    }

    if (nextStatus === "COMPLETED") {
      const decision = completionDecision({ currentStatus: String(project.status) });
      if (!decision.allowed) {
        return Response.json(
          { error: decision.message, code: decision.code },
          { status: 409 },
        );
      }
      const releaseAt = autoReleaseAt(now);
      await db.batch([
        db
          .prepare(
            `UPDATE projects
                SET status = 'COMPLETED', completed_at = ?1,
                    auto_release_at = ?2, updated_at = ?1
              WHERE id = ?3`,
          )
          .bind(now, releaseAt, projectId),
        db
          .prepare(
            `INSERT INTO events
              (project_id, actor_email, type, message, created_at)
             VALUES (?1, ?2, 'PROYECTO_COMPLETADO', ?3, ?4)`,
          )
          .bind(
            projectId,
            identity,
            `Ventana de revisión activa hasta ${releaseAt}.`,
            now,
          ),
      ]);
      return Response.json({
        success: true,
        data: { id: projectId, estado: "COMPLETED", autoReleaseAt: releaseAt },
      });
    }

    return Response.json(
      { error: "Transición de estado no soportada." },
      { status: 400 },
    );
  } catch (error) {
    return Response.json({ error: databaseError(error) }, { status: 500 });
  }
}
