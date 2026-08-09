import { databaseError, getD1 } from "@/lib/server/d1";
import { requireIdentity } from "@/lib/server/identity";
import { getSpecialtySlugForProjectCategory } from "@/lib/professional-assessment";
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
    const billing = await db
      .prepare(
        `SELECT status, direct_debit_mandate_ref, overdue_balance_cents
           FROM professional_billing_accounts
          WHERE professional_email = ?1`,
      )
      .bind(identity)
      .first<{
        status: string;
        direct_debit_mandate_ref: string | null;
        overdue_balance_cents: number;
      }>();
    if (
      !billing ||
      billing.status !== "ACTIVO" ||
      !billing.direct_debit_mandate_ref ||
      billing.overdue_balance_cents > 0
    ) {
      return Response.json(
        {
          error:
            "La cuenta profesional necesita una domiciliación activa y no puede tener saldo vencido.",
        },
        { status: 403 },
      );
    }
    const project = await db
      .prepare("SELECT status, category FROM projects WHERE id = ?1")
      .bind(projectId)
      .first<{ status: string; category: string }>();
    if (!project || project.status !== "PUBLICADO") {
      return Response.json(
        { error: "El proyecto no está disponible para nuevas propuestas." },
        { status: 409 },
      );
    }
    const requiredSpecialty = getSpecialtySlugForProjectCategory(project.category);
    if (!requiredSpecialty) {
      return Response.json(
        { error: "Este proyecto todavía no tiene una especialidad técnica configurada." },
        { status: 409 },
      );
    }
    const qualification = await db
      .prepare(
        `SELECT verification_status
           FROM professional_specialty_qualifications
          WHERE professional_email = ?1 AND specialty_slug = ?2`,
      )
      .bind(identity, requiredSpecialty)
      .first<{ verification_status: string }>();
    if (!qualification || qualification.verification_status !== "APROBADO") {
      return Response.json(
        {
          error:
            "Para enviar una propuesta debes aprobar el test y la revisión de la especialidad correspondiente a este proyecto.",
        },
        { status: 403 },
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
