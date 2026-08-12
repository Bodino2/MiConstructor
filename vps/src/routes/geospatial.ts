import { Router } from "express";
import { z } from "zod";
import type { AppConfig } from "../config.js";
import type { Database } from "../db.js";
import { requireAuth } from "../services/auth.js";
import {
  distanceLocationScore,
  GeocodingUnavailableError,
  haversineDistanceKm,
  LocalityNotFoundError,
  resolveSpainLocality,
} from "../services/geospatial.js";
import {
  availabilityFit,
  calculateProjectMatchScore,
  calculateVerifiedProfessionalScore,
  capacityFit,
  locationFit,
} from "../services/professional-ranking.js";

const resolveSchema = z.object({
  province: z.string().trim().min(2).max(100),
  locality: z.string().trim().min(2).max(100),
});

const toNumber = (value: unknown) => {
  const number = Number(value ?? 0);
  return Number.isFinite(number) ? number : 0;
};

type ProfessionalArea = {
  service_province: string | null;
  service_locality: string | null;
  service_latitude: number | string | null;
  service_longitude: number | string | null;
  travel_radius_km: number | string;
  service_areas: string[];
};

type ProjectArea = {
  location: string;
  latitude: number | string | null;
  longitude: number | string | null;
};

async function loadProfessionalArea(database: Database, professionalId: string) {
  const result = await database.query<ProfessionalArea>(
    `SELECT u.service_province, u.service_locality, u.service_latitude, u.service_longitude,
            COALESCE(a.travel_radius_km,u.service_radius_km,50) AS travel_radius_km,
            COALESCE(a.service_areas,'{}'::text[]) AS service_areas
       FROM users u
       LEFT JOIN professional_availability a ON a.professional_id=u.id
      WHERE u.id=$1 AND u.role='profesional'`,
    [professionalId],
  );
  return result.rows[0] ?? null;
}

function projectAreaDecision(project: ProjectArea, professional: ProfessionalArea) {
  const radiusKm = Math.max(1, toNumber(professional.travel_radius_km) || 50);
  if (
    project.latitude != null
    && project.longitude != null
    && professional.service_latitude != null
    && professional.service_longitude != null
  ) {
    const distanceKm = haversineDistanceKm(
      { latitude: toNumber(project.latitude), longitude: toNumber(project.longitude) },
      { latitude: toNumber(professional.service_latitude), longitude: toNumber(professional.service_longitude) },
    );
    return { allowed: distanceKm <= radiusKm, distanceKm, radiusKm, mode: "GEOSPATIAL_RADIUS" as const };
  }
  const serviceAreas = professional.service_areas ?? [];
  if (!serviceAreas.length) return { allowed: true, distanceKm: null, radiusKm, mode: "LEGACY_UNSCOPED" as const };
  return {
    allowed: locationFit(project.location, serviceAreas) >= 70,
    distanceKm: null,
    radiusKm,
    mode: "LEGACY_TEXT" as const,
  };
}

export function geospatialRouter(database: Database, config: AppConfig) {
  const router = Router();

  router.post("/geo/resolve", async (request, response, next) => {
    try {
      const parsed = resolveSchema.safeParse(request.body);
      if (!parsed.success) return response.status(400).json({ error: "Provincia o localidad no válida." });
      const location = await resolveSpainLocality(database, config, parsed.data);
      response.json({
        location: {
          province: location.province,
          locality: location.locality,
          latitude: location.latitude,
          longitude: location.longitude,
          formattedAddress: location.formattedAddress,
          cached: location.cached,
        },
      });
    } catch (error) {
      if (error instanceof LocalityNotFoundError) return response.status(404).json({ error: error.message });
      if (error instanceof GeocodingUnavailableError) return response.status(503).json({ error: error.message });
      next(error);
    }
  });

  // Intercepts professional discovery before the legacy marketplace route.
  // Clients/admins continue to the existing implementation unchanged.
  router.get("/projects", requireAuth, async (request, response, next) => {
    try {
      if (request.user!.role !== "profesional") return next();
      const professionalArea = await loadProfessionalArea(database, request.user!.id);
      if (!professionalArea) return next();
      const rows = await database.query<{
        id: string;
        title: string;
        description: string;
        category: string;
        project_type: string;
        location: string;
        budget_cents: string;
        status: string;
        created_at: string;
        already_applied: boolean;
        service_province: string | null;
        service_locality: string | null;
        latitude: number | string | null;
        longitude: number | string | null;
      }>(
        `SELECT p.id, p.title, p.description, p.category, p.project_type, p.location, p.budget_cents,
                p.status, p.created_at, p.service_province, p.service_locality, p.latitude, p.longitude,
                EXISTS(
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
          ORDER BY p.created_at DESC LIMIT 250`,
        [request.user!.id],
      );
      const projects = rows.rows.flatMap((project) => {
        const decision = projectAreaDecision(project, professionalArea);
        if (!decision.allowed) return [];
        return [{
          ...project,
          distance_km: decision.distanceKm == null ? null : Number(decision.distanceKm.toFixed(1)),
          matching_mode: decision.mode,
          professional_radius_km: decision.radiusKm,
        }];
      }).slice(0, 100);
      return response.json({ projects, radiusFiltered: true });
    } catch (error) { next(error); }
  });

  // A manual API call cannot bypass the professional's configured working radius.
  // The marketplace route still performs all billing, qualification and project-state checks afterwards.
  router.post("/proposals", requireAuth, async (request, response, next) => {
    try {
      if (request.user!.role !== "profesional") return next();
      const projectId = z.string().uuid().safeParse(request.body?.projectId);
      if (!projectId.success) return next();
      const [professionalArea, project] = await Promise.all([
        loadProfessionalArea(database, request.user!.id),
        database.query<ProjectArea>(
          "SELECT location, latitude, longitude FROM projects WHERE id=$1",
          [projectId.data],
        ),
      ]);
      const projectRow = project.rows[0];
      if (!professionalArea || !projectRow) return next();
      const decision = projectAreaDecision(projectRow, professionalArea);
      if (!decision.allowed) {
        return response.status(403).json({
          error: "El proyecto está fuera de tu radio de trabajo.",
          radiusKm: decision.radiusKm,
          distanceKm: decision.distanceKm == null ? null : Number(decision.distanceKm.toFixed(1)),
        });
      }
      return next();
    } catch (error) { next(error); }
  });

  // This route intentionally runs before the legacy operating-system matcher.
  // If a project has no coordinates yet, it falls through to the textual matcher
  // so old data remains usable while locations are progressively geocoded.
  router.get("/projects/:id/matches", requireAuth, async (request, response, next) => {
    try {
      const projectId = z.string().uuid().safeParse(request.params.id);
      if (!projectId.success) return response.status(400).json({ error: "Proyecto no válido." });
      const project = await database.query<{
        id: string;
        owner_id: string;
        category: string;
        location: string;
        status: string;
        service_province: string | null;
        service_locality: string | null;
        latitude: number | string | null;
        longitude: number | string | null;
      }>(
        `SELECT id, owner_id, category, location, status, service_province, service_locality, latitude, longitude
           FROM projects WHERE id=$1`,
        [projectId.data],
      );
      const projectRow = project.rows[0];
      if (!projectRow || (request.user!.role !== "admin" && projectRow.owner_id !== request.user!.id)) {
        return response.status(404).json({ error: "Proyecto no encontrado." });
      }
      if (projectRow.latitude == null || projectRow.longitude == null) return next();

      const candidates = await database.query<{
        id: string;
        name: string;
        company_name: string | null;
        technical_score: string;
        insured: boolean;
        completed_projects: string;
        review_average: string;
        review_count: string;
        available_from: string | null;
        concurrent_capacity: string;
        travel_radius_km: string;
        service_areas: string[];
        active_projects: string;
        billing_status: string | null;
        service_province: string | null;
        service_locality: string | null;
        service_latitude: number | string | null;
        service_longitude: number | string | null;
      }>(
        `SELECT u.id, u.name, u.company_name, q.score::text AS technical_score,
                EXISTS (SELECT 1 FROM insurance_policies i
                         WHERE i.professional_id=u.id AND i.status='APROBADA' AND i.valid_until>=current_date) AS insured,
                (SELECT count(*) FROM projects fp WHERE fp.assigned_professional_id=u.id AND fp.status='FINALIZADO')::text AS completed_projects,
                COALESCE((SELECT avg(r.rating) FROM reviews r WHERE r.subject_id=u.id AND r.status='PUBLICADA'),0)::text AS review_average,
                (SELECT count(*) FROM reviews r WHERE r.subject_id=u.id AND r.status='PUBLICADA')::text AS review_count,
                a.available_from::text,
                COALESCE(a.concurrent_capacity,1)::text AS concurrent_capacity,
                COALESCE(a.travel_radius_km,u.service_radius_km,50)::text AS travel_radius_km,
                COALESCE(a.service_areas,'{}'::text[]) AS service_areas,
                (SELECT count(*) FROM projects ap WHERE ap.assigned_professional_id=u.id AND ap.status='EN_CURSO')::text AS active_projects,
                b.status AS billing_status,
                u.service_province, u.service_locality, u.service_latitude, u.service_longitude
           FROM users u
           JOIN professional_specialty_qualifications q
             ON q.professional_id=u.id AND q.specialty_slug=$1 AND q.verification_status='APROBADO'
           LEFT JOIN professional_availability a ON a.professional_id=u.id
           LEFT JOIN billing_accounts b ON b.professional_id=u.id
          WHERE u.role='profesional' AND u.account_status='ACTIVO' AND u.email_verified=true
            AND u.verification_status='APROBADO'
            AND u.service_latitude IS NOT NULL AND u.service_longitude IS NOT NULL`,
        [projectRow.category],
      );

      const projectPoint = {
        latitude: toNumber(projectRow.latitude),
        longitude: toNumber(projectRow.longitude),
      };
      const matches = candidates.rows.flatMap((row) => {
        if (row.service_latitude == null || row.service_longitude == null) return [];
        const radiusKm = Math.max(1, toNumber(row.travel_radius_km) || 50);
        const distanceKm = haversineDistanceKm(projectPoint, {
          latitude: toNumber(row.service_latitude),
          longitude: toNumber(row.service_longitude),
        });
        if (distanceKm > radiusKm) return [];
        const verified = calculateVerifiedProfessionalScore({
          accountVerified: true,
          qualificationApproved: true,
          technicalScore: toNumber(row.technical_score),
          insured: row.insured,
          completedProjects: toNumber(row.completed_projects),
          reviewAverage: toNumber(row.review_average),
          reviewCount: toNumber(row.review_count),
        });
        const factors = {
          verifiedScore: verified.total,
          technicalScore: toNumber(row.technical_score),
          locationScore: distanceLocationScore(distanceKm, radiusKm),
          availabilityScore: availabilityFit(row.available_from),
          capacityScore: capacityFit(toNumber(row.active_projects), toNumber(row.concurrent_capacity)),
        };
        return [{
          professionalId: row.id,
          name: row.name,
          companyName: row.company_name,
          matchScore: calculateProjectMatchScore(factors),
          verifiedScore: verified,
          factors,
          distanceKm: Number(distanceKm.toFixed(1)),
          withinRadius: true,
          serviceArea: {
            province: row.service_province,
            locality: row.service_locality,
            radiusKm,
          },
          availability: {
            availableFrom: row.available_from,
            concurrentCapacity: toNumber(row.concurrent_capacity),
            activeProjects: toNumber(row.active_projects),
            travelRadiusKm: radiusKm,
            serviceAreas: row.service_areas ?? [],
          },
          commercialReady: row.billing_status === "ACTIVO",
        }];
      }).sort((a, b) => b.matchScore - a.matchScore || a.distanceKm - b.distanceKm || b.verifiedScore.total - a.verifiedScore.total).slice(0, 5);

      response.json({
        project: {
          id: projectRow.id,
          category: projectRow.category,
          location: projectRow.location,
          status: projectRow.status,
          area: {
            province: projectRow.service_province,
            locality: projectRow.service_locality,
          },
        },
        matchingMode: "GEOSPATIAL_RADIUS",
        matches,
      });
    } catch (error) { next(error); }
  });

  return router;
}
