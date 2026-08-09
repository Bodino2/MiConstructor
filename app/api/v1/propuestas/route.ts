import { databaseError, getD1 } from "@/lib/server/d1";
import { requireIdentity } from "@/lib/server/identity";
import { cleanText, toCents } from "@/lib/validation";

export async function POST(request: Request) {
  const identity = requireIdentity(request);
  if (identity instanceof Response) return identity;

  try {
    const payload = (await request.json()) as {
      proyectoId?: unknown;
      importe?: unknown;
      plazoDias?: unknown;
      mensaje?: unknown;
    };
    const projectId = Number(payload.proyectoId);
    const amountCents = toCents(payload.importe);
    const estimatedDays = Number(payload.plazoDias);
    const message = cleanText(payload.mensaje, 1200);

    if (
      !Number.isInteger(projectId) ||
      projectId < 1 ||
      amountCents < 100_000 ||
      !Number.isInteger(estimatedDays) ||
      estimatedDays < 1 ||
      estimatedDays > 730 ||
      message.length < 20
    ) {
      return Response.json(
        { error: "Proyecto, importe, plazo y una propuesta detallada son obligatorios." },
        { status: 400 },
      );
    }

    const db = getD1();
    const profile = await db
      .prepare("SELECT role, verification_status FROM users WHERE email = ?1")
      .bind(identity)
      .first<{ role: string; verification_status: string }>();
    if (
      !profile ||
      profile.role !== "profesional" ||
      profile.verification_status !== "APROBADO"
    ) {
      return Response.json(
        { error: "Solo los profesionales con test, documentación y perfil aprobados pueden enviar propuestas." },
        { status: 403 },
      );
    }
    const project = await db
      .prepare("SELECT status FROM projects WHERE id = ?1")
      .bind(projectId)
      .first<{ status: string }>();
    if (!project || project.status !== "PUBLICADO") {
      return Response.json(
        { error: "El proyecto no está disponible para nuevas propuestas." },
        { status: 409 },
      );
    }

    const now = new Date().toISOString();
    const result = await db
      .prepare(
        `INSERT INTO proposals
          (project_id, professional_email, amount_cents, message,
           estimated_days, status, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, 'ENVIADA', ?6, ?6)`,
      )
      .bind(projectId, identity, amountCents, message, estimatedDays, now)
      .run();

    return Response.json(
      {
        success: true,
        mensaje: "Propuesta enviada al cliente.",
        data: { id: result.meta.last_row_id, estado: "ENVIADA" },
      },
      { status: 201 },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message.includes("UNIQUE constraint failed")) {
      return Response.json(
        { error: "Ya has enviado una propuesta para este proyecto." },
        { status: 409 },
      );
    }
    return Response.json({ error: databaseError(error) }, { status: 500 });
  }
}
