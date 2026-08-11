import { randomUUID } from "node:crypto";
import { Router } from "express";
import {
  evaluateProfessionalAssessment,
  getProfessionalSpecialties,
  getPublicProfessionalAssessment,
} from "../../../lib/professional-assessment.js";
import {
  evaluateHomeServiceAssessment,
  getHomeServiceProfessionalSpecialties,
  getPublicHomeServiceAssessment,
} from "../../../lib/home-service-assessment.js";
import type { Database } from "../db.js";
import { requireAuth, requireRole } from "../services/auth.js";

export function unifiedAssessmentsRouter(database: Database) {
  const router = Router();

  router.get("/assessments", (_request, response) => {
    const specialties = [
      ...getProfessionalSpecialties(),
      ...getHomeServiceProfessionalSpecialties(),
    ];
    response.json({ specialties });
  });

  router.get("/assessments/:specialty", (request, response) => {
    const assessment = getPublicProfessionalAssessment(request.params.specialty)
      ?? getPublicHomeServiceAssessment(request.params.specialty);
    if (!assessment) return response.status(404).json({ error: "Especialidad no disponible." });
    response.json({ assessment });
  });

  router.post("/assessments/:specialty/submit", requireAuth, requireRole("profesional"), async (request, response, next) => {
    try {
      const constructionAssessment = getPublicProfessionalAssessment(request.params.specialty);
      const homeAssessment = constructionAssessment ? null : getPublicHomeServiceAssessment(request.params.specialty);
      if (!constructionAssessment && !homeAssessment) return response.status(404).json({ error: "Especialidad no disponible." });
      const payload = { ...request.body, especialidad: request.params.specialty };
      const result = constructionAssessment
        ? evaluateProfessionalAssessment(payload)
        : evaluateHomeServiceAssessment(payload);
      if (!result.valid) return response.status(400).json({ error: result.error });
      if (!result.passed) return response.status(422).json({ error: "Evaluación no superada.", score: result.score, minimum: 80 });
      await database.query(
        `INSERT INTO professional_specialty_qualifications
          (id, professional_id, specialty_slug, specialty_label, is_primary,
           assessment_version, question_count, score, passed_at, verification_status)
         VALUES ($1,$2,$3,$4,false,$5,$6,$7,now(),'PENDIENTE_REVISION')
         ON CONFLICT (professional_id, specialty_slug) DO UPDATE SET
           assessment_version=EXCLUDED.assessment_version,
           question_count=EXCLUDED.question_count,
           score=EXCLUDED.score,
           passed_at=now(), verification_status='PENDIENTE_REVISION',
           reviewed_at=NULL, reviewed_by=NULL, review_reason=NULL, updated_at=now()`,
        [randomUUID(), request.user!.id, result.specialtySlug, result.specialtyLabel, result.version, result.total, result.score],
      );
      response.json({ success: true, score: result.score, status: "PENDIENTE_REVISION" });
    } catch (error) { next(error); }
  });

  return router;
}
