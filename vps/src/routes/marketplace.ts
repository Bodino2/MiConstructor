import { randomUUID } from "node:crypto";
import { Router } from "express";
import { z } from "zod";
import { estimateHomeServicePrice } from "../../../lib/home-service-pricing.js";
import {
  evaluateProfessionalAssessment,
  getProfessionalSpecialties,
  getPublicProfessionalAssessment,
  getSpecialtySlugForProjectCategory,
} from "../../../lib/professional-assessment.js";
import { estimateProjectPrice } from "../../../lib/project-estimator.js";
import { calculateShortlistFee } from "../../../lib/shortlist-pricing.js";
import type { AppConfig } from "../config.js";
import type { Database } from "../db.js";
import { withTransaction } from "../db.js";
import { audit } from "../services/audit.js";
import { requireAuth, requireRole } from "../services/auth.js";
import { collectSelectionCharge, stripeClient, type ImmediateSelectionCharge } from "./billing.js";

const projectSchema = z.object({
  title: z.string().trim().min(5).max(160),
  description: z.string().trim().min(30).max(5000),
  category: z.string().trim().min(2).max(80),
  projectType: z.enum(["bano", "cocina", "reforma_integral", "construccion_casa"]),
  location: z.string().trim().min(2).max(160),
  squareMeters: z.coerce.number().positive().max(1000),
  qualityLevel: z.enum(["basico", "estandar", "premium"]),
  budgetCents: z.coerce.number().int().positive().max(500_000_000).optional(),
});

const proposalSchema = z.object({
  projectId: z.string().uuid(),
  amountCents: z.coerce.number().int().positive().max(500_000_000),
  estimatedDays: z.coerce.number().int().positive().max(3650),
  message: z.string().trim().min(30).max(5000),
});

export function marketplaceRouter(database: Database, config: AppConfig, stripe = stripeClient(config)) {
  const router = Router();

  router.get("/assessments", (_request, response) => {
    response.json({ specialties: getProfessionalSpecialties() });
  });

  router.get("/assessments/:specialty", (request, response) => {
    const assessment = getPublicProfessionalAssessment(request.params.specialty);
    if (!assessment) return response.status(404).json({ error: "Especialidad no disponible." });
    response.json({ assessment });
  });

  router.post("/assessments/:specialty/submit", requireAuth, requireRole("profesional"), async (request, response, next) => {
    try {
      const result = evaluateProfessionalAssessment({
        ...request.body,
        especialidad: request.params.specialty,
      });
      if (!result.valid) return response.status(400).json({ error: result.error });
      if (!result.passed) return response.status(422).json({ error: "Evaluación no superada.", score: result.score, minimum: 80 });
      await database.query(
        `INSERT INTO professional_specialty_qualifications
          (id, professional_id, specialty_slug, specialty_label, is_primary,
           assessment_version, question_count, score, passed_at, verification_status)
         VALUES ($1, $2, $3, $4, false, $5, $6, $7, now(), 'PENDIENTE_REVISION')
         ON CONFLICT (professional_id, specialty_slug) DO UPDATE SET
           assessment_version = EXCLUDED.assessment_version,
           question_count = EXCLUDED.question_count,
           score = EXCLUDED.score,
           passed_at = now(), verification_status = 'PENDIENTE_REVISION',
           reviewed_at = NULL, reviewed_by = NULL, review_reason = NULL, updated_at = now()`,
        [randomUUID(), request.user!.id, result.specialtySlug, result.specialtyLabel, result.version, result.total, result.score],
      );
      response.json({ success: true, score: result.score, status: "PENDIENTE_REVISION" });
    } catch (error) { next(error); }
  });

  router.post("/estimate", (request, response) => {
    const body = request.body && typeof request.body === "object" ? request.body as Record<string, unknown> : {};
    const estimate = typeof body.serviceSlug === "string"
      ? estimateHomeServicePrice(body)
      : estimateProjectPrice(body);
    if (!estimate.valid) return response.status(400).json(estimate);
    response.json(estimate);
  });

  router.post("/projects", requireAuth, requireRole("cliente"), async (request, response, next) => {
    try {
      const parsed = projectSchema.safeParse(request.body);
      if (!parsed.success) return response.status(400).json({ error: parsed.error.issues[0]?.message });
      const specialtySlug = getSpecialtySlugForProjectCategory(parsed.data.category);
      if (!specialtySlug) return response.status(400).json({ error: "Especialidad de proyecto no válida." });
      const estimate = estimateProjectPrice({
        projectType: parsed.data.projectType,
        squareMeters: parsed.data.squareMeters,
        qualityLevel: parsed.data.qualityLevel,
      }) as { valid: boolean; range?: { minimum: number; maximum: number }; version?: string };
      if (!estimate.valid || !estimate.range) {
        return response.status(400).json({ error: "No se puede estimar esta categoría todavía." });
      }
      const suggestedBudgetCents = Math.round(((estimate.range.minimum + estimate.range.maximum) / 2) * 100);
      const budgetCents = parsed.data.budgetCents ?? suggestedBudgetCents;
      if (budgetCents < Math.round(estimate.range.minimum * 50) || budgetCents > Math.round(estimate.range.maximum * 200)) {
        return response.status(400).json({ error: "El presupuesto indicado queda fuera de un rango razonable para los datos introducidos." });
      }
      const id = randomUUID();
      await withTransaction(database, async (client) => {
        await client.query(
          `INSERT INTO projects
            (id, owner_id, title, description, category, project_type, location, square_meters,
             quality_level, budget_cents, estimator_version, status)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 'PUBLICADO')`,
          [id, request.user!.id, parsed.data.title, parsed.data.description, specialtySlug, parsed.data.projectType, parsed.data.location, parsed.data.squareMeters, parsed.data.qualityLevel, budgetCents, estimate.version ?? null],
        );
        await audit(client, { actorUserId: request.user!.id, action: "PROJECT_PUBLISHED", entityType: "project", entityId: id, ip: request.ip });
      });
      response.status(201).json({ success: true, project: { id, ...parsed.data, budgetCents, status: "PUBLICADO" }, estimate });
    } catch (error) { next(error); }
  });

  router.get("/projects", requireAuth, async (request, response, next) => {
    try {
      if (request.user!.role === "cliente") {
        const rows = await database.query(
          `SELECT id, title, description, category, project_type, location, budget_cents, status, created_at
             FROM projects WHERE owner_id = $1 ORDER BY created_at DESC LIMIT 100`,
          [request.user!.id],
        );
        return response.json({ projects: rows.rows });
      }
      if (request.user!.role === "profesional") {
        const rows = await database.query(
          `SELECT p.id, p.title, p.description, p.category, p.project_type, p.location, p.budget_cents,
                  p.status, p.created_at, EXISTS(
                    SELECT 1 FROM proposals pr WHERE pr.project_id = p.id AND pr.professional_id = $1
                  ) AS already_applied
             FROM projects p
            WHERE p.status = 'PUBLICADO'
              AND EXISTS (
                SELECT 1 FROM professional_specialty_qualifications q
                 WHERE q.professional_id = $1
                   AND q.specialty_slug = p.category
                   AND q.verification_status = 'APROBADO'
              )
            ORDER BY p.created_at DESC LIMIT 100`,
          [request.user!.id],
        );
        return response.json({ projects: rows.rows });
      }
      const rows = await database.query("SELECT * FROM projects ORDER BY created_at DESC LIMIT 100");
      return response.json({ projects: rows.rows });
    } catch (error) { next(error); }
  });

  router.get("/projects/:id", requireAuth, async (request, response, next) => {
    try {
      const id = z.string().uuid().safeParse(request.params.id);
      if (!id.success) return response.status(400).json({ error: "Proyecto no válido." });
      const project = await database.query<Record<string, unknown>>(
        `SELECT id, owner_id, title, description, category, project_type, location, budget_cents,
                status, assigned_professional_id, created_at
           FROM projects WHERE id = $1`,
        [id.data],
      );
      const row = project.rows[0];
      if (!row) return response.status(404).json({ error: "Proyecto no encontrado." });
      const isOwner = row.owner_id === request.user!.id;
      if (!isOwner && request.user!.role === "cliente") return response.status(404).json({ error: "Proyecto no encontrado." });
      const result: Record<string, unknown> = { ...row, owner_id: undefined };
      if (isOwner || request.user!.role === "admin") {
        const proposals = await database.query(
          `SELECT pr.id, pr.amount_cents, pr.estimated_days, pr.message, pr.status, pr.created_at,
                  u.id AS professional_id, u.name, u.company_name,
                  COALESCE(rv.rating, 0) AS rating, COALESCE(rv.review_count, 0) AS review_count,
                  EXISTS (SELECT 1 FROM insurance_policies ip WHERE ip.professional_id = u.id AND ip.status = 'APROBADA' AND ip.valid_until >= current_date) AS insured
             FROM proposals pr JOIN users u ON u.id = pr.professional_id
             LEFT JOIN LATERAL (
               SELECT round(avg(r.rating)::numeric, 1) AS rating, count(*) AS review_count
                 FROM reviews r WHERE r.subject_id = u.id AND r.status = 'PUBLICADA'
             ) rv ON true
            WHERE pr.project_id = $1 ORDER BY pr.created_at`,
          [id.data],
        );
        result.proposals = proposals.rows;
      }
      response.json({ project: result });
    } catch (error) { next(error); }
  });

  router.get("/professionals/:id/profile", requireAuth, async (request, response, next) => {
    try {
      const id = z.string().uuid().safeParse(request.params.id);
      if (!id.success) return response.status(404).json({ error: "Profesional no encontrado." });
      const professional = await database.query(
        `SELECT id, name, company_name, verification_status,
                EXISTS (SELECT 1 FROM insurance_policies i
                         WHERE i.professional_id = users.id AND i.status = 'APROBADA'
                           AND i.valid_until >= current_date) AS insured
           FROM users WHERE id = $1 AND role = 'profesional' AND verification_status = 'APROBADO'`,
        [id.data],
      );
      if (!professional.rows[0]) return response.status(404).json({ error: "Profesional no encontrado." });
      const qualifications = await database.query(
        `SELECT specialty_slug, specialty_label, score, reviewed_at
           FROM professional_specialty_qualifications
          WHERE professional_id = $1 AND verification_status = 'APROBADO'
          ORDER BY is_primary DESC, specialty_label`,
        [id.data],
      );
      const reviews = await database.query(
        `SELECT r.rating, r.comment, r.published_at, split_part(u.name, ' ', 1) AS author_name
           FROM reviews r JOIN users u ON u.id = r.author_id
          WHERE r.subject_id = $1 AND r.status = 'PUBLICADA'
          ORDER BY r.published_at DESC LIMIT 100`,
        [id.data],
      );
      const portfolio = await database.query(
        `SELECT p.id, p.title, p.description, p.category, p.location, p.completion_year,
                COALESCE(json_agg(json_build_object('fileId', f.id, 'phase', pf.phase, 'contentType', f.content_type)
                  ORDER BY pf.sort_order) FILTER (WHERE f.id IS NOT NULL), '[]') AS images
           FROM portfolio_projects p
           LEFT JOIN portfolio_files pf ON pf.portfolio_id = p.id
           LEFT JOIN stored_files f ON f.id = pf.file_id AND f.moderation_status = 'APROBADO'
          WHERE p.professional_id = $1 AND p.status = 'PUBLICADO'
          GROUP BY p.id ORDER BY p.created_at DESC`,
        [id.data],
      );
      response.json({ professional: professional.rows[0], qualifications: qualifications.rows, reviews: reviews.rows, portfolio: portfolio.rows });
    } catch (error) { next(error); }
  });

  router.post("/proposals", requireAuth, requireRole("profesional"), async (request, response, next) => {
    try {
      const parsed = proposalSchema.safeParse(request.body);
      if (!parsed.success) return response.status(400).json({ error: parsed.error.issues[0]?.message });
      const eligibility = await database.query<{ project_status: string; category: string; account_status: string; billing_status: string; qualification_status: string | null }>(
        `SELECT p.status AS project_status, p.category, u.verification_status AS account_status,
                b.status AS billing_status, q.verification_status AS qualification_status
           FROM projects p
           JOIN users u ON u.id = $2
           JOIN billing_accounts b ON b.professional_id = u.id
           LEFT JOIN professional_specialty_qualifications q
             ON q.professional_id = u.id AND q.specialty_slug = p.category
          WHERE p.id = $1`,
        [parsed.data.projectId, request.user!.id],
      );
      const state = eligibility.rows[0];
      if (!state) return response.status(404).json({ error: "Proyecto no encontrado." });
      if (state.project_status !== "PUBLICADO") return response.status(409).json({ error: "El proyecto ya no admite propuestas." });
      if (state.account_status !== "APROBADO" || state.qualification_status !== "APROBADO") {
        return response.status(403).json({ error: "Tu cuenta y la especialidad exacta del proyecto deben estar aprobadas." });
      }
      if (state.billing_status !== "ACTIVO") return response.status(402).json({ error: "Debes activar la domiciliación y no tener saldos vencidos." });
      const id = randomUUID();
      await database.query(
        `INSERT INTO proposals (id, project_id, professional_id, amount_cents, estimated_days, message)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [id, parsed.data.projectId, request.user!.id, parsed.data.amountCents, parsed.data.estimatedDays, parsed.data.message],
      );
      response.status(201).json({ success: true, proposal: { id, status: "ENVIADA" } });
    } catch (error: unknown) {
      if (typeof error === "object" && error && "code" in error && error.code === "23505") {
        return response.status(409).json({ error: "Ya has enviado una propuesta para este proyecto." });
      }
      next(error);
    }
  });

  router.post("/projects/:id/shortlist", requireAuth, requireRole("cliente"), async (request, response, next) => {
    try {
      const projectId = z.string().uuid().safeParse(request.params.id);
      const professionalId = z.string().uuid().safeParse(request.body?.professionalId);
      if (!projectId.success || !professionalId.success) return response.status(400).json({ error: "Selección no válida." });

      const result = await withTransaction(database, async (client) => {
        const project = await client.query<{ owner_id: string; budget_cents: string; status: string }>(
          "SELECT owner_id, budget_cents, status FROM projects WHERE id = $1 FOR UPDATE",
          [projectId.data],
        );
        const row = project.rows[0];
        if (!row || row.owner_id !== request.user!.id) {
          return { status: 404, body: { error: "Proyecto no encontrado." }, charge: null as ImmediateSelectionCharge | null };
        }
        if (row.status !== "PUBLICADO") {
          return { status: 409, body: { error: "El proyecto ya no admite selecciones." }, charge: null as ImmediateSelectionCharge | null };
        }

        const existing = await client.query<{
          id: string;
          phone: string | null;
          email: string;
          name: string;
          company_name: string | null;
          charge_id: string | null;
          charge_amount: string | null;
          charge_status: string | null;
          retry_count: number | null;
          stripe_customer_id: string | null;
          stripe_payment_method_id: string | null;
        }>(
          `SELECT s.id, u.phone, u.email, u.name, u.company_name,
                  bi.id AS charge_id, bi.amount_cents::text AS charge_amount,
                  bi.status AS charge_status, bi.retry_count,
                  b.stripe_customer_id, b.stripe_payment_method_id
             FROM shortlists s
             JOIN users u ON u.id = s.professional_id
             JOIN billing_accounts b ON b.professional_id = s.professional_id
             LEFT JOIN billable_items bi ON bi.shortlist_id = s.id
            WHERE s.project_id = $1 AND s.professional_id = $2`,
          [projectId.data, professionalId.data],
        );
        const selected = existing.rows[0];
        if (selected) {
          const pendingCharge = selected.charge_id
            && selected.charge_amount
            && selected.charge_status === "PENDIENTE"
            && selected.stripe_customer_id
            && selected.stripe_payment_method_id
            ? {
                chargeId: selected.charge_id,
                shortlistId: selected.id,
                professionalId: professionalId.data,
                amountCents: Number(selected.charge_amount),
                stripeCustomerId: selected.stripe_customer_id,
                stripePaymentMethodId: selected.stripe_payment_method_id,
                attempt: selected.retry_count ?? 0,
              } satisfies ImmediateSelectionCharge
            : null;
          return {
            status: 200,
            body: {
              success: true,
              alreadySelected: true,
              contact: {
                email: selected.email,
                phone: selected.phone,
                name: selected.name,
                companyName: selected.company_name,
              },
            },
            charge: pendingCharge,
          };
        }

        const professional = await client.query<{
          email: string;
          phone: string | null;
          name: string;
          company_name: string | null;
          billing_status: string;
          overdue: string;
          stripe_customer_id: string | null;
          stripe_payment_method_id: string | null;
        }>(
          `SELECT u.email, u.phone, u.name, u.company_name, b.status AS billing_status,
                  b.overdue_balance_cents::text AS overdue,
                  b.stripe_customer_id, b.stripe_payment_method_id
             FROM users u
             JOIN billing_accounts b ON b.professional_id = u.id
             JOIN proposals pr ON pr.professional_id = u.id AND pr.project_id = $2
            WHERE u.id = $1
              AND u.role = 'profesional'
              AND u.account_status = 'ACTIVO'
              AND u.email_verified = true
              AND u.verification_status = 'APROBADO'
              AND pr.status = 'ENVIADA'`,
          [professionalId.data, projectId.data],
        );
        const pro = professional.rows[0];
        if (!pro) {
          return { status: 409, body: { error: "El profesional no está habilitado para este proyecto." }, charge: null as ImmediateSelectionCharge | null };
        }
        if (pro.billing_status !== "ACTIVO" || Number(pro.overdue) > 0 || !pro.stripe_customer_id || !pro.stripe_payment_method_id) {
          return { status: 402, body: { error: "El profesional no tiene una domiciliación activa." }, charge: null as ImmediateSelectionCharge | null };
        }

        const fee = calculateShortlistFee(Number(row.budget_cents));
        if (!fee.valid) {
          return { status: 422, body: { error: "No se puede calcular la tarifa de selección." }, charge: null as ImmediateSelectionCharge | null };
        }

        const shortlistId = randomUUID();
        const chargeId = randomUUID();
        const now = new Date();
        await client.query(
          `INSERT INTO shortlists
            (id, project_id, client_id, professional_id, project_budget_cents,
             fee_cents, pricing_version, contact_unlocked_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
          [shortlistId, projectId.data, request.user!.id, professionalId.data, row.budget_cents, fee.feeCents, fee.pricingVersion, now],
        );
        await client.query(
          `INSERT INTO billable_items
            (id, professional_id, shortlist_id, description, amount_cents, service_date, status)
           VALUES ($1, $2, $3, 'Selección de profesional', $4, $5, 'PENDIENTE')`,
          [chargeId, professionalId.data, shortlistId, fee.feeCents, now],
        );
        await client.query(
          `INSERT INTO conversations (id, project_id, client_id, professional_id, contact_unlocked_at)
           VALUES ($1, $2, $3, $4, $5)
           ON CONFLICT (project_id, professional_id) DO NOTHING`,
          [randomUUID(), projectId.data, request.user!.id, professionalId.data, now],
        );
        await audit(client, {
          actorUserId: request.user!.id,
          action: "PROFESSIONAL_SHORTLISTED",
          entityType: "project",
          entityId: projectId.data,
          ip: request.ip,
          metadata: { professionalId: professionalId.data, chargeMode: "IMMEDIATE_PER_SELECTION" },
        });

        return {
          status: 201,
          body: {
            success: true,
            contact: { email: pro.email, phone: pro.phone, name: pro.name, companyName: pro.company_name },
          },
          charge: {
            chargeId,
            shortlistId,
            professionalId: professionalId.data,
            amountCents: fee.feeCents,
            stripeCustomerId: pro.stripe_customer_id,
            stripePaymentMethodId: pro.stripe_payment_method_id,
            attempt: 0,
          } satisfies ImmediateSelectionCharge,
        };
      });

      if (result.charge) {
        await collectSelectionCharge(database, stripe, result.charge);
      }
      response.status(result.status).json(result.body);
    } catch (error) { next(error); }
  });

  return router;
}
