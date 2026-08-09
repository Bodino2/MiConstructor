import { databaseError, getD1 } from "@/lib/server/d1";
import { requireIdentity, normalizeEmail } from "@/lib/server/identity";
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
      .prepare("SELECT owner_email, budget_cents, status FROM projects WHERE id = ?1")
      .bind(projectId)
      .first<{ owner_email: string; budget_cents: number; status: string }>();
    if (!project || project.owner_email !== identity) {
      return Response.json({ error: "Proyecto no encontrado." }, { status: 404 });
    }
    if (!["PUBLICADO", "EN_CURSO"].includes(project.status)) {
      return Response.json(
        { error: "El proyecto no admite nuevas selecciones." },
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

    const existing = await db
      .prepare(
        `SELECT id, fee_cents, payment_status, contact_unlocked_at
           FROM project_shortlists
          WHERE project_id = ?1 AND professional_email = ?2`,
      )
      .bind(projectId, professionalEmail)
      .first<Record<string, unknown>>();
    if (existing?.payment_status === "PAGADO") {
      return Response.json({
        success: true,
        mensaje: "El contacto ya estaba desbloqueado.",
        data: {
          shortlistId: existing.id,
          tarifaCentimos: existing.fee_cents,
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
        `SELECT balance_cents, auto_charge_enabled, payment_customer_ref
           FROM professional_credit_accounts
          WHERE professional_email = ?1`,
      )
      .bind(professionalEmail)
      .first<{ balance_cents: number; auto_charge_enabled: number; payment_customer_ref: string | null }>();
    const now = new Date().toISOString();

    if ((account?.balance_cents ?? 0) >= pricing.feeCents) {
      const debit = await db
        .prepare(
          `UPDATE professional_credit_accounts
              SET balance_cents = balance_cents - ?1, updated_at = ?2
            WHERE professional_email = ?3 AND balance_cents >= ?1`,
        )
        .bind(pricing.feeCents, now, professionalEmail)
        .run();
      if (!debit.meta.changes) {
        return Response.json(
          { error: "El saldo ha cambiado. Vuelve a intentar la selección." },
          { status: 409 },
        );
      }

      let shortlistId = Number(existing?.id ?? 0);
      if (shortlistId) {
        await db
          .prepare(
            `UPDATE project_shortlists
                SET fee_cents = ?1, pricing_version = ?2, charge_method = 'CREDITS',
                    payment_status = 'PAGADO', contact_unlocked_at = ?3, updated_at = ?3
              WHERE id = ?4`,
          )
          .bind(pricing.feeCents, pricing.pricingVersion, now, shortlistId)
          .run();
      } else {
        const inserted = await db
          .prepare(
            `INSERT INTO project_shortlists
              (project_id, client_email, professional_email, project_budget_cents,
               fee_cents, pricing_version, charge_method, payment_status,
               contact_unlocked_at, created_at, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, 'CREDITS', 'PAGADO', ?7, ?7, ?7)`,
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
      }

      await db
        .prepare(
          `INSERT INTO credit_transactions
            (professional_email, shortlist_id, type, amount_cents, status,
             payment_provider, created_at)
           VALUES (?1, ?2, 'CARGO_SHORTLIST', ?3, 'COMPLETADO', 'CREDITS', ?4)`,
        )
        .bind(professionalEmail, shortlistId, -pricing.feeCents, now)
        .run();

      return Response.json(
        {
          success: true,
          mensaje: "Profesional añadido a la shortlist. Contacto desbloqueado.",
          data: {
            shortlistId,
            tarifaCentimos: pricing.feeCents,
            metodo: "CREDITS",
            contacto: unlockedContact(professional),
          },
        },
        { status: 201 },
      );
    }

    let shortlistId = Number(existing?.id ?? 0);
    if (!shortlistId) {
      const inserted = await db
        .prepare(
          `INSERT INTO project_shortlists
            (project_id, client_email, professional_email, project_budget_cents,
             fee_cents, pricing_version, charge_method, payment_status,
             created_at, updated_at)
           VALUES (?1, ?2, ?3, ?4, ?5, ?6, 'STRIPE', 'PENDIENTE', ?7, ?7)`,
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
    }

    return Response.json(
      {
        success: false,
        error: "El profesional no tiene créditos suficientes. El contacto sigue bloqueado.",
        data: {
          shortlistId,
          requierePago: true,
          tarifaCentimos: pricing.feeCents,
          moneda: "EUR",
          proveedorPreparado: "STRIPE",
          cobroAutomaticoAutorizado: Boolean(
            account?.auto_charge_enabled && account?.payment_customer_ref,
          ),
        },
      },
      { status: 402 },
    );
  } catch (error) {
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
