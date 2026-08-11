import { databaseError, getD1 } from "@/lib/server/d1";
import { requireIdentity, normalizeEmail } from "@/lib/server/identity";
import { getSpecialtySlugForProjectCategory } from "@/lib/professional-assessment";
import { isValidEmail } from "@/lib/validation";
import { calculateShortlistFee } from "@/lib/shortlist-pricing";

function unlockedContact(row: Record<string, unknown>) {
  return {
    nombre: row.name,
    empresa: row.company_name,
    email: row.email,
    telefono: row.phone,
    especialidad: row.professional_specialty,
  };
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const identity = requireIdentity(request);
  if (identity instanceof Response) return identity;

  let shortlistId: number | null = null;
  try {
    const { id } = await params;
    const projectId = Number(id);
    const payload = (await request.json()) as { profesionalEmail?: unknown };
    const professionalEmail = normalizeEmail(payload.profesionalEmail);

    if (!Number.isInteger(projectId) || projectId < 1 || !isValidEmail(professionalEmail)) {
      return Response.json(
        { error: "Proyecto y profesional válidos son obligatorios." },
        { status: 400 },
      );
    }

    const db = getD1();
    const client = await db
      .prepare("SELECT role FROM users WHERE email = ?1")
      .bind(identity)
      .first<{ role: string }>();
    if (!client || client.role !== "cliente") {
      return Response.json(
        { error: "Solo el cliente propietario puede crear la shortlist." },
        { status: 403 },
      );
    }

    const project = await db
      .prepare("SELECT owner_email, budget_cents, status, category FROM projects WHERE id = ?1")
      .bind(projectId)
      .first<{ owner_email: string; budget_cents: number; status: string; category: string }>();
    if (!project || project.owner_email !== identity) {
      return Response.json({ error: "Proyecto no encontrado." }, { status: 404 });
    }
    if (project.status !== "PUBLICADO") {
      return Response.json(
        { error: "El proyecto no admite nuevas selecciones." },
        { status: 409 },
      );
    }

    const requiredSpecialty = getSpecialtySlugForProjectCategory(project.category);
    if (!requiredSpecialty) {
      return Response.json(
        { error: "El proyecto no tiene una especialidad válida para selección." },
        { status: 409 },
      );
    }

    const professional = await db
      .prepare(
        `SELECT email, name, company_name, phone, professional_specialty,
                role, verification_status
           FROM users
          WHERE email = ?1`,
      )
      .bind(professionalEmail)
      .first<Record<string, unknown>>();
    if (
      !professional ||
      professional.role !== "profesional" ||
      professional.verification_status !== "APROBADO"
    ) {
      return Response.json(
        { error: "El profesional todavía no está aprobado para recibir contactos." },
        { status: 409 },
      );
    }

    const qualification = await db
      .prepare(
        `SELECT verification_status
           FROM professional_specialty_qualifications
          WHERE professional_email = ?1 AND specialty_slug = ?2`,
      )
      .bind(professionalEmail, requiredSpecialty)
      .first<{ verification_status: string }>();
    if (!qualification || qualification.verification_status !== "APROBADO") {
      return Response.json(
        { error: "El profesional ya no tiene aprobada la especialidad exacta del proyecto." },
        { status: 409 },
      );
    }

    const proposal = await db
      .prepare(
        `SELECT id FROM proposals
          WHERE project_id = ?1 AND professional_email = ?2 AND status = 'ENVIADA'`,
      )
      .bind(projectId, professionalEmail)
      .first<{ id: number }>();
    if (!proposal) {
      return Response.json(
        { error: "La propuesta del profesional ya no está disponible." },
        { status: 409 },
      );
    }

    const existing = await db
      .prepare(
        `SELECT id, payment_status, contact_unlocked_at
           FROM project_shortlists
          WHERE project_id = ?1 AND professional_email = ?2`,
      )
      .bind(projectId, professionalEmail)
      .first<Record<string, unknown>>();
    if (existing?.contact_unlocked_at) {
      return Response.json({
        success: true,
        mensaje: "El contacto ya estaba desbloqueado.",
        data: {
          shortlistId: existing.id,
          contacto: unlockedContact(professional),
        },
      });
    }

    const pricing = calculateShortlistFee(project.budget_cents);
    if (!pricing.valid) {
      return Response.json(
        { error: "El proyecto necesita un presupuesto estimado válido." },
        { status: 409 },
      );
    }

    const account = await db
      .prepare(
        `SELECT status, direct_debit_mandate_ref, unbilled_balance_cents,
                overdue_balance_cents
           FROM professional_billing_accounts
          WHERE professional_email = ?1`,
      )
      .bind(professionalEmail)
      .first<{
        status: string;
        direct_debit_mandate_ref: string | null;
        unbilled_balance_cents: number;
        overdue_balance_cents: number;
      }>();
    if (
      !account ||
      account.status !== "ACTIVO" ||
      !account.direct_debit_mandate_ref ||
      account.overdue_balance_cents > 0
    ) {
      return Response.json(
        {
          error:
            "El profesional no tiene una domiciliación activa o mantiene saldo pendiente.",
        },
        { status: 409 },
      );
    }

    const now = new Date().toISOString();
    const inserted = await db
      .prepare(
        `INSERT INTO project_shortlists
          (project_id, client_email, professional_email, project_budget_cents,
           fee_cents, pricing_version, charge_method, payment_status,
           contact_unlocked_at, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, 'DIRECT_DEBIT',
                 'PENDIENTE_FACTURA', ?7, ?7, ?7)`,
      )
      .bind(
        projectId,
        identity,
        professionalEmail,
        project.budget_cents,
        pricing.feeCents,
        pricing.pricingVersion,
        now,
      )
      .run();
    shortlistId = Number(inserted.meta.last_row_id);

    await db
      .prepare(
        `INSERT INTO professional_billable_items
          (professional_email, shortlist_id, description, amount_cents, status,
           service_date, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, 'PENDIENTE', ?5, ?5, ?5)`,
      )
      .bind(
        professionalEmail,
        shortlistId,
        `Contacto cualificado del proyecto ${projectId}`,
        pricing.feeCents,
        now,
      )
      .run();

    const accrued = await db
      .prepare(
        `UPDATE professional_billing_accounts
            SET unbilled_balance_cents = unbilled_balance_cents + ?1,
                updated_at = ?2
          WHERE professional_email = ?3
            AND status = 'ACTIVO'
            AND direct_debit_mandate_ref IS NOT NULL
            AND overdue_balance_cents = 0`,
      )
      .bind(pricing.feeCents, now, professionalEmail)
      .run();
    if (!accrued.meta.changes) {
      await db
        .batch([
          db.prepare("DELETE FROM professional_billable_items WHERE shortlist_id = ?1").bind(shortlistId),
          db.prepare("DELETE FROM project_shortlists WHERE id = ?1").bind(shortlistId),
        ]);
      shortlistId = null;
      return Response.json(
        { error: "La cuenta profesional ha cambiado de estado. Repite la selección." },
        { status: 409 },
      );
    }

    return Response.json(
      {
        success: true,
        mensaje: "Profesional añadido a la shortlist. Contacto desbloqueado.",
        data: {
          shortlistId,
          facturacion: "SEMANAL_DIRECT_DEBIT",
          contacto: unlockedContact(professional),
        },
      },
      { status: 201 },
    );
  } catch (error) {
    if (shortlistId) {
      try {
        const db = getD1();
        await db.batch([
          db.prepare("DELETE FROM professional_billable_items WHERE shortlist_id = ?1").bind(shortlistId),
          db.prepare("DELETE FROM project_shortlists WHERE id = ?1").bind(shortlistId),
        ]);
      } catch {
        // Preserve the original failure; cleanup can be retried by operational reconciliation.
      }
    }
    const message = error instanceof Error ? error.message : "";
    if (message.includes("UNIQUE constraint failed")) {
      return Response.json(
        { error: "La selección ya existe. Recarga el proyecto para ver su estado." },
        { status: 409 },
      );
    }
    return Response.json({ error: databaseError(error) }, { status: 500 });
  }
}
