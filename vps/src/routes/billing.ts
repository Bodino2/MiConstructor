import { randomUUID, timingSafeEqual } from "node:crypto";
import { Router, type Request, type Response } from "express";
import Stripe from "stripe";
import { z } from "zod";
import { previousWeeklyPeriod } from "../../../lib/weekly-billing.js";
import type { AppConfig } from "../config.js";
import type { Database } from "../db.js";
import { withTransaction } from "../db.js";
import { audit } from "../services/audit.js";
import { requireAuth, requireRole } from "../services/auth.js";

function secureEqual(left: string, right: string) {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function stripeClient(config: AppConfig) {
  return config.STRIPE_SECRET_KEY ? new Stripe(config.STRIPE_SECRET_KEY) : null;
}

async function suspendForInvoiceFailure(database: Database, invoiceId: string, reason: string) {
  await withTransaction(database, async (client) => {
    const invoice = await client.query<{ professional_id: string; total_cents: string }>(
      `UPDATE weekly_invoices
          SET status = 'FALLIDA', failure_reason = $2, updated_at = now()
        WHERE id = $1 AND status <> 'PAGADA'
        RETURNING professional_id, total_cents::text`,
      [invoiceId, reason.slice(0, 500)],
    );
    const row = invoice.rows[0];
    if (!row) return;
    await client.query("UPDATE billable_items SET status = 'FALLIDO', updated_at = now() WHERE invoice_id = $1", [invoiceId]);
    const overdue = await client.query<{ total: string }>(
      `SELECT COALESCE(sum(total_cents), 0)::text AS total
         FROM weekly_invoices WHERE professional_id = $1 AND status = 'FALLIDA'`,
      [row.professional_id],
    );
    await client.query(
      `UPDATE billing_accounts
          SET status = 'SUSPENDIDO_IMPAGO', overdue_balance_cents = $2,
              suspended_at = now(), suspension_reason = $3, updated_at = now()
        WHERE professional_id = $1`,
      [row.professional_id, overdue.rows[0]?.total ?? row.total_cents, reason.slice(0, 500)],
    );
    await client.query(
      `UPDATE users SET verification_status = 'SUSPENDIDO',
          verification_reason = 'Cuenta suspendida por saldo pendiente.', updated_at = now()
        WHERE id = $1`,
      [row.professional_id],
    );
    await audit(client, { action: "BILLING_FAILED_ACCOUNT_SUSPENDED", entityType: "invoice", entityId: invoiceId, metadata: { professionalId: row.professional_id } });
  });
}

async function markInvoicePaid(database: Database, invoiceId: string) {
  await withTransaction(database, async (client) => {
    const invoice = await client.query<{ professional_id: string }>(
      `UPDATE weekly_invoices SET status = 'PAGADA', paid_at = now(), failure_reason = NULL, updated_at = now()
        WHERE id = $1 RETURNING professional_id`,
      [invoiceId],
    );
    const row = invoice.rows[0];
    if (!row) return;
    await client.query("UPDATE billable_items SET status = 'PAGADO', updated_at = now() WHERE invoice_id = $1", [invoiceId]);
    const outstanding = await client.query<{ total: string }>(
      `SELECT COALESCE(sum(total_cents), 0)::text AS total
         FROM weekly_invoices WHERE professional_id = $1 AND status = 'FALLIDA'`,
      [row.professional_id],
    );
    const total = Number(outstanding.rows[0]?.total ?? 0);
    if (total === 0) {
      await client.query(
        `UPDATE billing_accounts SET status = 'ACTIVO', overdue_balance_cents = 0,
             suspended_at = NULL, suspension_reason = NULL, updated_at = now()
          WHERE professional_id = $1 AND stripe_payment_method_id IS NOT NULL`,
        [row.professional_id],
      );
      await client.query(
        `UPDATE users SET verification_status = CASE
             WHEN EXISTS (SELECT 1 FROM professional_specialty_qualifications q
                           WHERE q.professional_id = users.id AND q.verification_status = 'APROBADO')
             THEN 'APROBADO' ELSE 'PENDIENTE_REVISION' END,
             verification_reason = NULL, updated_at = now()
          WHERE id = $1 AND verification_status = 'SUSPENDIDO'`,
        [row.professional_id],
      );
    } else {
      await client.query("UPDATE billing_accounts SET overdue_balance_cents = $2, updated_at = now() WHERE professional_id = $1", [row.professional_id, total]);
    }
  });
}

export function billingRouter(database: Database, config: AppConfig, stripe = stripeClient(config)) {
  const router = Router();

  router.get("/billing/me", requireAuth, requireRole("profesional"), async (request, response, next) => {
    try {
      const account = await database.query(
        `SELECT status, overdue_balance_cents, sepa_mandate_reference,
                (stripe_payment_method_id IS NOT NULL) AS payment_method_ready
           FROM billing_accounts WHERE professional_id = $1`,
        [request.user!.id],
      );
      const invoices = await database.query(
        `SELECT id, period_start, period_end, total_cents, status, failure_reason, paid_at
           FROM weekly_invoices WHERE professional_id = $1 ORDER BY period_end DESC LIMIT 52`,
        [request.user!.id],
      );
      const pending = await database.query(
        `SELECT id, description, amount_cents, service_date
           FROM billable_items WHERE professional_id = $1 AND status = 'PENDIENTE' ORDER BY service_date`,
        [request.user!.id],
      );
      response.json({ account: account.rows[0] ?? null, invoices: invoices.rows, pendingItems: pending.rows });
    } catch (error) { next(error); }
  });

  router.post("/billing/setup-intent", requireAuth, requireRole("profesional"), async (request, response, next) => {
    try {
      if (!stripe) return response.status(503).json({ error: "Stripe todavía no está configurado." });
      const account = await database.query<{ stripe_customer_id: string | null }>(
        "SELECT stripe_customer_id FROM billing_accounts WHERE professional_id = $1",
        [request.user!.id],
      );
      let customerId = account.rows[0]?.stripe_customer_id ?? null;
      if (!customerId) {
        const customer = await stripe.customers.create({
          email: request.user!.email,
          name: request.user!.name,
          metadata: { miconstructor_user_id: request.user!.id },
        }, { idempotencyKey: `customer-${request.user!.id}` });
        customerId = customer.id;
        await database.query("UPDATE billing_accounts SET stripe_customer_id = $2, updated_at = now() WHERE professional_id = $1", [request.user!.id, customerId]);
      }
      const setupIntent = await stripe.setupIntents.create({
        customer: customerId,
        payment_method_types: ["sepa_debit"],
        usage: "off_session",
        metadata: { miconstructor_user_id: request.user!.id },
      });
      response.json({ clientSecret: setupIntent.client_secret });
    } catch (error) { next(error); }
  });

  router.post("/billing/invoices/:id/retry", requireAuth, requireRole("profesional"), async (request, response, next) => {
    try {
      if (!stripe) return response.status(503).json({ error: "Stripe todavía no está configurado." });
      const parsedInvoiceId = z.string().uuid().safeParse(request.params.id);
      if (!parsedInvoiceId.success) return response.status(400).json({ error: "Factura no válida." });
      const invoiceId = parsedInvoiceId.data;
      const invoice = await database.query<{
        total_cents: string;
        stripe_customer_id: string;
        stripe_payment_method_id: string;
      }>(
        `SELECT i.total_cents::text, b.stripe_customer_id, b.stripe_payment_method_id
           FROM weekly_invoices i
           JOIN billing_accounts b ON b.professional_id = i.professional_id
          WHERE i.id = $1 AND i.professional_id = $2 AND i.status = 'FALLIDA'
            AND b.stripe_customer_id IS NOT NULL AND b.stripe_payment_method_id IS NOT NULL`,
        [invoiceId, request.user!.id],
      );
      const row = invoice.rows[0];
      if (!row) return response.status(404).json({ error: "Factura pendiente no encontrada." });
      const intent = await stripe.paymentIntents.create({
        amount: Number(row.total_cents),
        currency: "eur",
        customer: row.stripe_customer_id,
        payment_method: row.stripe_payment_method_id,
        payment_method_types: ["sepa_debit"],
        confirm: true,
        off_session: true,
        description: "MiConstructor · recuperación de saldo pendiente",
        metadata: { invoice_id: invoiceId, professional_id: request.user!.id },
      }, { idempotencyKey: `miconstructor-retry-${invoiceId}-${Date.now().toString().slice(0, 8)}` });
      await database.query(
        `UPDATE weekly_invoices SET status = 'PROCESANDO', stripe_payment_intent_id = $2,
            collection_requested_at = now(), failure_reason = NULL, updated_at = now() WHERE id = $1`,
        [invoiceId, intent.id],
      );
      response.json({ success: true, status: "PROCESANDO" });
    } catch (error) { next(error); }
  });

  router.post("/jobs/weekly-billing", async (request, response, next) => {
    try {
      const secret = request.get("x-miconstructor-job-secret") ?? "";
      if (!secureEqual(secret, config.BILLING_JOB_SECRET)) return response.status(401).json({ error: "No autorizado." });
      if (!stripe) return response.status(503).json({ error: "Stripe todavía no está configurado." });
      const period = previousWeeklyPeriod(new Date());
      const accounts = await database.query<{ professional_id: string; stripe_customer_id: string; stripe_payment_method_id: string }>(
        `SELECT professional_id, stripe_customer_id, stripe_payment_method_id
           FROM billing_accounts
          WHERE status = 'ACTIVO' AND stripe_customer_id IS NOT NULL AND stripe_payment_method_id IS NOT NULL`,
      );
      const created: string[] = [];
      for (const account of accounts.rows) {
        const invoice = await withTransaction(database, async (client) => {
          const existing = await client.query<{ id: string }>(
            "SELECT id FROM weekly_invoices WHERE professional_id = $1 AND period_start = $2 AND period_end = $3",
            [account.professional_id, period.start, period.end],
          );
          if (existing.rows[0]) return null;
          const items = await client.query<{ id: string; amount_cents: string }>(
            `SELECT id, amount_cents::text FROM billable_items
              WHERE professional_id = $1 AND status = 'PENDIENTE' AND service_date >= $2 AND service_date < $3
              ORDER BY service_date FOR UPDATE`,
            [account.professional_id, period.start, period.end],
          );
          const total = items.rows.reduce((sum, item) => sum + Number(item.amount_cents), 0);
          if (total <= 0) return null;
          const invoiceId = randomUUID();
          await client.query(
            `INSERT INTO weekly_invoices
              (id, professional_id, period_start, period_end, total_cents, status, collection_requested_at)
             VALUES ($1, $2, $3, $4, $5, 'PENDIENTE_COBRO', now())`,
            [invoiceId, account.professional_id, period.start, period.end, total],
          );
          await client.query(
            "UPDATE billable_items SET invoice_id = $1, status = 'FACTURADO', updated_at = now() WHERE id = ANY($2::uuid[])",
            [invoiceId, items.rows.map((item) => item.id)],
          );
          return { id: invoiceId, total };
        });
        if (!invoice) continue;
        try {
          const intent = await stripe.paymentIntents.create({
            amount: invoice.total,
            currency: "eur",
            customer: account.stripe_customer_id,
            payment_method: account.stripe_payment_method_id,
            payment_method_types: ["sepa_debit"],
            confirm: true,
            off_session: true,
            description: `MiConstructor · servicios ${period.start.slice(0, 10)}–${period.end.slice(0, 10)}`,
            metadata: { invoice_id: invoice.id, professional_id: account.professional_id },
          }, { idempotencyKey: `miconstructor-weekly-${invoice.id}` });
          await database.query(
            "UPDATE weekly_invoices SET status = 'PROCESANDO', stripe_payment_intent_id = $2, updated_at = now() WHERE id = $1",
            [invoice.id, intent.id],
          );
          created.push(invoice.id);
        } catch (error) {
          await suspendForInvoiceFailure(database, invoice.id, error instanceof Error ? error.message : "Cobro rechazado");
        }
      }
      response.json({ success: true, invoicesCreated: created.length });
    } catch (error) { next(error); }
  });

  return router;
}

export function stripeWebhookHandler(database: Database, config: AppConfig, stripe = stripeClient(config)) {
  return async (request: Request, response: Response) => {
    if (!stripe || !config.STRIPE_WEBHOOK_SECRET) return response.status(503).send("Stripe no configurado");
    const signature = request.get("stripe-signature");
    if (!signature || !Buffer.isBuffer(request.body)) return response.status(400).send("Firma ausente");
    let event: Stripe.Event;
    try {
      event = stripe.webhooks.constructEvent(request.body, signature, config.STRIPE_WEBHOOK_SECRET);
    } catch {
      return response.status(400).send("Firma no válida");
    }
    const inserted = await database.query(
      `INSERT INTO stripe_webhook_events (event_id, event_type) VALUES ($1, $2)
       ON CONFLICT (event_id) DO NOTHING RETURNING event_id`,
      [event.id, event.type],
    );
    if (!inserted.rows[0]) return response.json({ received: true, duplicate: true });
    try {
      if (event.type === "setup_intent.succeeded") {
        const intent = event.data.object as Stripe.SetupIntent;
        const professionalId = intent.metadata?.miconstructor_user_id;
        const paymentMethodId = typeof intent.payment_method === "string" ? intent.payment_method : intent.payment_method?.id;
        const customerId = typeof intent.customer === "string" ? intent.customer : intent.customer?.id;
        const mandate = typeof intent.mandate === "string" ? intent.mandate : intent.mandate?.id;
        if (professionalId && paymentMethodId && customerId) {
          await database.query(
            `UPDATE billing_accounts SET status = CASE WHEN overdue_balance_cents > 0 THEN 'SUSPENDIDO_IMPAGO' ELSE 'ACTIVO' END,
                stripe_customer_id = $2, stripe_payment_method_id = $3, sepa_mandate_reference = $4, updated_at = now()
              WHERE professional_id = $1`,
            [professionalId, customerId, paymentMethodId, mandate ?? null],
          );
        }
      }
      if (event.type === "payment_intent.succeeded") {
        const intent = event.data.object as Stripe.PaymentIntent;
        if (intent.metadata.invoice_id) await markInvoicePaid(database, intent.metadata.invoice_id);
      }
      if (event.type === "payment_intent.payment_failed" || event.type === "payment_intent.canceled") {
        const intent = event.data.object as Stripe.PaymentIntent;
        if (intent.metadata.invoice_id) {
          await suspendForInvoiceFailure(database, intent.metadata.invoice_id, intent.last_payment_error?.message ?? "Adeudo rechazado");
        }
      }
      await database.query("UPDATE stripe_webhook_events SET processed_at = now() WHERE event_id = $1", [event.id]);
      response.json({ received: true });
    } catch (error) {
      await database.query("UPDATE stripe_webhook_events SET processing_error = $2 WHERE event_id = $1", [event.id, error instanceof Error ? error.message.slice(0, 500) : "Error"]);
      response.status(500).send("Error procesando webhook");
    }
  };
}
