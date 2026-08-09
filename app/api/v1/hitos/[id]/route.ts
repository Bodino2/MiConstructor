import { databaseError, getD1 } from "@/lib/server/d1";
import { requireIdentity } from "@/lib/server/identity";
import { cleanText } from "@/lib/validation";

const transitions: Record<string, string[]> = {
  RETENIDO: ["EN_REVISION", "DISPUTADO"],
  EN_REVISION: ["LIBERADO", "DISPUTADO"],
  DISPUTADO: ["EN_REVISION"],
};

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const identity = requireIdentity(request);
  if (identity instanceof Response) return identity;

  try {
    const { id } = await context.params;
    const milestoneId = Number(id);
    const payload = (await request.json()) as { estado?: unknown; nota?: unknown };
    const nextStatus = cleanText(payload.estado, 30).toUpperCase();
    const note = cleanText(payload.nota, 500);
    if (!Number.isInteger(milestoneId) || milestoneId < 1 || !nextStatus) {
      return Response.json({ error: "Solicitud no válida." }, { status: 400 });
    }

    const db = getD1();
    const row = await db
      .prepare(
        `SELECT m.id, m.project_id, m.status, p.owner_email,
                p.assigned_professional_email
           FROM milestones m
           JOIN projects p ON p.id = m.project_id
          WHERE m.id = ?1`,
      )
      .bind(milestoneId)
      .first<Record<string, unknown>>();
    if (!row) {
      return Response.json({ error: "Hito no encontrado." }, { status: 404 });
    }

    const currentStatus = String(row.status);
    if (!(transitions[currentStatus] ?? []).includes(nextStatus)) {
      return Response.json(
        { error: `No se puede pasar de ${currentStatus} a ${nextStatus}.` },
        { status: 409 },
      );
    }
    const isOwner = row.owner_email === identity;
    const isAssignedProfessional = row.assigned_professional_email === identity;
    if (nextStatus === "LIBERADO" && !isOwner) {
      return Response.json(
        { error: "Solo el cliente propietario puede liberar un hito." },
        { status: 403 },
      );
    }
    if (nextStatus === "EN_REVISION" && !isOwner && !isAssignedProfessional) {
      return Response.json(
        { error: "No tienes permisos para enviar este hito a revisión." },
        { status: 403 },
      );
    }
    if (nextStatus === "DISPUTADO" && !isOwner && !isAssignedProfessional) {
      return Response.json({ error: "No tienes permisos." }, { status: 403 });
    }

    const now = new Date().toISOString();
    await db.batch([
      db
        .prepare("UPDATE milestones SET status = ?1, updated_at = ?2 WHERE id = ?3")
        .bind(nextStatus, now, milestoneId),
      db
        .prepare(
          `INSERT INTO events (project_id, actor_email, type, message, created_at)
           VALUES (?1, ?2, 'HITO_ACTUALIZADO', ?3, ?4)`,
        )
        .bind(
          Number(row.project_id),
          identity,
          note || `Hito actualizado de ${currentStatus} a ${nextStatus}.`,
          now,
        ),
    ]);

    return Response.json({
      success: true,
      mensaje: "Estado del hito actualizado.",
      data: { id: milestoneId, estado: nextStatus, actualizadoEn: now },
    });
  } catch (error) {
    return Response.json({ error: databaseError(error) }, { status: 500 });
  }
}
