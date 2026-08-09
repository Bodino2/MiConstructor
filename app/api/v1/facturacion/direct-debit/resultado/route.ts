import { databaseError, getD1, requireBillingJob } from "@/lib/server/d1";

export async function POST(request: Request) {
  const denied = requireBillingJob(request);
  if (denied) return denied;

  try {
    const payload = (await request.json()) as {
      facturaId?: unknown;
      estado?: unknown;
      referenciaProveedor?: unknown;
      motivoFallo?: unknown;
    };
    const invoiceId = Number(payload.facturaId);
    const status = String(payload.estado ?? "").toUpperCase();
    const providerRef = String(payload.referenciaProveedor ?? "").slice(0, 200);
    const failureReason = String(payload.motivoFallo ?? "").slice(0, 500);
    if (!Number.isInteger(invoiceId) || invoiceId < 1 || !["PAGADA", "FALLIDA"].includes(status)) {
      return Response.json({ error: "Factura y estado válidos son obligatorios." }, { status: 400 });
    }

    const db = getD1();
    const invoice = await db
      .prepare(
        `SELECT professional_email, total_cents, status
           FROM weekly_invoices WHERE id = ?1`,
      )
      .bind(invoiceId)
      .first<{ professional_email: string; total_cents: number; status: string }>();
    if (!invoice) return Response.json({ error: "Factura no encontrada." }, { status: 404 });
    if (invoice.status === status) {
      return Response.json({ success: true, mensaje: "Resultado ya registrado." });
    }
    const retryingFailedInvoice = invoice.status === "FALLIDA" && status === "PAGADA";
    if (invoice.status !== "PENDIENTE_COBRO" && !retryingFailedInvoice) {
      return Response.json({ error: "La factura ya tiene un resultado definitivo." }, { status: 409 });
    }

    const now = new Date().toISOString();
    if (status === "FALLIDA") {
      await db.batch([
        db.prepare(
          `UPDATE weekly_invoices
              SET status = 'FALLIDA', payment_provider_ref = ?1,
                  failure_reason = ?2, updated_at = ?3
            WHERE id = ?4`,
        ).bind(providerRef || null, failureReason || "Adeudo rechazado", now, invoiceId),
        db.prepare(
          `UPDATE professional_billable_items
              SET status = 'FALLIDO', updated_at = ?1 WHERE invoice_id = ?2`,
        ).bind(now, invoiceId),
        db.prepare(
          `UPDATE project_shortlists SET payment_status = 'FALLIDO', updated_at = ?1
            WHERE id IN (SELECT shortlist_id FROM professional_billable_items WHERE invoice_id = ?2)`,
        ).bind(now, invoiceId),
        db.prepare(
          `UPDATE professional_billing_accounts
              SET status = 'SUSPENDIDO_IMPAGO',
                  overdue_balance_cents = overdue_balance_cents + ?1,
                  suspended_at = ?2, suspension_reason = ?3, updated_at = ?2
            WHERE professional_email = ?4`,
        ).bind(invoice.total_cents, now, failureReason || "Adeudo semanal rechazado", invoice.professional_email),
        db.prepare(
          `UPDATE users SET verification_status = 'SUSPENDIDO',
             verification_reason = ?1, updated_at = ?2 WHERE email = ?3`,
        ).bind("Cuenta suspendida por saldo pendiente.", now, invoice.professional_email),
      ]);
      return Response.json({ success: true, cuentaSuspendida: true });
    }

    const remaining = await db
      .prepare(
        `SELECT COALESCE(SUM(total_cents), 0) AS total
           FROM weekly_invoices
          WHERE professional_email = ?1 AND status = 'FALLIDA' AND id <> ?2`,
      )
      .bind(invoice.professional_email, invoiceId)
      .first<{ total: number }>();
    const outstanding = Number(remaining?.total ?? 0);
    await db.batch([
      db.prepare(
        `UPDATE weekly_invoices
            SET status = 'PAGADA', payment_provider_ref = ?1,
                paid_at = ?2, updated_at = ?2 WHERE id = ?3`,
      ).bind(providerRef || null, now, invoiceId),
      db.prepare(
        `UPDATE professional_billable_items
            SET status = 'PAGADO', updated_at = ?1 WHERE invoice_id = ?2`,
      ).bind(now, invoiceId),
      db.prepare(
        `UPDATE project_shortlists SET payment_status = 'PAGADO', updated_at = ?1
          WHERE id IN (SELECT shortlist_id FROM professional_billable_items WHERE invoice_id = ?2)`,
      ).bind(now, invoiceId),
      db.prepare(
        `UPDATE professional_billing_accounts
            SET status = ?1, overdue_balance_cents = ?2,
                suspended_at = NULL, suspension_reason = NULL, updated_at = ?3
          WHERE professional_email = ?4`,
      ).bind(outstanding > 0 ? "SUSPENDIDO_IMPAGO" : "ACTIVO", outstanding, now, invoice.professional_email),
      db.prepare(
        `UPDATE users SET verification_status = ?1, verification_reason = ?2,
             updated_at = ?3 WHERE email = ?4`,
      ).bind(
        outstanding > 0 ? "SUSPENDIDO" : "APROBADO",
        outstanding > 0 ? "Cuenta suspendida por saldo pendiente." : null,
        now,
        invoice.professional_email,
      ),
    ]);
    return Response.json({ success: true, cuentaSuspendida: outstanding > 0, saldoPendienteCentimos: outstanding });
  } catch (error) {
    return Response.json({ error: databaseError(error) }, { status: 500 });
  }
}
