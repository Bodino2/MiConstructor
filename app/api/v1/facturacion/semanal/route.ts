import { databaseError, getD1, requireBillingJob } from "@/lib/server/d1";
import { previousWeeklyPeriod } from "@/lib/weekly-billing";

export async function POST(request: Request) {
  const denied = requireBillingJob(request);
  if (denied) return denied;

  try {
    const db = getD1();
    const period = previousWeeklyPeriod(new Date());
    const accounts = await db
      .prepare(
        `SELECT professional_email
           FROM professional_billing_accounts
          WHERE status = 'ACTIVO'
            AND direct_debit_mandate_ref IS NOT NULL
            AND overdue_balance_cents = 0`,
      )
      .all<{ professional_email: string }>();
    const invoices: Array<Record<string, unknown>> = [];

    for (const account of accounts.results) {
      const items = await db
        .prepare(
          `SELECT id, shortlist_id, amount_cents
             FROM professional_billable_items
            WHERE professional_email = ?1
              AND status = 'PENDIENTE'
              AND service_date < ?2
            ORDER BY id`,
        )
        .bind(account.professional_email, period.end)
        .all<{ id: number; shortlist_id: number; amount_cents: number }>();
      if (!items.results.length) continue;

      const totalCents = items.results.reduce((sum, item) => sum + item.amount_cents, 0);
      const now = new Date().toISOString();
      const created = await db
        .prepare(
          `INSERT INTO weekly_invoices
            (professional_email, period_start, period_end, subtotal_cents,
             total_cents, status, payment_provider, collection_requested_at,
             created_at, updated_at)
           VALUES (?1, ?2, ?3, ?4, ?4, 'PENDIENTE_COBRO', 'STRIPE', ?5, ?5, ?5)`,
        )
        .bind(account.professional_email, period.start, period.end, totalCents, now)
        .run();
      const invoiceId = Number(created.meta.last_row_id);

      await db.batch([
        ...items.results.map((item) =>
          db
            .prepare(
              `UPDATE professional_billable_items
                  SET invoice_id = ?1, status = 'FACTURADO', updated_at = ?2
                WHERE id = ?3 AND status = 'PENDIENTE'`,
            )
            .bind(invoiceId, now, item.id),
        ),
        ...items.results.map((item) =>
          db
            .prepare(
              `UPDATE project_shortlists
                  SET payment_status = 'FACTURADO', updated_at = ?1
                WHERE id = ?2`,
            )
            .bind(now, item.shortlist_id),
        ),
        db
          .prepare(
            `UPDATE professional_billing_accounts
                SET unbilled_balance_cents = MAX(0, unbilled_balance_cents - ?1),
                    last_invoiced_at = ?2, updated_at = ?2
              WHERE professional_email = ?3`,
          )
          .bind(totalCents, now, account.professional_email),
      ]);

      invoices.push({
        invoiceId,
        professionalEmail: account.professional_email,
        totalCents,
        paymentProvider: "STRIPE",
        requiresProviderCollection: true,
      });
    }

    return Response.json({ success: true, period, invoices });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message.includes("UNIQUE constraint failed")) {
      return Response.json(
        { error: "La facturación de este periodo ya fue generada." },
        { status: 409 },
      );
    }
    return Response.json({ error: databaseError(error) }, { status: 500 });
  }
}
