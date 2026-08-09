import { databaseError, getD1 } from "@/lib/server/d1";
import { requireIdentity } from "@/lib/server/identity";
import { cleanText } from "@/lib/validation";

const ALLOWED_CATEGORIES = new Set(["MANO_OBRA", "MATERIALES", "TRANSPORTE", "RESIDUOS", "OTROS"]);

export async function POST(request: Request) {
  const identity = requireIdentity(request);
  if (identity instanceof Response) return identity;

  try {
    const payload = (await request.json()) as {
      proyectoId?: unknown;
      titulo?: unknown;
      notas?: unknown;
      validoHasta?: unknown;
      ivaPorcentaje?: unknown;
      partidas?: Array<Record<string, unknown>>;
    };
    const projectId = Number(payload.proyectoId);
    const title = cleanText(payload.titulo, 120);
    const notes = cleanText(payload.notas, 1_500);
    const validUntil = String(payload.validoHasta ?? "");
    const taxRate = Number(payload.ivaPorcentaje);
    if (!Number.isInteger(projectId) || projectId < 1 || !title || !/^\d{4}-\d{2}-\d{2}$/.test(validUntil) || ![0, 10, 21].includes(taxRate) || !Array.isArray(payload.partidas) || payload.partidas.length < 1 || payload.partidas.length > 100) {
      return Response.json({ error: "Proyecto, vigencia, IVA y partidas son obligatorios." }, { status: 400 });
    }

    const items = payload.partidas.map((raw, index) => {
      const category = String(raw.categoria ?? "").toUpperCase();
      const description = cleanText(raw.descripcion, 240);
      const quantity = Number(raw.cantidad);
      const unit = cleanText(raw.unidad, 20);
      const unitPriceCents = Math.round(Number(raw.precioUnitario) * 100);
      if (!ALLOWED_CATEGORIES.has(category) || !description || !Number.isFinite(quantity) || quantity <= 0 || quantity > 100_000 || !unit || !Number.isInteger(unitPriceCents) || unitPriceCents < 0) {
        throw new TypeError(`La partida ${index + 1} no es válida.`);
      }
      const quantityMilli = Math.round(quantity * 1_000);
      return {
        category,
        description,
        quantityMilli,
        unit,
        unitPriceCents,
        totalCents: Math.round((quantityMilli * unitPriceCents) / 1_000),
      };
    });
    const subtotalCents = items.reduce((sum, item) => sum + item.totalCents, 0);
    const taxCents = Math.round(subtotalCents * (taxRate / 100));
    const totalCents = subtotalCents + taxCents;

    const db = getD1();
    const profile = await db
      .prepare(
        `SELECT u.verification_status, b.status AS billing_status,
                b.direct_debit_mandate_ref, b.overdue_balance_cents
           FROM users u
           LEFT JOIN professional_billing_accounts b ON b.professional_email = u.email
          WHERE u.email = ?1 AND u.role = 'profesional'`,
      )
      .bind(identity)
      .first<Record<string, unknown>>();
    if (!profile || profile.verification_status !== "APROBADO" || profile.billing_status !== "ACTIVO" || !profile.direct_debit_mandate_ref || Number(profile.overdue_balance_cents) > 0) {
      return Response.json({ error: "La cuenta profesional debe estar aprobada, domiciliada y al corriente de pago." }, { status: 403 });
    }
    const project = await db
      .prepare("SELECT status FROM projects WHERE id = ?1")
      .bind(projectId)
      .first<{ status: string }>();
    if (!project || project.status !== "PUBLICADO") {
      return Response.json({ error: "El proyecto no admite nuevos presupuestos." }, { status: 409 });
    }

    const now = new Date().toISOString();
    const created = await db
      .prepare(
        `INSERT INTO structured_quotes
          (project_id, professional_email, title, notes, subtotal_cents, tax_cents,
           total_cents, valid_until, status, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, 'ENVIADO', ?9, ?9)`,
      )
      .bind(projectId, identity, title, notes, subtotalCents, taxCents, totalCents, validUntil, now)
      .run();
    const quoteId = Number(created.meta.last_row_id);
    await db.batch(items.map((item, index) =>
      db.prepare(
        `INSERT INTO structured_quote_items
          (quote_id, category, description, quantity_milli, unit,
           unit_price_cents, total_cents, sort_order)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)`,
      ).bind(quoteId, item.category, item.description, item.quantityMilli, item.unit, item.unitPriceCents, item.totalCents, index),
    ));
    return Response.json({ success: true, data: { quoteId, subtotalCents, taxCents, totalCents, estado: "ENVIADO" } }, { status: 201 });
  } catch (error) {
    if (error instanceof TypeError) return Response.json({ error: error.message }, { status: 400 });
    const message = error instanceof Error ? error.message : "";
    if (message.includes("UNIQUE constraint failed")) {
      return Response.json({ error: "Ya existe un presupuesto para este proyecto." }, { status: 409 });
    }
    return Response.json({ error: databaseError(error) }, { status: 500 });
  }
}
