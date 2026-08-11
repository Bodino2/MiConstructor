import { Router } from "express";
import { z } from "zod";
import { estimateProjectPrice } from "../../../lib/project-estimator.js";
import { analyzeQuote, compareQuotes } from "../../../lib/quote-intelligence.js";
import type { Database } from "../db.js";
import { requireAuth } from "../services/auth.js";

const estimatorSchema = z.object({
  projectType: z.enum(["bano", "cocina", "reforma_integral", "construccion_casa"]),
  squareMeters: z.coerce.number().positive().max(1000),
  qualityLevel: z.enum(["basico", "estandar", "premium"]),
  conditionLevel: z.enum(["ligera", "media", "completa"]).optional(),
  accessLevel: z.enum(["facil", "normal", "complejo"]).optional(),
  floor: z.coerce.number().int().min(0).max(60).optional(),
  hasElevator: z.boolean().optional(),
  demolition: z.boolean().optional(),
  renewElectrical: z.boolean().optional(),
  renewPlumbing: z.boolean().optional(),
  structuralWork: z.boolean().optional(),
  occupiedHome: z.boolean().optional(),
  locationCostIndex: z.coerce.number().min(0.75).max(1.35).optional(),
});

const quoteSchema = z.object({
  amountCents: z.coerce.number().int().positive().max(500_000_000),
  estimatedDays: z.coerce.number().int().positive().max(3650),
  message: z.string().trim().min(10).max(10_000),
});

const quoteAnalysisSchema = z.object({
  project: estimatorSchema,
  quote: quoteSchema,
});

type ProjectRow = {
  id: string;
  owner_id: string;
  project_type: "bano" | "cocina" | "reforma_integral" | "construccion_casa";
  square_meters: string | number | null;
  quality_level: "basico" | "estandar" | "premium" | null;
  location: string;
};

type ProposalRow = {
  id: string;
  professional_id: string;
  amount_cents: string;
  estimated_days: number;
  message: string;
  name: string;
  company_name: string | null;
};

export function intelligenceRouter(database: Database) {
  const router = Router();

  router.post("/estimate-v2", (request, response) => {
    const parsed = estimatorSchema.safeParse(request.body);
    if (!parsed.success) return response.status(400).json({ error: parsed.error.issues[0]?.message });
    const estimate = estimateProjectPrice(parsed.data) as Record<string, unknown> & { valid: boolean };
    if (!estimate.valid) return response.status(400).json(estimate);
    return response.json(estimate);
  });

  router.post("/quote-analysis", (request, response) => {
    const parsed = quoteAnalysisSchema.safeParse(request.body);
    if (!parsed.success) return response.status(400).json({ error: parsed.error.issues[0]?.message });
    const estimate = estimateProjectPrice(parsed.data.project) as Record<string, unknown> & { valid: boolean };
    if (!estimate.valid) return response.status(400).json(estimate);
    return response.json({
      estimate,
      analysis: analyzeQuote({ project: parsed.data.project, estimate, quote: parsed.data.quote }),
    });
  });

  router.get("/projects/:id/quote-analysis", requireAuth, async (request, response, next) => {
    try {
      const projectId = z.string().uuid().safeParse(request.params.id);
      if (!projectId.success) return response.status(400).json({ error: "Proyecto no válido." });
      const projectResult = await database.query<ProjectRow>(
        `SELECT id, owner_id, project_type, square_meters, quality_level, location
           FROM projects WHERE id = $1`,
        [projectId.data],
      );
      const project = projectResult.rows[0];
      if (!project || (request.user!.role !== "admin" && project.owner_id !== request.user!.id)) {
        return response.status(404).json({ error: "Proyecto no encontrado." });
      }
      if (!project.square_meters || !project.quality_level) {
        return response.status(409).json({ error: "El proyecto no contiene suficientes datos para generar la comparación." });
      }

      const estimatorInput = {
        projectType: project.project_type,
        squareMeters: Number(project.square_meters),
        qualityLevel: project.quality_level,
      };
      const estimate = estimateProjectPrice(estimatorInput) as Record<string, unknown> & { valid: boolean };
      if (!estimate.valid) return response.status(409).json({ error: "No se ha podido generar la referencia de coste." });

      const proposalResult = await database.query<ProposalRow>(
        `SELECT pr.id, pr.professional_id, pr.amount_cents::text, pr.estimated_days, pr.message,
                u.name, u.company_name
           FROM proposals pr
           JOIN users u ON u.id = pr.professional_id
          WHERE pr.project_id = $1 AND pr.status = 'ENVIADA'
          ORDER BY pr.created_at`,
        [projectId.data],
      );
      const quotes = proposalResult.rows.map((row) => ({
        id: row.id,
        professionalId: row.professional_id,
        professionalName: row.name,
        companyName: row.company_name,
        amountCents: Number(row.amount_cents),
        estimatedDays: row.estimated_days,
        message: row.message,
      }));

      return response.json(compareQuotes({ project: estimatorInput, estimate, quotes }));
    } catch (error) {
      next(error);
    }
  });

  return router;
}
