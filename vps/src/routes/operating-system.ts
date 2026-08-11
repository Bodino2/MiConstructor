import { createHash, randomUUID } from "node:crypto";
import { Router } from "express";
import multer from "multer";
import { z } from "zod";
import type { AppConfig } from "../config.js";
import type { Database } from "../db.js";
import { withTransaction } from "../db.js";
import { audit } from "../services/audit.js";
import { requireAuth, requireRole } from "../services/auth.js";
import {
  availabilityFit,
  calculateProjectMatchScore,
  calculateVerifiedProfessionalScore,
  capacityFit,
  locationFit,
} from "../services/professional-ranking.js";
import type { PrivateStorage } from "../services/storage.js";

const availabilitySchema = z.object({
  availableFrom: z.union([z.iso.date(), z.literal(""), z.null()]).optional(),
  concurrentCapacity: z.coerce.number().int().min(1).max(20),
  travelRadiusKm: z.coerce.number().int().min(1).max(500),
  serviceAreas: z.array(z.string().trim().min(2).max(120)).max(20).default([]),
});

const changeOrderSchema = z.object({
  title: z.string().trim().min(5).max(160),
  reason: z.string().trim().min(10).max(1000),
  description: z.string().trim().min(20).max(4000),
  amountCents: z.coerce.number().int().positive().max(500_000_000),
  extraDays: z.coerce.number().int().min(0).max(3650).default(0),
  requestedDueDate: z.union([z.iso.date(), z.literal(""), z.null()]).optional(),
  evidenceFileIds: z.array(z.string().uuid()).max(4).default([]),
});

const decisionSchema = z.object({
  decision: z.enum(["APROBAR", "RECHAZAR"]),
  reason: z.string().trim().max(1000).optional(),
});

const workEvidenceTypes = new Set(["image/jpeg", "image/png", "image/webp", "video/mp4", "video/webm", "application/pdf"]);

function evidenceUploader(config: AppConfig) {
  return multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: config.MAX_UPLOAD_BYTES, files: 1, fields: 5 },
    fileFilter: (_request, file, callback) => {
      if (!workEvidenceTypes.has(file.mimetype)) return callback(new Error("Tipo de archivo no permitido."));
      callback(null, true);
    },
  });
}

async function persistEvidence(database: Database, storage: PrivateStorage, ownerId: string, file: Express.Multer.File) {
  const stored = await storage.put(file.buffer, file.originalname, file.mimetype);
  const id = randomUUID();
  try {
    await database.query(
      `INSERT INTO stored_files
        (id, owner_id, purpose, object_key, original_name, content_type, size_bytes, sha256)
       VALUES ($1,$2,'OBRA_EVIDENCIA',$3,$4,$5,$6,$7)`,
      [id, ownerId, stored.key, stored.originalName, stored.contentType, stored.sizeBytes, createHash("sha256").update(file.buffer).digest("hex")],
    );
    return { id, ...stored };
  } catch (error) {
    await storage.delete(stored.key).catch(() => undefined);
    throw error;
  }
}

function toNumber(value: unknown) {
  const number = Number(value ?? 0);
  return Number.isFinite(number) ? number : 0;
}

export function operatingSystemRouter(database: Database, config: AppConfig, storage: PrivateStorage) {
  const router = Router();
  const uploadEvidence = evidenceUploader(config);

  router.put("/professionals/me/availability", requireAuth, requireRole("profesional"), async (request, response, next) => {
    try {
      const parsed = availabilitySchema.safeParse(request.body);
      if (!parsed.success) return response.status(400).json({ error: parsed.error.issues[0]?.message });
      const availableFrom = parsed.data.availableFrom || null;
      const result = await database.query(
        `INSERT INTO professional_availability
          (professional_id, available_from, concurrent_capacity, travel_radius_km, service_areas, updated_at)
         VALUES ($1,$2,$3,$4,$5,now())
         ON CONFLICT (professional_id) DO UPDATE SET
           available_from = EXCLUDED.available_from,
           concurrent_capacity = EXCLUDED.concurrent_capacity,
           travel_radius_km = EXCLUDED.travel_radius_km,
           service_areas = EXCLUDED.service_areas,
           updated_at = now()
         RETURNING professional_id, available_from, concurrent_capacity, travel_radius_km, service_areas, updated_at`,
        [request.user!.id, availableFrom, parsed.data.concurrentCapacity, parsed.data.travelRadiusKm, parsed.data.serviceAreas],
      );
      await audit(database, {
        actorUserId: request.user!.id,
        action: "PROFESSIONAL_AVAILABILITY_UPDATED",
        entityType: "professional",
        entityId: request.user!.id,
        ip: request.ip,
        metadata: { availableFrom, concurrentCapacity: parsed.data.concurrentCapacity, travelRadiusKm: parsed.data.travelRadiusKm },
      });
      response.json({ availability: result.rows[0] });
    } catch (error) { next(error); }
  });

  router.get("/professionals/:id/verified-score", requireAuth, async (request, response, next) => {
    try {
      const id = z.string().uuid().safeParse(request.params.id);
      if (!id.success) return response.status(404).json({ error: "Profesional no encontrado." });
      const result = await database.query<{
        id: string; name: string; company_name: string | null; account_verified: boolean;
        qualification_approved: boolean; technical_score: string; insured: boolean;
        completed_projects: string; review_average: string; review_count: string;
      }>(
        `SELECT u.id, u.name, u.company_name,
                (u.account_status='ACTIVO' AND u.email_verified AND u.verification_status='APROBADO') AS account_verified,
                EXISTS (SELECT 1 FROM professional_specialty_qualifications q
                         WHERE q.professional_id=u.id AND q.verification_status='APROBADO') AS qualification_approved,
                COALESCE((SELECT max(q.score) FROM professional_specialty_qualifications q
                          WHERE q.professional_id=u.id AND q.verification_status='APROBADO'),0)::text AS technical_score,
                EXISTS (SELECT 1 FROM insurance_policies i
                         WHERE i.professional_id=u.id AND i.status='APROBADA' AND i.valid_until>=current_date) AS insured,
                (SELECT count(*) FROM projects p WHERE p.assigned_professional_id=u.id AND p.status='FINALIZADO')::text AS completed_projects,
                COALESCE((SELECT avg(r.rating) FROM reviews r WHERE r.subject_id=u.id AND r.status='PUBLICADA'),0)::text AS review_average,
                (SELECT count(*) FROM reviews r WHERE r.subject_id=u.id AND r.status='PUBLICADA')::text AS review_count
           FROM users u WHERE u.id=$1 AND u.role='profesional'`,
        [id.data],
      );
      const row = result.rows[0];
      if (!row) return response.status(404).json({ error: "Profesional no encontrado." });
      const score = calculateVerifiedProfessionalScore({
        accountVerified: row.account_verified,
        qualificationApproved: row.qualification_approved,
        technicalScore: toNumber(row.technical_score),
        insured: row.insured,
        completedProjects: toNumber(row.completed_projects),
        reviewAverage: toNumber(row.review_average),
        reviewCount: toNumber(row.review_count),
      });
      response.json({
        professional: { id: row.id, name: row.name, companyName: row.company_name },
        score,
        evidence: {
          accountVerified: row.account_verified,
          qualificationApproved: row.qualification_approved,
          technicalScore: toNumber(row.technical_score),
          insured: row.insured,
          completedProjects: toNumber(row.completed_projects),
          reviewAverage: Number(toNumber(row.review_average).toFixed(1)),
          reviewCount: toNumber(row.review_count),
        },
      });
    } catch (error) { next(error); }
  });

  router.get("/projects/:id/matches", requireAuth, async (request, response, next) => {
    try {
      const projectId = z.string().uuid().safeParse(request.params.id);
      if (!projectId.success) return response.status(400).json({ error: "Proyecto no válido." });
      const project = await database.query<{ id: string; owner_id: string; category: string; location: string; status: string }>(
        "SELECT id, owner_id, category, location, status FROM projects WHERE id=$1",
        [projectId.data],
      );
      const projectRow = project.rows[0];
      if (!projectRow || (request.user!.role !== "admin" && projectRow.owner_id !== request.user!.id)) {
        return response.status(404).json({ error: "Proyecto no encontrado." });
      }
      const candidates = await database.query<{
        id: string; name: string; company_name: string | null; technical_score: string; insured: boolean;
        completed_projects: string; review_average: string; review_count: string; available_from: string | null;
        concurrent_capacity: string; travel_radius_km: string; service_areas: string[]; active_projects: string;
        billing_status: string | null;
      }>(
        `SELECT u.id, u.name, u.company_name, q.score::text AS technical_score,
                EXISTS (SELECT 1 FROM insurance_policies i
                         WHERE i.professional_id=u.id AND i.status='APROBADA' AND i.valid_until>=current_date) AS insured,
                (SELECT count(*) FROM projects fp WHERE fp.assigned_professional_id=u.id AND fp.status='FINALIZADO')::text AS completed_projects,
                COALESCE((SELECT avg(r.rating) FROM reviews r WHERE r.subject_id=u.id AND r.status='PUBLICADA'),0)::text AS review_average,
                (SELECT count(*) FROM reviews r WHERE r.subject_id=u.id AND r.status='PUBLICADA')::text AS review_count,
                a.available_from::text,
                COALESCE(a.concurrent_capacity,1)::text AS concurrent_capacity,
                COALESCE(a.travel_radius_km,50)::text AS travel_radius_km,
                COALESCE(a.service_areas,'{}'::text[]) AS service_areas,
                (SELECT count(*) FROM projects ap WHERE ap.assigned_professional_id=u.id AND ap.status='EN_CURSO')::text AS active_projects,
                b.status AS billing_status
           FROM users u
           JOIN professional_specialty_qualifications q
             ON q.professional_id=u.id AND q.specialty_slug=$1 AND q.verification_status='APROBADO'
           LEFT JOIN professional_availability a ON a.professional_id=u.id
           LEFT JOIN billing_accounts b ON b.professional_id=u.id
          WHERE u.role='profesional' AND u.account_status='ACTIVO' AND u.email_verified=true
            AND u.verification_status='APROBADO'`,
        [projectRow.category],
      );
      const matches = candidates.rows.map((row) => {
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
          locationScore: locationFit(projectRow.location, row.service_areas ?? []),
          availabilityScore: availabilityFit(row.available_from),
          capacityScore: capacityFit(toNumber(row.active_projects), toNumber(row.concurrent_capacity)),
        };
        return {
          professionalId: row.id,
          name: row.name,
          companyName: row.company_name,
          matchScore: calculateProjectMatchScore(factors),
          verifiedScore: verified,
          factors,
          availability: {
            availableFrom: row.available_from,
            concurrentCapacity: toNumber(row.concurrent_capacity),
            activeProjects: toNumber(row.active_projects),
            travelRadiusKm: toNumber(row.travel_radius_km),
            serviceAreas: row.service_areas ?? [],
          },
          commercialReady: row.billing_status === "ACTIVO",
        };
      }).sort((a, b) => b.matchScore - a.matchScore || b.verifiedScore.total - a.verifiedScore.total).slice(0, 5);
      response.json({ project: { id: projectRow.id, category: projectRow.category, location: projectRow.location, status: projectRow.status }, matches });
    } catch (error) { next(error); }
  });

  router.post(
    "/projects/:id/evidence",
    requireAuth,
    uploadEvidence.single("evidence"),
    async (request, response, next) => {
      let stored: Awaited<ReturnType<typeof persistEvidence>> | null = null;
      try {
        const projectId = z.string().uuid().safeParse(request.params.id);
        if (!projectId.success || !request.file) return response.status(400).json({ error: "Evidencia no válida." });
        const project = await database.query<{ owner_id: string; assigned_professional_id: string | null; status: string }>(
          "SELECT owner_id, assigned_professional_id, status FROM projects WHERE id=$1",
          [projectId.data],
        );
        const row = project.rows[0];
        const allowed = row && (request.user!.role === "admin" || row.owner_id === request.user!.id || row.assigned_professional_id === request.user!.id);
        if (!allowed) return response.status(404).json({ error: "Proyecto no encontrado." });
        if (row.status !== "EN_CURSO") return response.status(409).json({ error: "Las evidencias de obra se habilitan cuando el proyecto está en curso." });
        stored = await persistEvidence(database, storage, request.user!.id, request.file);
        await withTransaction(database, async (client) => {
          await client.query(
            "INSERT INTO work_evidence_files (project_id,file_id,uploaded_by,context) VALUES ($1,$2,$3,'OBRA')",
            [projectId.data, stored!.id, request.user!.id],
          );
          await client.query(
            `INSERT INTO work_passport_entries
              (project_id,actor_user_id,event_type,entity_type,entity_id,summary,metadata)
             VALUES ($1,$2,'EVIDENCIA_OBRA_SUBIDA','file',$3,$4,$5::jsonb)`,
            [projectId.data, request.user!.id, stored!.id, `Evidencia de obra: ${request.file!.originalname}`, JSON.stringify({ contentType: request.file!.mimetype, sizeBytes: stored!.sizeBytes })],
          );
          await audit(client, { actorUserId: request.user!.id, action: "WORK_EVIDENCE_UPLOADED", entityType: "project", entityId: projectId.data, ip: request.ip, metadata: { fileId: stored!.id } });
        });
        response.status(201).json({ success: true, fileId: stored.id, contentType: stored.contentType });
      } catch (error) {
        if (stored) {
          await database.query("DELETE FROM stored_files WHERE id=$1", [stored.id]).catch(() => undefined);
          await storage.delete(stored.key).catch(() => undefined);
        }
        next(error);
      }
    },
  );

  router.get("/projects/:projectId/evidence/:fileId", requireAuth, async (request, response, next) => {
    try {
      const projectId = z.string().uuid().safeParse(request.params.projectId);
      const fileId = z.string().uuid().safeParse(request.params.fileId);
      if (!projectId.success || !fileId.success) return response.status(404).end();
      const file = await database.query<{
        object_key: string; original_name: string; content_type: string; size_bytes: string;
        client_id: string; professional_id: string;
      }>(
        `SELECT f.object_key, f.original_name, f.content_type, f.size_bytes::text,
                c.client_id, c.professional_id
           FROM work_evidence_files we
           JOIN stored_files f ON f.id=we.file_id
           JOIN work_contracts c ON c.project_id=we.project_id
          WHERE we.project_id=$1 AND we.file_id=$2`,
        [projectId.data, fileId.data],
      );
      const row = file.rows[0];
      if (!row || (request.user!.role !== "admin" && row.client_id !== request.user!.id && row.professional_id !== request.user!.id)) {
        return response.status(404).end();
      }
      response.setHeader("Content-Type", row.content_type);
      response.setHeader("Content-Length", row.size_bytes);
      response.setHeader("Content-Disposition", `inline; filename*=UTF-8''${encodeURIComponent(row.original_name)}`);
      response.setHeader("Cache-Control", "private, no-store");
      storage.stream(row.object_key).on("error", next).pipe(response);
    } catch (error) { next(error); }
  });

  router.post("/projects/:id/change-orders", requireAuth, requireRole("profesional"), async (request, response, next) => {
    try {
      const projectId = z.string().uuid().safeParse(request.params.id);
      const parsed = changeOrderSchema.safeParse(request.body);
      if (!projectId.success || !parsed.success) return response.status(400).json({ error: parsed.success ? "Proyecto no válido." : parsed.error.issues[0]?.message });
      const result = await withTransaction(database, async (client) => {
        const contract = await client.query<{ id: string; client_id: string; professional_id: string; project_status: string }>(
          `SELECT c.id,c.client_id,c.professional_id,p.status AS project_status
             FROM work_contracts c JOIN projects p ON p.id=c.project_id
            WHERE c.project_id=$1 FOR UPDATE OF p`,
          [projectId.data],
        );
        const row = contract.rows[0];
        if (!row || row.professional_id !== request.user!.id) return { status: 404, body: { error: "Proyecto o contrato no encontrados." } };
        if (row.project_status !== "EN_CURSO") return { status: 409, body: { error: "Solo se pueden solicitar extras durante una obra en curso." } };
        if (parsed.data.evidenceFileIds.length) {
          const evidence = await client.query<{ file_id: string }>(
            `SELECT file_id FROM work_evidence_files
              WHERE project_id=$1 AND uploaded_by=$2 AND file_id=ANY($3::uuid[])`,
            [projectId.data, request.user!.id, parsed.data.evidenceFileIds],
          );
          if (evidence.rowCount !== parsed.data.evidenceFileIds.length) {
            return { status: 400, body: { error: "Una o más evidencias no pertenecen a esta obra o a tu cuenta." } };
          }
        }
        const changeOrderId = randomUUID();
        await client.query(
          `INSERT INTO change_orders
            (id,project_id,contract_id,professional_id,client_id,title,reason,description,amount_cents,extra_days,requested_due_date)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
          [changeOrderId, projectId.data, row.id, row.professional_id, row.client_id, parsed.data.title, parsed.data.reason, parsed.data.description, parsed.data.amountCents, parsed.data.extraDays, parsed.data.requestedDueDate || null],
        );
        for (const fileId of parsed.data.evidenceFileIds) {
          await client.query("INSERT INTO change_order_evidence (change_order_id,file_id) VALUES ($1,$2)", [changeOrderId, fileId]);
          await client.query("UPDATE work_evidence_files SET context='EXTRA' WHERE project_id=$1 AND file_id=$2", [projectId.data, fileId]);
        }
        await client.query(
          `INSERT INTO work_passport_entries
            (project_id,actor_user_id,event_type,entity_type,entity_id,summary,metadata)
           VALUES ($1,$2,'EXTRA_SOLICITADO','change_order',$3,$4,$5::jsonb)`,
          [projectId.data, request.user!.id, changeOrderId, `Extra solicitado: ${parsed.data.title}`, JSON.stringify({ amountCents: parsed.data.amountCents, extraDays: parsed.data.extraDays, evidenceCount: parsed.data.evidenceFileIds.length })],
        );
        await audit(client, { actorUserId: request.user!.id, action: "CHANGE_ORDER_REQUESTED", entityType: "change_order", entityId: changeOrderId, ip: request.ip, metadata: { projectId: projectId.data, amountCents: parsed.data.amountCents } });
        return { status: 201, body: { success: true, changeOrderId, status: "PENDIENTE" } };
      });
      response.status(result.status).json(result.body);
    } catch (error) { next(error); }
  });

  router.get("/projects/:id/change-orders", requireAuth, async (request, response, next) => {
    try {
      const projectId = z.string().uuid().safeParse(request.params.id);
      if (!projectId.success) return response.status(400).json({ error: "Proyecto no válido." });
      const access = await database.query<{ client_id: string; professional_id: string }>("SELECT client_id,professional_id FROM work_contracts WHERE project_id=$1", [projectId.data]);
      const contract = access.rows[0];
      if (!contract || (request.user!.role !== "admin" && contract.client_id !== request.user!.id && contract.professional_id !== request.user!.id)) {
        return response.status(404).json({ error: "Proyecto no encontrado." });
      }
      const rows = await database.query(
        `SELECT co.id,co.title,co.reason,co.description,co.amount_cents,co.extra_days,co.requested_due_date,
                co.status,co.decision_reason,co.decided_at,co.created_at,
                COALESCE(json_agg(json_build_object('fileId',f.id,'contentType',f.content_type,'originalName',f.original_name)
                  ORDER BY f.created_at) FILTER (WHERE f.id IS NOT NULL),'[]'::json) AS evidence
           FROM change_orders co
           LEFT JOIN change_order_evidence ce ON ce.change_order_id=co.id
           LEFT JOIN stored_files f ON f.id=ce.file_id
          WHERE co.project_id=$1
          GROUP BY co.id ORDER BY co.created_at DESC`,
        [projectId.data],
      );
      response.json({ changeOrders: rows.rows });
    } catch (error) { next(error); }
  });

  router.post("/change-orders/:id/decision", requireAuth, requireRole("cliente"), async (request, response, next) => {
    try {
      const changeOrderId = z.string().uuid().safeParse(request.params.id);
      const parsed = decisionSchema.safeParse(request.body);
      if (!changeOrderId.success || !parsed.success) return response.status(400).json({ error: "Decisión no válida." });
      const result = await withTransaction(database, async (client) => {
        const order = await client.query<{
          id: string; project_id: string; client_id: string; title: string; reason: string; description: string;
          amount_cents: string; extra_days: number; requested_due_date: string | null; status: string; project_status: string;
        }>(
          `SELECT co.id,co.project_id,co.client_id,co.title,co.reason,co.description,co.amount_cents::text,
                  co.extra_days,co.requested_due_date::text,co.status,p.status AS project_status
             FROM change_orders co JOIN projects p ON p.id=co.project_id
            WHERE co.id=$1 FOR UPDATE OF co,p`,
          [changeOrderId.data],
        );
        const row = order.rows[0];
        if (!row || row.client_id !== request.user!.id) return { status: 404, body: { error: "Extra no encontrado." } };
        if (row.status !== "PENDIENTE") return { status: 409, body: { error: "Este extra ya tiene una decisión." } };
        if (row.project_status !== "EN_CURSO") return { status: 409, body: { error: "El proyecto ya no admite modificaciones." } };
        const approved = parsed.data.decision === "APROBAR";
        const status = approved ? "APROBADA" : "RECHAZADA";
        await client.query(
          "UPDATE change_orders SET status=$2,decision_reason=$3,decided_by=$4,decided_at=now(),updated_at=now() WHERE id=$1",
          [row.id, status, parsed.data.reason ?? null, request.user!.id],
        );
        let milestoneId: string | null = null;
        if (approved) {
          milestoneId = randomUUID();
          const positionResult = await client.query<{ position: number }>("SELECT COALESCE(max(position),0)::int+1 AS position FROM milestones WHERE project_id=$1", [row.project_id]);
          const position = positionResult.rows[0]?.position ?? 1;
          await client.query(
            `INSERT INTO milestones (id,project_id,position,title,description,amount_cents,due_date)
             VALUES ($1,$2,$3,$4,$5,$6,$7)`,
            [milestoneId, row.project_id, position, `Extra · ${row.title}`, `${row.reason}\n\n${row.description}`, row.amount_cents, row.requested_due_date],
          );
          await client.query(
            `INSERT INTO work_passport_entries
              (project_id,actor_user_id,event_type,entity_type,entity_id,summary,metadata)
             VALUES ($1,$2,'HITO_CREADO','milestone',$3,$4,$5::jsonb)`,
            [row.project_id, request.user!.id, milestoneId, `Hito creado por extra aprobado: ${row.title}`, JSON.stringify({ changeOrderId: row.id, amountCents: Number(row.amount_cents), extraDays: row.extra_days })],
          );
        }
        await client.query(
          `INSERT INTO work_passport_entries
            (project_id,actor_user_id,event_type,entity_type,entity_id,summary,metadata)
           VALUES ($1,$2,$3,'change_order',$4,$5,$6::jsonb)`,
          [row.project_id, request.user!.id, approved ? "EXTRA_APROBADO" : "EXTRA_RECHAZADO", row.id, `${approved ? "Extra aprobado" : "Extra rechazado"}: ${row.title}`, JSON.stringify({ amountCents: Number(row.amount_cents), extraDays: row.extra_days, milestoneId, decisionReason: parsed.data.reason ?? null })],
        );
        await audit(client, { actorUserId: request.user!.id, action: approved ? "CHANGE_ORDER_APPROVED" : "CHANGE_ORDER_REJECTED", entityType: "change_order", entityId: row.id, ip: request.ip, metadata: { projectId: row.project_id, milestoneId } });
        return { status: 200, body: { success: true, status, milestoneId } };
      });
      response.status(result.status).json(result.body);
    } catch (error) { next(error); }
  });

  router.get("/projects/:id/control", requireAuth, async (request, response, next) => {
    try {
      const projectId = z.string().uuid().safeParse(request.params.id);
      if (!projectId.success) return response.status(400).json({ error: "Proyecto no válido." });
      const contractResult = await database.query<{
        id: string; client_id: string; professional_id: string; agreed_amount_cents: string; estimated_days: number; project_status: string;
      }>(
        `SELECT c.id,c.client_id,c.professional_id,c.agreed_amount_cents::text,c.estimated_days,p.status AS project_status
           FROM work_contracts c JOIN projects p ON p.id=c.project_id WHERE c.project_id=$1`,
        [projectId.data],
      );
      const contract = contractResult.rows[0];
      if (!contract || (request.user!.role !== "admin" && contract.client_id !== request.user!.id && contract.professional_id !== request.user!.id)) {
        return response.status(404).json({ error: "Proyecto no encontrado." });
      }
      const extras = await database.query<{ approved_amount: string; pending_amount: string; approved_days: string; pending_count: string }>(
        `SELECT
          COALESCE(sum(amount_cents) FILTER (WHERE status='APROBADA'),0)::text AS approved_amount,
          COALESCE(sum(amount_cents) FILTER (WHERE status='PENDIENTE'),0)::text AS pending_amount,
          COALESCE(sum(extra_days) FILTER (WHERE status='APROBADA'),0)::text AS approved_days,
          count(*) FILTER (WHERE status='PENDIENTE')::text AS pending_count
         FROM change_orders WHERE project_id=$1`,
        [projectId.data],
      );
      const milestones = await database.query(
        "SELECT id,position,title,amount_cents,status,due_date FROM milestones WHERE project_id=$1 ORDER BY position",
        [projectId.data],
      );
      const extra = extras.rows[0]!;
      const baseAmountCents = Number(contract.agreed_amount_cents);
      const approvedExtrasCents = Number(extra.approved_amount);
      response.json({
        contractId: contract.id,
        projectStatus: contract.project_status,
        budget: {
          baseAmountCents,
          approvedExtrasCents,
          pendingExtrasCents: Number(extra.pending_amount),
          effectiveAmountCents: baseAmountCents + approvedExtrasCents,
        },
        schedule: {
          baseEstimatedDays: contract.estimated_days,
          approvedExtraDays: Number(extra.approved_days),
          effectiveEstimatedDays: contract.estimated_days + Number(extra.approved_days),
        },
        pendingChangeOrders: Number(extra.pending_count),
        milestones: milestones.rows,
      });
    } catch (error) { next(error); }
  });

  return router;
}
