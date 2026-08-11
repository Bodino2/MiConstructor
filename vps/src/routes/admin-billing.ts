import { Router } from "express";
import { z } from "zod";
import type { Database } from "../db.js";
import { requireAuth, requireRole } from "../services/auth.js";

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

const billingListSchema = z.object({
  status: z.enum(["PENDIENTE", "PROCESANDO", "FACTURADO", "PAGADO", "FALLIDO"]).optional(),
  q: z.string().trim().max(120).optional(),
  from: isoDate.optional(),
  to: isoDate.optional(),
  limit: z.coerce.number().int().min(1).max(500).default(200),
}).refine((value) => !value.from || !value.to || value.from <= value.to, {
  message: "La fecha inicial no puede ser posterior a la fecha final.",
});

export function adminBillingRouter(database: Database) {
  const router = Router();
  router.use(requireAuth, requireRole("admin"));

  router.get("/admin/billing", async (request, response, next) => {
    try {
      const parsed = billingListSchema.safeParse(request.query);
      if (!parsed.success) {
        return response.status(400).json({ error: parsed.error.issues[0]?.message || "Filtros de facturación no válidos." });
      }

      const filters = parsed.data;
      const search = filters.q?.trim() || null;
      const status = filters.status ?? null;
      const from = filters.from ?? null;
      const to = filters.to ?? null;

      const [summaryResult, ledgerResult] = await Promise.all([
        database.query<Record<string, string>>(
          `SELECT
             (
               COALESCE((
                 SELECT sum(amount_cents)
                   FROM billable_items
                  WHERE invoice_id IS NULL
                    AND status = 'PAGADO'
                    AND paid_at >= date_trunc('month', now() AT TIME ZONE 'Europe/Madrid') AT TIME ZONE 'Europe/Madrid'
               ), 0)
               +
               COALESCE((
                 SELECT sum(total_cents)
                   FROM weekly_invoices
                  WHERE status = 'PAGADA'
                    AND paid_at >= date_trunc('month', now() AT TIME ZONE 'Europe/Madrid') AT TIME ZONE 'Europe/Madrid'
               ), 0)
             )::text AS paid_this_month_cents,
             (
               COALESCE((
                 SELECT sum(amount_cents)
                   FROM billable_items
                  WHERE invoice_id IS NULL AND status = 'PROCESANDO'
               ), 0)
               +
               COALESCE((
                 SELECT sum(total_cents)
                   FROM weekly_invoices
                  WHERE status = 'PROCESANDO'
               ), 0)
             )::text AS processing_cents,
             COALESCE((SELECT sum(overdue_balance_cents) FROM billing_accounts), 0)::text AS overdue_balance_cents,
             (
               (SELECT count(*) FROM billable_items WHERE invoice_id IS NULL AND status = 'PAGADO')
               +
               (SELECT count(*) FROM weekly_invoices WHERE status = 'PAGADA')
             )::text AS paid_count,
             (
               (SELECT count(*) FROM billable_items WHERE invoice_id IS NULL AND status = 'PROCESANDO')
               +
               (SELECT count(*) FROM weekly_invoices WHERE status = 'PROCESANDO')
             )::text AS processing_count,
             (
               (SELECT count(*) FROM billable_items WHERE invoice_id IS NULL AND status = 'FALLIDO')
               +
               (SELECT count(*) FROM weekly_invoices WHERE status = 'FALLIDA')
             )::text AS failed_count`,
        ),
        database.query(
          `WITH ledger AS (
             SELECT
               bi.id,
               'SELECCION'::text AS entry_type,
               bi.professional_id,
               u.name AS professional_name,
               u.company_name AS professional_company,
               u.email AS professional_email,
               p.id AS project_id,
               p.title AS project_title,
               bi.description,
               bi.amount_cents::text AS amount_cents,
               bi.status::text AS status,
               bi.service_date,
               bi.collection_requested_at,
               bi.paid_at,
               bi.failure_reason,
               bi.retry_count,
               bi.created_at,
               ba.status AS account_status,
               COALESCE(ba.overdue_balance_cents, 0)::text AS account_overdue_balance_cents
             FROM billable_items bi
             JOIN users u ON u.id = bi.professional_id
             JOIN shortlists s ON s.id = bi.shortlist_id
             JOIN projects p ON p.id = s.project_id
             LEFT JOIN billing_accounts ba ON ba.professional_id = bi.professional_id
             WHERE bi.invoice_id IS NULL

             UNION ALL

             SELECT
               wi.id,
               'FACTURA_HISTORICA'::text AS entry_type,
               wi.professional_id,
               u.name AS professional_name,
               u.company_name AS professional_company,
               u.email AS professional_email,
               NULL::uuid AS project_id,
               NULL::text AS project_title,
               ('Factura semanal histórica · ' || to_char(wi.period_start AT TIME ZONE 'Europe/Madrid', 'DD/MM/YYYY')
                 || '–' || to_char(wi.period_end AT TIME ZONE 'Europe/Madrid', 'DD/MM/YYYY'))::text AS description,
               wi.total_cents::text AS amount_cents,
               CASE wi.status
                 WHEN 'PENDIENTE_COBRO' THEN 'PENDIENTE'
                 WHEN 'PAGADA' THEN 'PAGADO'
                 WHEN 'FALLIDA' THEN 'FALLIDO'
                 ELSE wi.status
               END::text AS status,
               wi.period_end AS service_date,
               wi.collection_requested_at,
               wi.paid_at,
               wi.failure_reason,
               0::integer AS retry_count,
               wi.created_at,
               ba.status AS account_status,
               COALESCE(ba.overdue_balance_cents, 0)::text AS account_overdue_balance_cents
             FROM weekly_invoices wi
             JOIN users u ON u.id = wi.professional_id
             LEFT JOIN billing_accounts ba ON ba.professional_id = wi.professional_id
           )
           SELECT *
             FROM ledger
            WHERE ($1::text IS NULL OR status = $1)
              AND ($2::text IS NULL
                OR professional_email ILIKE '%' || $2 || '%'
                OR professional_name ILIKE '%' || $2 || '%'
                OR COALESCE(professional_company, '') ILIKE '%' || $2 || '%'
                OR COALESCE(project_title, '') ILIKE '%' || $2 || '%'
                OR description ILIKE '%' || $2 || '%')
              AND ($3::date IS NULL OR service_date >= $3::date)
              AND ($4::date IS NULL OR service_date < ($4::date + interval '1 day'))
            ORDER BY COALESCE(paid_at, collection_requested_at, service_date, created_at) DESC, created_at DESC
            LIMIT $5`,
          [status, search, from, to, filters.limit],
        ),
      ]);

      const summary = summaryResult.rows[0]!;
      return response.json({
        summary: {
          paidThisMonthCents: Number(summary.paid_this_month_cents),
          processingCents: Number(summary.processing_cents),
          overdueBalanceCents: Number(summary.overdue_balance_cents),
          paidCount: Number(summary.paid_count),
          processingCount: Number(summary.processing_count),
          failedCount: Number(summary.failed_count),
        },
        entries: ledgerResult.rows,
        filters: { status, q: search, from, to, limit: filters.limit },
      });
    } catch (error) {
      next(error);
    }
  });

  return router;
}
