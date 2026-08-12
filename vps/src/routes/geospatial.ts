import { randomUUID } from "node:crypto";
import { Router } from "express";
import { z } from "zod";
import { estimateProjectPrice } from "../../../lib/project-estimator.js";
import { getSpecialtySlugForProjectCategory } from "../../../lib/professional-assessment.js";
import type { AppConfig } from "../config.js";
import type { Database } from "../db.js";
import { withTransaction } from "../db.js";
import { audit } from "../services/audit.js";
import { requireAuth, requireRole } from "../services/auth.js";
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
} from "../services/professional-ranking.js";

const resolveSchema = z.object({
  province: z.string().trim().min(2).max(100),
  locality: z.string().trim().min(2).max(100),
});

const serviceAreaSchema = z.object({
  province: z.string().trim().min(2).max(100),
  locality: z.string().trim().min(2).max(100),
  radiusKm: z.coerce.number().int().min(5).max(200),
});

const projectAreaSchema = z.object({
  title: z.string().trim().min(5).max(160),
  description: z.string().trim().min(30).max(5000),
  category: z.string().trim().min(2).max(80),
  projectType: z.enum(["bano", "cocina", "reforma_integral", "construccion_casa"]),
  serviceProvince: z.string().trim().min(2).max(100),
  serviceLocality: z.string().trim().min(2).max(100),
  searchRadiusKm: z.coerce.number().int().min(5).max(200).default(50),
  squareMeters: z.coerce.number().positive().max(1000),
  qualityLevel: z.enum(["basico", "estandar", "premium"]),
  budgetCents: z.coerce.number().int().positive().max(500_000_000).optional(),
});

const toNumber = (value: unknown) => {
  const number = Number(value ?? 0);
  return Number.isFinite(number) ? number : 0;
};

function geocodingError(response: import("express").Response, error: unknown) {
  if (error instanceof LocalityNotFoundError) {
    response.status(404).json({ error: error.message });
    return true;
  }
  if (error instanceof GeocodingUnavailableError) {
    response.status(503).json({ error: error.message });
    return true;
  }
  return false;
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
      if (geocodingError(response, error)) return;
      next(error);
    }
  });

  router.get("/users/me/service-area", requireAuth, async (request, response, next) => {
    try {
      const result = await database.query<{
        service_province: string | null;
        service_locality: string | null;
        service_radius_km: number | string;
        service_latitude: number | string | null;
        service_longitude: number | string | null;
      }>(
        `SELECT service_province, service_locality, service_radius_km,
                service_latitude, service_longitude
           FROM users WHERE id=$1`,
        [request.user!.id],
      );
      const row = result.rows[0];
      response.json({
        area: {
          province: row?.service_province ?? null,
          locality: row?.service_locality ?? null,
          radiusKm: toNumber(row?.service_radius_km) || 50,
          geocoded: row?.service_latitude != null && row?.service_longitude != null,
        },
      });
    } catch (error) { next(error); }
  });

  router.put("/users/me/service-area", requireAuth, async (request, response, next) => {
    try {
      const parsed = serviceAreaSchema.safeParse(request.body);
      if (!parsed.success) return response.status(400).json({ error: parsed.error.issues[0]?.message });
      const location = await resolveSpainLocality(database, config, {
        province: parsed.data.province,
        locality: parsed.data.locality,
      });
      await withTransaction(database, async (client) => {
        await client.query(
          `UPDATE users
              SET service_province=$1, service_locality=$2, service_radius_km=$3,
                  service_latitude=$4, service_longitude=$5, service_geocoded_at=now(), updated_at=now()
            WHERE id=$6`,
          [location.province, location.locality, parsed.data.radiusKm, location.latitude, location.longitude, request.user!.id],
        );
        if (request.user!.role === "profesional") {
          await client.query(
            `INSERT INTO professional_availability
              (professional_id, concurrent_capacity, travel_radius_km, service_areas, updated_at)
             VALUES ($1,1,$2,$3,now())
             ON CONFLICT (professional_id) DO UPDATE SET
               travel_radius_km=EXCLUDED.travel_radius_km,
               service_areas=EXCLUDED.service_areas,
               updated_at=now()`,
            [request.user!.id, parsed.data.radiusKm, [`${location.locality}, ${location.province}`]],
          );
        }
        await audit(client, {
          actorUserId: request.user!.id,
          action: "SERVICE_AREA_UPDATED",
          entityType: "user",
          entityId: request.user!.id,
          ip: request.ip,
          metadata: { province: location.province, locality: location.locality, radiusKm: parsed.data.radiusKm },
        });
      });
      response.json({
        success: true,
        area: { province: location.province, locality: location.locality, radiusKm: parsed.data.radiusKm },
      });
    } catch (error) {
      if (geocodingError(response, error)) return;
      next(error);
    }
  });

  // Web project creation with a project-specific locality. Legacy/mobile requests
  // without serviceProvince/serviceLocality fall through to the existing route.
  router.post("/projects", requireAuth, requireRole("cliente"), async (request, response, next) => {
    if (!request.body?.serviceProvince || !request.body?.serviceLocality) return next();
    try {
      const parsed = projectAreaSchema.safeParse(request.body);
      if (!parsed.success) return response.status(400).json({ error: parsed.error.issues[0]?.message });
      const specialtySlug = getSpecialtySlugForProjectCategory(parsed.data.category);
      if (!specialtySlug) return response.status(400).json({ error: "Especialidad de proyecto no válida." });
      const estimate = estimateProjectPrice({
        projectType: parsed.data.projectType,
        squareMeters: parsed.data.squareMeters,
        qualityLevel: parsed.data.qualityLevel,
      }) as { valid: boolean; range?: { minimum: number; maximum: number }; version?: string };
      if (!estimate.valid || !estimate.range) return response.status(400).json({ error: "No se puede estimar esta categoría todavía." });
      const suggestedBudgetCents = Math.round(((estimate.range.minimum + estimate.range.maximum) / 2) * 100);
      const budgetCents = parsed.data.budgetCents ?? suggestedBudgetCents;
      if (budgetCents < Math.round(estimate.range.minimum * 50) || budgetCents > Math.round(estimate.range.maximum * 200)) {
        return response.status(400).json({ error: "El presupuesto indicado queda fuera de un rango razonable para los datos introducidos." });
      }
      const location = await resolveSpainLocality(database, config, {
        province: parsed.data.serviceProvince,
        locality: parsed.data.serviceLocality,
      });
      const id = randomUUID();
      const displayLocation = `${location.locality}, ${location.province}`;
      await withTransaction(database, async (client) => {
        await client.query(
          `INSERT INTO projects
            (id, owner_id, title, description, category, project_type, location, square_meters,
             quality_level, budget_cents, estimator_version, status,
             service_province, service_locality, latitude, longitude, geocoded_at, search_radius_km)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'PUBLICADO',$12,$13,$14,$15,now(),$16)`,
          [
            id, request.user!.id, parsed.data.title, parsed.data.description, specialtySlug,
            parsed.data.projectType, displayLocation, parsed.data.squareMeters, parsed.data.qualityLevel,
            budgetCents, estimate.version ?? null, location.province, location.locality,
            location.latitude, location.longitude, parsed.data.searchRadiusKm,
          ],
        );
        await audit(client, {
          actorUserId: request.user!.id,
          action: "PROJECT_PUBLISHED",
          entityType: "project",
          entityId: id,
          ip: request.ip,
          metadata: { province: location.province, locality: location.locality, searchRadiusKm: parsed.data.searchRadiusKm },
        });
      });
      response.status(201).json({
        success: true,
        project: {
          id,
          ...parsed.data,
          location: displayLocation,
          serviceProvince: location.province,
          serviceLocality: location.locality,
          budgetCents,
          status: "PUBLICADO",
        },
        estimate,
      });
    } catch (error) {
      if (geocodingError(response, error)) return;
      next(error);
    }
  });

  // Return richer project lists for both web roles. Admin falls through.
  router.get("/projects", requireAuth, async (request, response, next) => {
    try {
      if (request.user!.role === "cliente") {
        const rows = await database.query(
          `SELECT id, title, description, category, project_type, location, budget_cents, status, created_at,
                  service_province, service_locality, search_radius_km
             FROM projects WHERE owner_id=$1 ORDER BY created_at DESC LIMIT 100`,
          [request.user!.id],
        );
        return response.json({ projects: rows.rows });
      }
      if (request.user!.role !== "profesional") return next();

      const professional = await database.query<{
        service_latitude: number | string | null;
        service_longitude: number | string | null;
        service_radius_km: number | string;
      }>(
        `SELECT service_latitude, service_longitude, service_radius_km FROM users WHERE id=$1`,
        [request.user!.id],
      );
      const pro = professional.rows[0];
      if (!pro || pro.service_latitude == null || pro.service_longitude == null) return next();
      const proPoint = { latitude: toNumber(pro.service_latitude), longitude: toNumber(pro.service_longitude) };
      const proRadius = toNumber(pro.service_radius_km) || 50;
      const rows = await database.query<{
        id: string; title: string; description: string; category: string; project_type: string;
        location: string; budget_cents: string; status: string; created_at: string;
        service_province: string | null; service_locality: string | null; search_radius_km: number | string;
        latitude: number | string | null; longitude: number | string | null; already_applied: boolean;
      }>(
        `SELECT p.id, p.title, p.description, p.category, p.project_type, p.location, p.budget_cents,
                p.status, p.created_at, p.service_province, p.service_locality, p.search_radius_km,
                p.latitude, p.longitude,
                EXISTS (SELECT 1 FROM proposals pr WHERE pr.project_id=p.id AND pr.professional_id=$1) AS already_applied
           FROM projects p
          WHERE p.status='PUBLICADO'
            AND p.latitude IS NOT NULL AND p.longitude IS NOT NULL
            AND EXISTS (
              SELECT 1 FROM professional_specialty_qualifications q
               WHERE q.professional_id=$1 AND q.specialty_slug=p.category AND q.verification_status='APROBADO'
            )
          ORDER BY p.created_at DESC LIMIT 300`,
        [request.user!.id],
      );
      const projects = rows.rows.flatMap((row) => {
        if (row.latitude == null || row.longitude == null) return [];
        const distanceKm = haversineDistanceKm(proPoint, { latitude: toNumber(row.latitude), longitude: toNumber(row.longitude) });
        const clientRadius = toNumber(row.search_radius_km) || 50;
        if (distanceKm > proRadius || distanceKm > clientRadius) return [];
        return [{ ...row, distance_km: Number(distanceKm.toFixed(1)), within_radius: true }];
      }).slice(0, 100);
      return response.json({ projects, matchingMode: "GEOSPATIAL_RADIUS" });
    } catch (error) { next(error); }
  });

  // Server-side guard: a professional cannot bypass the radius restriction by
  // calling POST /proposals manually.
  router.post("/proposals", requireAuth, requireRole("profesional"), async (request, response, next) => {
    try {
      const projectId = z.string().uuid().safeParse(request.body?.projectId);
      if (!projectId.success) return next();
      const result = await database.query<{
        latitude: number | string | null; longitude: number | string | null; search_radius_km: number | string;
        service_latitude: number | string | null; service_longitude: number | string | null; service_radius_km: number | string;
      }>(
        `SELECT p.latitude, p.longitude, p.search_radius_km,
                u.service_latitude, u.service_longitude, u.service_radius_km
           FROM projects p CROSS JOIN users u
          WHERE p.id=$1 AND u.id=$2`,
        [projectId.data, request.user!.id],
      );
      const row = result.rows[0];
      if (!row || row.latitude == null || row.longitude == null || row.service_latitude == null || row.service_longitude == null) return next();
      const distanceKm = haversineDistanceKm(
        { latitude: toNumber(row.latitude), longitude: toNumber(row.longitude) },
        { latitude: toNumber(row.service_latitude), longitude: toNumber(row.service_longitude) },
      );
      const professionalRadius = toNumber(row.service_radius_km) || 50;
      const projectRadius = toNumber(row.search_radius_km) || 50;
      if (distanceKm > professionalRadius || distanceKm > projectRadius) {
        return response.status(403).json({ error: "Este proyecto está fuera del radio de trabajo permitido para esta propuesta." });
      }
      next();
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
        id: string; owner_id: string; category: string; location: string; status: string;
        service_province: string | null; service_locality: string | null;
        latitude: number | string | null; longitude: number | string | null; search_radius_km: number | string;
      }>(
        `SELECT id, owner_id, category, location, status, service_province, service_locality,
                latitude, longitude, search_radius_km
           FROM projects WHERE id=$1`,
        [projectId.data],
      );
      const projectRow = project.rows[0];
      if (!projectRow || (request.user!.role !== "admin" && projectRow.owner_id !== request.user!.id)) {
        return response.status(404).json({ error: "Proyecto no encontrado." });
      }
      if (projectRow.latitude == null || projectRow.longitude == null) return next();

      const candidates = await database.query<{
        id: string; name: string; company_name: string | null; technical_score: string; insured: boolean;
        completed_projects: string; review_average: string; review_count: string; available_from: string | null;
        concurrent_capacity: string; travel_radius_km: string; service_areas: string[]; active_projects: string;
        billing_status: string | null; service_province: string | null; service_locality: string | null;
        service_latitude: number | string | null; service_longitude: number | string | null;
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

      const projectPoint = { latitude: toNumber(projectRow.latitude), longitude: toNumber(projectRow.longitude) };
      const projectRadius = toNumber(projectRow.search_radius_km) || 50;
      const matches = candidates.rows.flatMap((row) => {
        if (row.service_latitude == null || row.service_longitude == null) return [];
        const professionalRadius = Math.max(1, toNumber(row.travel_radius_km) || 50);
        const effectiveRadius = Math.min(professionalRadius, projectRadius);
        const distanceKm = haversineDistanceKm(projectPoint, {
          latitude: toNumber(row.service_latitude), longitude: toNumber(row.service_longitude),
        });
        if (distanceKm > effectiveRadius) return [];
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
          locationScore: distanceLocationScore(distanceKm, effectiveRadius),
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
          serviceArea: { province: row.service_province, locality: row.service_locality, radiusKm: professionalRadius },
          availability: {
            availableFrom: row.available_from,
            concurrentCapacity: toNumber(row.concurrent_capacity),
            activeProjects: toNumber(row.active_projects),
            travelRadiusKm: professionalRadius,
            serviceAreas: row.service_areas ?? [],
          },
          commercialReady: row.billing_status === "ACTIVO",
        }];
      }).sort((a, b) => b.matchScore - a.matchScore || a.distanceKm - b.distanceKm || b.verifiedScore.total - a.verifiedScore.total).slice(0, 5);

      response.json({
        project: {
          id: projectRow.id, category: projectRow.category, location: projectRow.location, status: projectRow.status,
          area: { province: projectRow.service_province, locality: projectRow.service_locality, radiusKm: projectRadius },
        },
        matchingMode: "GEOSPATIAL_RADIUS",
        matches,
      });
    } catch (error) { next(error); }
  });

  return router;
}
