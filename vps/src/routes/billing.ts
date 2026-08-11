import { Router, type Request, type Response } from "express";
import Stripe from "stripe";
import { z } from "zod";
import type { AppConfig } from "../config.js";
import type { Database, DatabaseClient } from "../db.js";
import { withTransaction } from "../db.js";
import { audit } from "../services/audit.js";
import { requireAuth, requireRole } from "../services/auth.js";

type Queryable = Database | DatabaseClient;

export function stripeClient(config: AppConfig) {
  return config.STRIPE_SECRET_KEY ? new Stripe(config.STRIPE_SECRET_KEY) : null;
}

async function outstandingBalanceCents(database: Queryable, professionalId: string) {
  const result = await database.query<{ total: string }>(
    `SELECT (
       COALESCE((
         SELECT sum(total_cents)
           FROM weekly_invoices
          WHERE professional_id = $1 AND status = 'FALLIDA'
       ), 0)
       +
       COALESCE((
         SELECT sum(amount_cents)
           FROM billable_items
          WHERE professional_id = $1 AND status = 'FALLIDO' AND invoice_id IS NULL
       ), 0)
     )::text AS total`,
    [professionalId],
  );
  return Number(result.rows[0]?.total ?? 0);
}

async function syncBillingAccountState(database: Queryable, professionalId: string, failureReason?: string) {
  const total = await outstandingBalanceCents(database, professionalId);
  if (total > 0) {
    const reason = (failureReason || "Saldo pendiente por un cargo de selección rechazado.").slice(0, 500);
    await database.query(
      `UPDATE billing_accounts
          SET status = 'SUSPENDIDO_IMPAGO', overdue_balance_cents = $2,
              suspended_at = COALESCE(suspended_at, now()), suspension_reason = $3, updated_at = now()
        WHERE professional_id = $1`,
      [professionalId, total, reason],
    );
    return total;
  }

  await database.query(
    `UPDATE billing_accounts
        SET status = CASE WHEN stripe_payment_method_id IS NOT NULL THEN 'ACTIVO' ELSE 'PENDIENTE_MANDATO' END,
            overdue_balance_cents = 0, suspended_at = NULL, suspension_reason = NULL, updated_at = now()
      WHERE professional_id = $1`,
    [professionalId],
  );

  // Compatibility recovery for accounts suspended by older releases. Billing state no longer
  // overwrites compliance state, and an old billing suspension can only be lifted when the
  // technical + documentary verification gate is currently satisfied.
  await database.query(
    `UPDATE users
        SET verification_status = CASE
              WHEN miconstructor_professional_verification_ready(id) THEN 'APROBADO'
              ELSE 'PENDIENTE_REVISION'
            END,
            verification_reason = CASE
              WHEN miconstructor_professional_verification_ready(id)
                THEN 'Verificación técnica y documental completada.'
              ELSE 'Pendiente de completar la verificación técnica y documental obligatoria.'
            END,
            updated_at = now()
      WHERE id = $1
        AND verification_status = 'SUSPENDIDO'
        AND verification_reason = 'Cuenta suspendida por saldo pendiente.'`,
    [professionalId],
  );
  return 0;
}

async function suspendForInvoiceFailure(database: Database, invoiceId: string, reason: string) {
  await withTransaction(database, async (client) => {
    const invoice = await client.query<{ professional_id: string }>(
      `UPDATE weekly_invoices
          SET status = 'FALLIDA', failure_reason = $2, updated_at = now()
        WHERE id = $1 AND status <> 'PAGADA'
        RETURNING professional_id`,
      [invoiceId, reason.slice(0, 500)],
    );
    const row = invoice.rows[0];
    if (!row) return;
    await client.query("UPDATE billable_items SET status = 'FALLIDO', updated_at = now() WHERE invoice_id = $1", [invoiceId]);
    await syncBillingAccountState(client, row.professional_id, reason);
    await audit(client, {
      action: "BILLING_FAILED_ACCOUNT_SUSPENDED",
      entityType: "invoice",
      entityId: invoiceId,
      metadata: { professionalId: row.professional_id, legacyWeeklyInvoice: true },
    });
  });
}

async function markInvoicePaid(database: Database, invoiceId: string) {
  await withTransaction(database, async (client) => {
    const invoice = await client.query<{ professional_id: string }>(
      `UPDATE weekly_invoices
          SET status = 'PAGADA', paid_at = now(), failure_reason = NULL, updated_at = now()
        WHERE id = $1 RETURNING professional_id`,
      [invoiceId],
    );
    const row = invoice.rows[0];
    if (!row) return;
    await client.query("UPDATE billable_items SET status = 'PAGADO', updated_at = now() WHERE invoice_id = $1", [invoiceId]);
    await syncBillingAccountState(client, row.professional_id);
  });
}

export async function failSelectionCharge(database: Database, chargeId: string, reason: string) {
  await withTransaction(database, async (client) => {
    const charge = await client.query<{ professional_id: string; shortlist_id: string }>(
      `UPDATE billable_items
          SET status = 'FALLIDO', failure_reason = $2, updated_at = now()
        WHERE id = $1 AND invoice_id IS NULL AND status <> 'PAGADO'
        RETURNING professional_id, shortlist_id`,
      [chargeId, reason.slice(0, 500)],
    );
    const row = charge.rows[0];
    if (!row) return;
    await syncBillingAccountState(client, row.professional_id, reason);
    await audit(client, {
      action: "SELECTION_CHARGE_FAILED",
      entityType: "selection_charge",
      entityId: chargeId,
      metadata: { professionalId: row.professional_id, shortlistId: row.shortlist_id },
    });
  });
}

export async function markSelectionChargePaid(database: Database, chargeId: string) {
  await withTransaction(database, async (client) => {
    const charge = await client.query<{ professional_id: string; shortlist_id: string }>(
      `UPDATE billable_items
          SET status = 'PAGADO', paid_at = COALESCE(paid_at, now()), failure_reason = NULL, updated_at = now()
        WHERE id = $1 AND invoice_id IS NULL
        RETURNING professional_id, shortlist_id`,
      [chargeId],
    );
    const row = charge.rows[0];
    if (!row) return;
    await syncBillingAccountState(client, row.professional_id);
    await audit(client, {
      action: "SELECTION_CHARGE_PAID",
      entityType: "selection_charge",
      entityId: chargeId,
      metadata: { professionalId: row.professional_id, shortlistId: row.shortlist_id },
    });
  });
}

export type ImmediateSelectionCharge = {
  chargeId: string;
  shortlistId: string;
  professionalId: string;
  amountCents: number;
  stripeCustomerId: string;
  stripePaymentMethodId: string;
  attempt?: number;
};

export async function collectSelectionCharge(
  database: Database,
  stripe: Stripe | null,
  charge: ImmediateSelectionCharge,
) {
  if (!stripe) return { status: "PENDIENTE" as const, paymentIntentId: null };

  try {
    const attempt = charge.attempt ?? 0;
    const intent = await stripe.paymentIntents.create({
      amount: charge.amountCents,
      currency: "eur",
      customer: charge.stripeCustomerId,
      payment_method: charge.stripePaymentMethodId,
      payment_method_types: ["sepa_debit"],
      confirm: true,
      off_session: true,
      description: "MiConstructor · selección de profesional",
      metadata: {
        selection_charge_id: charge.chargeId,
        shortlist_id: charge.shortlistId,
        professional_id: charge.professionalId,
      },
    }, { idempotencyKey: `miconstructor-selection-${charge.chargeId}-attempt-${attempt}` });

    if (["requires_payment_method", "requires_action", "canceled"].includes(intent.status)) {
      const reason = intent.last_payment_error?.message || `Stripe devolvió estado ${intent.status}`;
      await failSelectionCharge(database, charge.chargeId, reason);
      return { status: "FALLIDO" as const, paymentIntentId: intent.id };
    }

    await database.query(
      `UPDATE billable_items
          SET status = 'PROCESANDO', stripe_payment_intent_id = $2,
              collection_requested_at = COALESCE(collection_requested_at, now()),
              failure_reason = NULL, updated_at = now()
        WHERE id = $1 AND invoice_id IS NULL AND status IN ('PENDIENTE','PROCESANDO')`,
      [charge.chargeId, intent.id],
    );

    if (intent.status === "succeeded") {
      await markSelectionChargePaid(database, charge.chargeId);
      return { status: "PAGADO" as const, paymentIntentId: intent.id };
    }

    await audit(database, {
      action: "SELECTION_CHARGE_REQUESTED",
      entityType: "selection_charge",
      entityId: charge.chargeId,
      metadata: {
        professionalId: charge.professionalId,
        shortlistId: charge.shortlistId,
        stripePaymentIntentId: intent.id,
        attempt,
      },
    });
    return { status: "PROCESANDO" as const, paymentIntentId: intent.id };
  } catch (error) {
    const reason = error instanceof Error ? error.message : "Cobro rechazado";
    await failSelectionCharge(database, charge.chargeId, reason);
    return { status: "FALLIDO" as const, paymentIntentId: null };
  }
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
      const charges = await database.query(
        `SELECT bi.id, bi.description, bi.amount_cents, bi.status, bi.service_date,
                bi.collection_requested_at, bi.paid_at, bi.failure_reason, bi.retry_count,
                s.project_id, p.title AS project_title
           FROM billable_items bi
           JOIN shortlists s ON s.id = bi.shortlist_id
           JOIN projects p ON p.id = s.project_id
          WHERE bi.professional_id = $1 AND bi.invoice_id IS NULL
          ORDER BY bi.service_date DESC LIMIT 100`,
        [request.user!.id],
      );
      const legacyInvoices = await database.query(
        `SELECT id, period_start, period_end, total_cents, status, failure_reason, paid_at
           FROM weekly_invoices WHERE professional_id = $1 ORDER BY period_end DESC LIMIT 52`,
        [request.user!.id],
      );
      response.json({
        account: account.rows[0] ?? null,
        charges: charges.rows,
        legacyInvoices: legacyInvoices.rows,
      });
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
        await database.query(
          "UPDATE billing_accounts SET stripe_customer_id = $2, updated_at = now() WHERE professional_id = $1",
          [request.user!.id, customerId],
        );
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

  router.post("/billing/charges/:id/retry", requireAuth, requireRole("profesional"), async (request, response, next) => {
    try {
      if (!stripe) return response.status(503).json({ error: "Stripe todavía no está configurado." });
      const parsedChargeId = z.string().uuid().safeParse(request.params.id);
      if (!parsedChargeId.success) return response.status(400).json({ error: "Cargo no válido." });
      const charge = await withTransaction(database, async (client) => {
        const current = await client.query<{
          id: string;
          shortlist_id: string;
          amount_cents: string;
          professional_id: string;
          retry_count: number;
          stripe_customer_id: string;
          stripe_payment_method_id: string;
        }>(
          `SELECT bi.id, bi.shortlist_id, bi.amount_cents::text, bi.professional_id, bi.retry_count,
                  b.stripe_customer_id, b.stripe_payment_method_id
             FROM billable_items bi
             JOIN billing_accounts b ON b.professional_id = bi.professional_id
            WHERE bi.id = $1 AND bi.professional_id = $2 AND bi.invoice_id IS NULL
              AND bi.status = 'FALLIDO'
              AND b.stripe_customer_id IS NOT NULL AND b.stripe_payment_method_id IS NOT NULL
            FOR UPDATE OF bi`,
          [parsedChargeId.data, request.user!.id],
        );
        const row = current.rows[0];
        if (!row) return null;
        const retryCount = row.retry_count + 1;
        await client.query(
          `UPDATE billable_items
              SET status = 'PENDIENTE', retry_count = $2, failure_reason = NULL, updated_at = now()
            WHERE id = $1`,
          [row.id, retryCount],
        );
        return {
          chargeId: row.id,
          shortlistId: row.shortlist_id,
          professionalId: row.professional_id,
          amountCents: Number(row.amount_cents),
          stripeCustomerId: row.stripe_customer_id,
          stripePaymentMethodId: row.stripe_payment_method_id,
          attempt: retryCount,
        } satisfies ImmediateSelectionCharge;
      });
      if (!charge) return response.status(404).json({ error: "Cargo pendiente no encontrado." });
      const result = await collectSelectionCharge(database, stripe, charge);
      response.json({ success: true, status: result.status });
    } catch (error) { next(error); }
  });

  // Compatibilidad de cobro para facturas históricas creadas antes del cambio de modelo.
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
      if (!row) return response.status(404).json({ error: "Factura histórica pendiente no encontrada." });
      const intent = await stripe.paymentIntents.create({
        amount: Number(row.total_cents),
        currency: "eur",
        customer: row.stripe_customer_id,
        payment_method: row.stripe_payment_method_id,
        payment_method_types: ["sepa_debit"],
        confirm: true,
        off_session: true,
        description: "MiConstructor · recuperación de saldo histórico",
        metadata: { invoice_id: invoiceId, professional_id: request.user!.id },
      }, { idempotencyKey: `miconstructor-legacy-retry-${invoiceId}-${Date.now().toString().slice(0, 10)}` });
      await database.query(
        `UPDATE weekly_invoices
            SET status = 'PROCESANDO', stripe_payment_intent_id = $2,
                collection_requested_at = now(), failure_reason = NULL, updated_at = now()
          WHERE id = $1`,
        [invoiceId, intent.id],
      );
      response.json({ success: true, status: "PROCESANDO" });
    } catch (error) { next(error); }
  });

  router.post("/jobs/weekly-billing", (_request, response) => {
    response.status(410).json({
      error: "La facturación semanal está desactivada. Cada profesional seleccionado se cobra automáticamente en el momento de la selección.",
      billingMode: "IMMEDIATE_PER_SELECTION",
    });
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

    const claimed = await database.query(
      `INSERT INTO stripe_webhook_events
        (event_id, event_type, processing_started_at, attempts)
       VALUES ($1, $2, now(), 1)
       ON CONFLICT (event_id) DO UPDATE SET
         event_type = EXCLUDED.event_type,
         processing_started_at = now(),
         processing_error = NULL,
         attempts = stripe_webhook_events.attempts + 1
       WHERE stripe_webhook_events.processed_at IS NULL
         AND (stripe_webhook_events.processing_started_at IS NULL
              OR stripe_webhook_events.processing_started_at < now() - interval '5 minutes')
       RETURNING event_id`,
      [event.id, event.type],
    );
    if (!claimed.rows[0]) {
      const state = await database.query<{ processed_at: Date | null; processing_started_at: Date | null }>(
        "SELECT processed_at, processing_started_at FROM stripe_webhook_events WHERE event_id = $1",
        [event.id],
      );
      return response.json({
        received: true,
        duplicate: Boolean(state.rows[0]?.processed_at),
        inProgress: Boolean(!state.rows[0]?.processed_at && state.rows[0]?.processing_started_at),
      });
    }

    try {
      if (event.type === "setup_intent.succeeded") {
        const intent = event.data.object as Stripe.SetupIntent;
        const professionalId = intent.metadata?.miconstructor_user_id;
        const paymentMethodId = typeof intent.payment_method === "string" ? intent.payment_method : intent.payment_method?.id;
        const customerId = typeof intent.customer === "string" ? intent.customer : intent.customer?.id;
        const mandate = typeof intent.mandate === "string" ? intent.mandate : intent.mandate?.id;
        if (professionalId && paymentMethodId && customerId) {
          await database.query(
            `UPDATE billing_accounts
                SET status = CASE WHEN overdue_balance_cents > 0 THEN 'SUSPENDIDO_IMPAGO' ELSE 'ACTIVO' END,
                    stripe_customer_id = $2, stripe_payment_method_id = $3,
                    sepa_mandate_reference = $4, updated_at = now()
              WHERE professional_id = $1`,
            [professionalId, customerId, paymentMethodId, mandate ?? null],
          );
        }
      }
      if (event.type === "payment_intent.succeeded") {
        const intent = event.data.object as Stripe.PaymentIntent;
        if (intent.metadata.selection_charge_id) {
          await markSelectionChargePaid(database, intent.metadata.selection_charge_id);
        } else if (intent.metadata.invoice_id) {
          await markInvoicePaid(database, intent.metadata.invoice_id);
        }
      }
      if (event.type === "payment_intent.payment_failed" || event.type === "payment_intent.canceled") {
        const intent = event.data.object as Stripe.PaymentIntent;
        const reason = intent.last_payment_error?.message ?? "Adeudo rechazado";
        if (intent.metadata.selection_charge_id) {
          await failSelectionCharge(database, intent.metadata.selection_charge_id, reason);
        } else if (intent.metadata.invoice_id) {
          await suspendForInvoiceFailure(database, intent.metadata.invoice_id, reason);
        }
      }
      await database.query(
        `UPDATE stripe_webhook_events
            SET processed_at = now(), processing_started_at = NULL, processing_error = NULL
          WHERE event_id = $1`,
        [event.id],
      );
      response.json({ received: true });
    } catch (error) {
      await database.query(
        `UPDATE stripe_webhook_events
            SET processing_started_at = NULL, processing_error = $2
          WHERE event_id = $1`,
        [event.id, error instanceof Error ? error.message.slice(0, 500) : "Error"],
      );
      response.status(500).send("Error procesando webhook");
    }
  };
}
