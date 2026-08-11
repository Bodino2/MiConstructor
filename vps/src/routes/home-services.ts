import { randomUUID } from "node:crypto";
import { Router } from "express";
import { z } from "zod";
import {
  getHomeService,
  getHomeServiceCatalog,
  madridDateIso,
  nextOccurrenceDate,
  recurrenceAllowed,
} from "../../../lib/home-service-catalog.js";
import {
  evaluateHomeServiceAssessment,
  getHomeServiceProfessionalSpecialties,
  getPublicHomeServiceAssessment,
} from "../../../lib/home-service-assessment.js";
import type { Database } from "../db.js";
import { withTransaction } from "../db.js";
import { audit } from "../services/audit.js";
import { requireAuth, requireRole } from "../services/auth.js";

const frequencySchema = z.enum(["PUNTUAL", "SEMANAL", "CADA_2_SEMANAS", "MENSUAL"]);
type ServiceFrequency = z.infer<typeof frequencySchema>;

const requestSchema = z.object({
  serviceSlug: z.string().trim().min(2).max(80),
  location: z.string().trim().min(3).max(180),
  propertyType: z.enum(["PISO", "CASA", "CHALET", "COMUNIDAD", "LOCAL", "JARDIN", "PARCELA", "OTRO"]),
  squareMeters: z.coerce.number().positive().max(100000).optional(),
  bedrooms: z.coerce.number().int().min(0).max(50).optional(),
  bathrooms: z.coerce.number().int().min(0).max(50).optional(),
  estimatedHours: z.coerce.number().positive().max(24).optional(),
  notes: z.string().trim().max(4000).default(""),
  requestedStartDate: z.iso.date(),
  preferredTimeStart: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).optional(),
  preferredTimeEnd: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).optional(),
  frequency: frequencySchema,
});

const offerSchema = z.object({
  amountCentsPerVisit: z.coerce.number().int().positive().max(50_000_000),
  estimatedDurationMinutes: z.coerce.number().int().min(30).max(1440),
  firstAvailableDate: z.iso.date(),
  message: z.string().trim().min(20).max(4000),
});

const reasonSchema = z.object({ reason: z.string().trim().min(5).max(1000) });
const completionSchema = z.object({ notes: z.string().trim().max(2000).default("") });

function laterDate(...values: string[]) {
  return values.reduce((latest, value) => value > latest ? value : latest);
}

function timeSql(value: string | null | undefined) {
  return value || null;
}

function requiredSpecialty(vertical: string) {
  return vertical === "limpieza_mantenimiento" ? "limpieza_profesional" : "jardineria";
}

function anchorDay(startDate: string) {
  const day = Number(startDate.slice(8, 10));
  return Number.isInteger(day) && day >= 1 && day <= 31 ? day : null;
}

export function homeServicesRouter(database: Database) {
  const router = Router();

  router.get("/home-services/catalog", (_request, response) => {
    response.json({ verticals: getHomeServiceCatalog() });
  });

  router.get("/home-services/assessments", (_request, response) => {
    response.json({ specialties: getHomeServiceProfessionalSpecialties() });
  });

  router.get("/home-services/assessments/:specialty", (request, response) => {
    const assessment = getPublicHomeServiceAssessment(request.params.specialty);
    if (!assessment) return response.status(404).json({ error: "Especialidad no disponible." });
    response.json({ assessment });
  });

  router.post("/home-services/assessments/:specialty/submit", requireAuth, requireRole("profesional"), async (request, response, next) => {
    try {
      const result = evaluateHomeServiceAssessment({ ...request.body, especialidad: request.params.specialty });
      if (!result.valid) return response.status(400).json({ error: result.error });
      if (!result.passed) return response.status(422).json({ error: "Evaluación no superada.", score: result.score, minimum: 80 });
      await database.query(
        `INSERT INTO professional_specialty_qualifications
          (id, professional_id, specialty_slug, specialty_label, is_primary, assessment_version,
           question_count, score, passed_at, verification_status)
         VALUES ($1,$2,$3,$4,false,$5,$6,$7,now(),'PENDIENTE_REVISION')
         ON CONFLICT (professional_id, specialty_slug) DO UPDATE SET
           assessment_version=EXCLUDED.assessment_version, question_count=EXCLUDED.question_count,
           score=EXCLUDED.score, passed_at=now(), verification_status='PENDIENTE_REVISION',
           reviewed_at=NULL, reviewed_by=NULL, review_reason=NULL, updated_at=now()`,
        [randomUUID(), request.user!.id, result.specialtySlug, result.specialtyLabel, result.version, result.total, result.score],
      );
      await audit(database, { actorUserId: request.user!.id, action: "HOME_SERVICE_ASSESSMENT_PASSED", entityType: "professional", entityId: request.user!.id, ip: request.ip, metadata: { specialty: result.specialtySlug, score: result.score } });
      response.json({ success: true, score: result.score, verificationStatus: "PENDIENTE_REVISION" });
    } catch (error) { next(error); }
  });

  router.post("/home-services/requests", requireAuth, requireRole("cliente"), async (request, response, next) => {
    try {
      const parsed = requestSchema.safeParse(request.body);
      if (!parsed.success) return response.status(400).json({ error: parsed.error.issues[0]?.message });
      const service = getHomeService(parsed.data.serviceSlug);
      if (!service) return response.status(400).json({ error: "Servicio no disponible." });
      if (!recurrenceAllowed(service.slug, parsed.data.frequency)) return response.status(400).json({ error: "La frecuencia elegida no es válida para este servicio." });
      if (parsed.data.requestedStartDate < madridDateIso()) return response.status(400).json({ error: "La fecha de inicio no puede estar en el pasado." });
      if (parsed.data.preferredTimeStart && parsed.data.preferredTimeEnd && parsed.data.preferredTimeEnd <= parsed.data.preferredTimeStart) {
        return response.status(400).json({ error: "La franja horaria final debe ser posterior a la inicial." });
      }
      const id = randomUUID();
      await database.query(
        `INSERT INTO home_service_requests
          (id, client_id, vertical, service_slug, location, property_type, square_meters,
           bedrooms, bathrooms, estimated_hours, notes, requested_start_date,
           preferred_time_start, preferred_time_end, frequency, status)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,'PUBLICADO')`,
        [id, request.user!.id, service.vertical, service.slug, parsed.data.location, parsed.data.propertyType,
          parsed.data.squareMeters ?? null, parsed.data.bedrooms ?? null, parsed.data.bathrooms ?? null,
          parsed.data.estimatedHours ?? null, parsed.data.notes, parsed.data.requestedStartDate,
          timeSql(parsed.data.preferredTimeStart), timeSql(parsed.data.preferredTimeEnd), parsed.data.frequency],
      );
      await audit(database, { actorUserId: request.user!.id, action: "HOME_SERVICE_REQUEST_PUBLISHED", entityType: "home_service_request", entityId: id, ip: request.ip, metadata: { serviceSlug: service.slug, frequency: parsed.data.frequency } });
      response.status(201).json({ success: true, request: { id, serviceSlug: service.slug, vertical: service.vertical, frequency: parsed.data.frequency, status: "PUBLICADO" } });
    } catch (error) { next(error); }
  });

  router.get("/home-services/requests", requireAuth, async (request, response, next) => {
    try {
      if (request.user!.role === "cliente") {
        const rows = await database.query(
          `SELECT id, vertical, service_slug, location, property_type, square_meters, requested_start_date,
                  preferred_time_start, preferred_time_end, frequency, status, assigned_professional_id, created_at
             FROM home_service_requests WHERE client_id=$1 ORDER BY created_at DESC LIMIT 100`,
          [request.user!.id],
        );
        return response.json({ requests: rows.rows });
      }
      if (request.user!.role === "profesional") {
        if (!request.user!.emailVerified || request.user!.accountStatus !== "ACTIVO" || request.user!.verificationStatus !== "APROBADO") {
          return response.status(403).json({ error: "Tu cuenta profesional debe estar verificada y activa." });
        }
        const rows = await database.query(
          `SELECT r.id, r.vertical, r.service_slug, r.location, r.property_type, r.square_meters,
                  r.requested_start_date, r.preferred_time_start, r.preferred_time_end, r.frequency,
                  r.status, r.created_at,
                  EXISTS (SELECT 1 FROM home_service_offers o WHERE o.request_id=r.id AND o.professional_id=$1) AS already_offered
             FROM home_service_requests r
            WHERE r.status='PUBLICADO'
              AND EXISTS (
                SELECT 1 FROM professional_specialty_qualifications q
                 WHERE q.professional_id=$1 AND q.verification_status='APROBADO'
                   AND q.specialty_slug = CASE WHEN r.vertical='limpieza_mantenimiento' THEN 'limpieza_profesional' ELSE 'jardineria' END
              )
            ORDER BY r.requested_start_date, r.created_at DESC LIMIT 100`,
          [request.user!.id],
        );
        return response.json({ requests: rows.rows });
      }
      const rows = await database.query("SELECT * FROM home_service_requests ORDER BY created_at DESC LIMIT 200");
      response.json({ requests: rows.rows });
    } catch (error) { next(error); }
  });

  router.get("/home-services/requests/:id/offers", requireAuth, requireRole("cliente", "admin"), async (request, response, next) => {
    try {
      const requestId = z.string().uuid().safeParse(request.params.id);
      if (!requestId.success) return response.status(400).json({ error: "Solicitud no válida." });
      const owner = await database.query<{ client_id: string }>("SELECT client_id FROM home_service_requests WHERE id=$1", [requestId.data]);
      if (!owner.rows[0] || (request.user!.role !== "admin" && owner.rows[0].client_id !== request.user!.id)) {
        return response.status(404).json({ error: "Solicitud no encontrada." });
      }
      const rows = await database.query(
        `SELECT o.id, o.professional_id, o.amount_cents_per_visit, o.estimated_duration_minutes,
                o.first_available_date, o.message, o.status, o.created_at,
                COALESCE(NULLIF(u.company_name,''),u.name) AS professional_display_name,
                COALESCE((SELECT avg(r.rating)::numeric(3,2) FROM reviews r WHERE r.subject_id=u.id AND r.status='PUBLICADA'),0) AS rating,
                (SELECT count(*)::int FROM reviews r WHERE r.subject_id=u.id AND r.status='PUBLICADA') AS review_count
           FROM home_service_offers o
           JOIN users u ON u.id=o.professional_id
          WHERE o.request_id=$1
          ORDER BY CASE o.status WHEN 'ACEPTADA' THEN 0 WHEN 'ENVIADA' THEN 1 ELSE 2 END, o.created_at`,
        [requestId.data],
      );
      response.json({ offers: rows.rows });
    } catch (error) { next(error); }
  });

  router.post("/home-services/requests/:id/offers", requireAuth, requireRole("profesional"), async (request, response, next) => {
    try {
      if (!request.user!.emailVerified || request.user!.accountStatus !== "ACTIVO" || request.user!.verificationStatus !== "APROBADO") {
        return response.status(403).json({ error: "Tu cuenta profesional debe estar verificada y activa." });
      }
      const requestId = z.string().uuid().safeParse(request.params.id);
      if (!requestId.success) return response.status(400).json({ error: "Solicitud no válida." });
      const parsed = offerSchema.safeParse(request.body);
      if (!parsed.success) return response.status(400).json({ error: parsed.error.issues[0]?.message });
      if (parsed.data.firstAvailableDate < madridDateIso()) return response.status(400).json({ error: "La primera fecha disponible no puede estar en el pasado." });
      const state = await database.query<{ status: string; vertical: string; qualification_status: string | null }>(
        `SELECT r.status, r.vertical, q.verification_status AS qualification_status
           FROM home_service_requests r
           LEFT JOIN professional_specialty_qualifications q ON q.professional_id=$2
             AND q.specialty_slug = CASE WHEN r.vertical='limpieza_mantenimiento' THEN 'limpieza_profesional' ELSE 'jardineria' END
          WHERE r.id=$1`,
        [requestId.data, request.user!.id],
      );
      const row = state.rows[0];
      if (!row) return response.status(404).json({ error: "Solicitud no encontrada." });
      if (row.status !== "PUBLICADO") return response.status(409).json({ error: "La solicitud ya no admite ofertas." });
      if (row.qualification_status !== "APROBADO") return response.status(403).json({ error: "La especialidad requerida debe estar aprobada." });
      const id = randomUUID();
      await database.query(
        `INSERT INTO home_service_offers
          (id, request_id, professional_id, amount_cents_per_visit, estimated_duration_minutes, first_available_date, message)
         VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [id, requestId.data, request.user!.id, parsed.data.amountCentsPerVisit, parsed.data.estimatedDurationMinutes, parsed.data.firstAvailableDate, parsed.data.message],
      );
      response.status(201).json({ success: true, offer: { id, status: "ENVIADA" } });
    } catch (error: unknown) {
      if (typeof error === "object" && error && "code" in error && error.code === "23505") return response.status(409).json({ error: "Ya has enviado una oferta para este servicio." });
      next(error);
    }
  });

  router.post("/home-services/requests/:requestId/offers/:offerId/accept", requireAuth, requireRole("cliente"), async (request, response, next) => {
    try {
      const requestId = z.string().uuid().safeParse(request.params.requestId);
      const offerId = z.string().uuid().safeParse(request.params.offerId);
      if (!requestId.success || !offerId.success) return response.status(400).json({ error: "Selección no válida." });
      const result = await withTransaction(database, async (client) => {
        const req = await client.query<{ client_id: string; vertical: string; service_slug: string; frequency: ServiceFrequency; requested_start_date: string; preferred_time_start: string | null; preferred_time_end: string | null; status: string }>(
          `SELECT client_id, vertical, service_slug, frequency, requested_start_date::text,
                  preferred_time_start::text, preferred_time_end::text, status
             FROM home_service_requests WHERE id=$1 FOR UPDATE`, [requestId.data]);
        const serviceRequest = req.rows[0];
        if (!serviceRequest || serviceRequest.client_id !== request.user!.id) return { status: 404, body: { error: "Solicitud no encontrada." } };
        if (serviceRequest.status !== "PUBLICADO") return { status: 409, body: { error: "La solicitud ya fue asignada o cerrada." } };
        const offers = await client.query<{ id: string; professional_id: string; amount_cents_per_visit: string; estimated_duration_minutes: number; first_available_date: string; status: string }>(
          `SELECT id, professional_id, amount_cents_per_visit::text, estimated_duration_minutes,
                  first_available_date::text, status FROM home_service_offers
            WHERE id=$1 AND request_id=$2 FOR UPDATE`, [offerId.data, requestId.data]);
        const offer = offers.rows[0];
        if (!offer || offer.status !== "ENVIADA") return { status: 404, body: { error: "Oferta no disponible." } };
        const professional = await client.query<{ account_status: string; email_verified: boolean; verification_status: string; qualification_status: string | null }>(
          `SELECT u.account_status, u.email_verified, u.verification_status,
                  q.verification_status AS qualification_status
             FROM users u
             LEFT JOIN professional_specialty_qualifications q ON q.professional_id=u.id AND q.specialty_slug=$2
            WHERE u.id=$1 AND u.role='profesional'`,
          [offer.professional_id, requiredSpecialty(serviceRequest.vertical)],
        );
        const professionalState = professional.rows[0];
        if (!professionalState || professionalState.account_status !== "ACTIVO" || !professionalState.email_verified
          || professionalState.verification_status !== "APROBADO" || professionalState.qualification_status !== "APROBADO") {
          return { status: 409, body: { error: "El profesional ya no está disponible o verificado para este servicio." } };
        }
        const firstVisitDate = laterDate(serviceRequest.requested_start_date, offer.first_available_date, madridDateIso());
        const engagementId = randomUUID();
        const visitId = randomUUID();
        await client.query("UPDATE home_service_requests SET status='ASIGNADO', assigned_professional_id=$2, updated_at=now() WHERE id=$1", [requestId.data, offer.professional_id]);
        await client.query("UPDATE home_service_offers SET status=CASE WHEN id=$2 THEN 'ACEPTADA' ELSE 'RECHAZADA' END, updated_at=now() WHERE request_id=$1 AND status='ENVIADA'", [requestId.data, offer.id]);
        await client.query(
          `INSERT INTO home_service_engagements
            (id, request_id, offer_id, client_id, professional_id, service_slug, frequency,
             price_cents_per_visit, estimated_duration_minutes, preferred_time_start, preferred_time_end,
             start_date, next_visit_date, status)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$12,'ACTIVO')`,
          [engagementId, requestId.data, offer.id, request.user!.id, offer.professional_id, serviceRequest.service_slug,
            serviceRequest.frequency, offer.amount_cents_per_visit, offer.estimated_duration_minutes,
            serviceRequest.preferred_time_start, serviceRequest.preferred_time_end, firstVisitDate],
        );
        await client.query(
          `INSERT INTO home_service_visits (id, engagement_id, sequence_number, scheduled_date, scheduled_time)
           VALUES ($1,$2,1,$3,$4)`, [visitId, engagementId, firstVisitDate, serviceRequest.preferred_time_start]);
        await client.query(
          `INSERT INTO home_service_visit_events (visit_id, actor_user_id, event_type, metadata)
           VALUES ($1,$2,'PROGRAMADA',jsonb_build_object('sequence',1,'scheduledDate',$3::text))`, [visitId, request.user!.id, firstVisitDate]);
        await audit(client, { actorUserId: request.user!.id, action: "HOME_SERVICE_OFFER_ACCEPTED", entityType: "home_service_engagement", entityId: engagementId, ip: request.ip, metadata: { requestId: requestId.data, offerId: offer.id, firstVisitDate } });
        return { status: 201, body: { success: true, engagement: { id: engagementId, status: "ACTIVO", nextVisitDate: firstVisitDate }, visit: { id: visitId, sequenceNumber: 1, scheduledDate: firstVisitDate } } };
      });
      response.status(result.status).json(result.body);
    } catch (error) { next(error); }
  });

  router.get("/home-services/engagements", requireAuth, async (request, response, next) => {
    try {
      const rows = await database.query(
        `SELECT e.id, e.request_id, e.client_id, e.professional_id, e.service_slug, e.frequency,
                e.price_cents_per_visit, e.estimated_duration_minutes, e.start_date, e.next_visit_date,
                e.status, e.created_at,
                (SELECT json_agg(json_build_object('id',v.id,'sequenceNumber',v.sequence_number,'scheduledDate',v.scheduled_date,
                  'scheduledTime',v.scheduled_time,'status',v.status) ORDER BY v.sequence_number DESC)
                   FROM (SELECT * FROM home_service_visits x WHERE x.engagement_id=e.id ORDER BY x.sequence_number DESC LIMIT 12) v) AS visits
           FROM home_service_engagements e
          WHERE ($2='admin') OR e.client_id=$1 OR e.professional_id=$1
          ORDER BY e.created_at DESC LIMIT 100`,
        [request.user!.id, request.user!.role],
      );
      response.json({ engagements: rows.rows });
    } catch (error) { next(error); }
  });

  router.post("/home-services/engagements/:id/pause", requireAuth, requireRole("cliente"), async (request, response, next) => {
    try {
      const id = z.string().uuid().safeParse(request.params.id);
      if (!id.success) return response.status(400).json({ error: "Servicio no válido." });
      const result = await withTransaction(database, async (client) => {
        const engagement = await client.query<{ status: string; frequency: ServiceFrequency }>(
          "SELECT status,frequency FROM home_service_engagements WHERE id=$1 AND client_id=$2 FOR UPDATE", [id.data, request.user!.id]);
        const row = engagement.rows[0];
        if (!row || row.status !== "ACTIVO" || row.frequency === "PUNTUAL") return null;
        const inProgress = await client.query("SELECT 1 FROM home_service_visits WHERE engagement_id=$1 AND status='EN_CURSO' LIMIT 1", [id.data]);
        if (inProgress.rows[0]) return { conflict: true };
        const cancelled = await client.query<{ id: string; scheduled_date: string }>(
          `UPDATE home_service_visits SET status='CANCELADA_CLIENTE', updated_at=now()
            WHERE engagement_id=$1 AND status='PROGRAMADA'
            RETURNING id,scheduled_date::text`, [id.data]);
        for (const visit of cancelled.rows) {
          await client.query(
            "INSERT INTO home_service_visit_events (visit_id, actor_user_id, event_type, metadata) VALUES ($1,$2,'CANCELADA',jsonb_build_object('reason','PAUSA_SERVICIO'))",
            [visit.id, request.user!.id],
          );
        }
        await client.query("UPDATE home_service_engagements SET status='PAUSADO', paused_at=now(), next_visit_date=NULL, updated_at=now() WHERE id=$1", [id.data]);
        await audit(client, { actorUserId: request.user!.id, action: "HOME_SERVICE_PAUSED", entityType: "home_service_engagement", entityId: id.data, ip: request.ip, metadata: { cancelledVisits: cancelled.rowCount ?? 0 } });
        return { id: id.data, status: "PAUSADO", conflict: false };
      });
      if (!result) return response.status(409).json({ error: "El servicio no puede pausarse en su estado actual." });
      if (result.conflict) return response.status(409).json({ error: "No puedes pausar el servicio mientras hay una visita en curso." });
      response.json({ engagement: result });
    } catch (error) { next(error); }
  });

  router.post("/home-services/engagements/:id/resume", requireAuth, requireRole("cliente"), async (request, response, next) => {
    try {
      const id = z.string().uuid().safeParse(request.params.id);
      if (!id.success) return response.status(400).json({ error: "Servicio no válido." });
      const result = await withTransaction(database, async (client) => {
        const engagement = await client.query<{ frequency: ServiceFrequency; preferred_time_start: string | null; status: string; start_date: string }>(
          "SELECT frequency, preferred_time_start::text, status, start_date::text FROM home_service_engagements WHERE id=$1 AND client_id=$2 FOR UPDATE", [id.data, request.user!.id]);
        const row = engagement.rows[0];
        if (!row || row.status !== "PAUSADO" || row.frequency === "PUNTUAL") return null;
        const pending = await client.query("SELECT 1 FROM home_service_visits WHERE engagement_id=$1 AND status IN ('PROGRAMADA','EN_CURSO') LIMIT 1", [id.data]);
        if (pending.rows[0]) return null;
        const last = await client.query<{ scheduled_date: string; sequence_number: number }>(
          "SELECT scheduled_date::text, sequence_number FROM home_service_visits WHERE engagement_id=$1 ORDER BY sequence_number DESC LIMIT 1", [id.data]);
        if (!last.rows[0]) return null;
        const recurrenceAnchor = anchorDay(row.start_date);
        let nextDate = nextOccurrenceDate(last.rows[0].scheduled_date, row.frequency, recurrenceAnchor);
        while (nextDate && nextDate < madridDateIso()) nextDate = nextOccurrenceDate(nextDate, row.frequency, recurrenceAnchor);
        if (!nextDate) return null;
        const visitId = randomUUID();
        const sequence = last.rows[0].sequence_number + 1;
        await client.query("UPDATE home_service_engagements SET status='ACTIVO', paused_at=NULL, next_visit_date=$2, updated_at=now() WHERE id=$1", [id.data, nextDate]);
        await client.query("INSERT INTO home_service_visits (id, engagement_id, sequence_number, scheduled_date, scheduled_time) VALUES ($1,$2,$3,$4,$5)", [visitId, id.data, sequence, nextDate, row.preferred_time_start]);
        await client.query("INSERT INTO home_service_visit_events (visit_id, actor_user_id, event_type, metadata) VALUES ($1,$2,'PROGRAMADA',jsonb_build_object('resumed',true))", [visitId, request.user!.id]);
        await audit(client, { actorUserId: request.user!.id, action: "HOME_SERVICE_RESUMED", entityType: "home_service_engagement", entityId: id.data, ip: request.ip, metadata: { nextDate } });
        return { id: id.data, status: "ACTIVO", nextVisitDate: nextDate, visitId };
      });
      if (!result) return response.status(409).json({ error: "El servicio no puede reanudarse." });
      response.json({ engagement: result });
    } catch (error) { next(error); }
  });

  router.post("/home-services/engagements/:id/cancel", requireAuth, async (request, response, next) => {
    try {
      const id = z.string().uuid().safeParse(request.params.id);
      const parsed = reasonSchema.safeParse(request.body);
      if (!id.success || !parsed.success) return response.status(400).json({ error: "Cancelación no válida." });
      const result = await withTransaction(database, async (client) => {
        const engagement = await client.query<{ client_id: string; professional_id: string; status: string; request_id: string }>(
          "SELECT client_id, professional_id, status, request_id FROM home_service_engagements WHERE id=$1 FOR UPDATE", [id.data]);
        const row = engagement.rows[0];
        if (!row || (request.user!.role !== "admin" && row.client_id !== request.user!.id && row.professional_id !== request.user!.id)) return { status: 404, body: { error: "Servicio no encontrado." } };
        if (["CANCELADO", "FINALIZADO"].includes(row.status)) return { status: 409, body: { error: "El servicio ya está cerrado." } };
        const inProgress = await client.query("SELECT 1 FROM home_service_visits WHERE engagement_id=$1 AND status='EN_CURSO' LIMIT 1", [id.data]);
        if (inProgress.rows[0]) return { status: 409, body: { error: "No puedes cancelar el servicio mientras hay una visita en curso." } };
        const visitStatus = request.user!.role === "profesional" ? "CANCELADA_PROFESIONAL" : request.user!.role === "cliente" ? "CANCELADA_CLIENTE" : "NO_REALIZADA";
        const cancelled = await client.query<{ id: string }>(
          `UPDATE home_service_visits SET status=$2, updated_at=now()
            WHERE engagement_id=$1 AND status='PROGRAMADA' RETURNING id`, [id.data, visitStatus]);
        for (const visit of cancelled.rows) {
          await client.query(
            "INSERT INTO home_service_visit_events (visit_id, actor_user_id, event_type, metadata) VALUES ($1,$2,'CANCELADA',jsonb_build_object('reason',$3::text,'source','ENGAGEMENT_CANCELLED'))",
            [visit.id, request.user!.id, parsed.data.reason],
          );
        }
        await client.query("UPDATE home_service_engagements SET status='CANCELADO', cancelled_at=now(), cancellation_reason=$2, next_visit_date=NULL, updated_at=now() WHERE id=$1", [id.data, parsed.data.reason]);
        await client.query("UPDATE home_service_requests SET status='CANCELADO', updated_at=now() WHERE id=$1", [row.request_id]);
        await audit(client, { actorUserId: request.user!.id, action: "HOME_SERVICE_CANCELLED", entityType: "home_service_engagement", entityId: id.data, ip: request.ip, metadata: { reason: parsed.data.reason, visitStatus } });
        return { status: 200, body: { success: true, status: "CANCELADO" } };
      });
      response.status(result.status).json(result.body);
    } catch (error) { next(error); }
  });

  router.post("/home-services/visits/:id/start", requireAuth, requireRole("profesional"), async (request, response, next) => {
    try {
      const id = z.string().uuid().safeParse(request.params.id);
      if (!id.success) return response.status(400).json({ error: "Visita no válida." });
      const result = await withTransaction(database, async (client) => {
        const updated = await client.query<{ id: string; status: string; engagement_id: string }>(
          `UPDATE home_service_visits v SET status='EN_CURSO', started_at=now(), updated_at=now()
            FROM home_service_engagements e
           WHERE v.id=$1 AND v.engagement_id=e.id AND e.professional_id=$2 AND e.status='ACTIVO'
             AND v.status='PROGRAMADA' AND v.scheduled_date <= $3::date
           RETURNING v.id,v.status,v.engagement_id`, [id.data, request.user!.id, madridDateIso()]);
        const visit = updated.rows[0];
        if (!visit) return null;
        await client.query("INSERT INTO home_service_visit_events (visit_id, actor_user_id, event_type) VALUES ($1,$2,'INICIADA')", [id.data, request.user!.id]);
        await audit(client, { actorUserId: request.user!.id, action: "HOME_SERVICE_VISIT_STARTED", entityType: "home_service_visit", entityId: id.data, ip: request.ip });
        return visit;
      });
      if (!result) return response.status(409).json({ error: "La visita no puede iniciarse antes de su fecha ni en su estado actual." });
      response.json({ visit: result });
    } catch (error) { next(error); }
  });

  router.post("/home-services/visits/:id/complete", requireAuth, requireRole("profesional"), async (request, response, next) => {
    try {
      const id = z.string().uuid().safeParse(request.params.id);
      const parsed = completionSchema.safeParse(request.body ?? {});
      if (!id.success || !parsed.success) return response.status(400).json({ error: "Finalización no válida." });
      const result = await withTransaction(database, async (client) => {
        const visits = await client.query<{ engagement_id: string; sequence_number: number; scheduled_date: string; status: string }>(
          `SELECT v.engagement_id, v.sequence_number, v.scheduled_date::text, v.status
             FROM home_service_visits v JOIN home_service_engagements e ON e.id=v.engagement_id
            WHERE v.id=$1 AND e.professional_id=$2 FOR UPDATE`, [id.data, request.user!.id]);
        const visit = visits.rows[0];
        if (!visit || visit.status !== "EN_CURSO") return null;
        const engagements = await client.query<{ frequency: ServiceFrequency; status: string; preferred_time_start: string | null; request_id: string; start_date: string }>(
          "SELECT frequency,status,preferred_time_start::text,request_id,start_date::text FROM home_service_engagements WHERE id=$1 FOR UPDATE", [visit.engagement_id]);
        const engagement = engagements.rows[0];
        if (!engagement || engagement.status !== "ACTIVO") return null;
        await client.query("UPDATE home_service_visits SET status='COMPLETADA', completed_at=now(), completion_notes=$2, updated_at=now() WHERE id=$1", [id.data, parsed.data.notes]);
        await client.query("INSERT INTO home_service_visit_events (visit_id, actor_user_id, event_type, metadata) VALUES ($1,$2,'COMPLETADA',jsonb_build_object('notes',$3::text))", [id.data, request.user!.id, parsed.data.notes]);
        const recurrenceAnchor = anchorDay(engagement.start_date);
        let nextDate = nextOccurrenceDate(visit.scheduled_date, engagement.frequency, recurrenceAnchor);
        while (nextDate && nextDate <= madridDateIso()) nextDate = nextOccurrenceDate(nextDate, engagement.frequency, recurrenceAnchor);
        if (!nextDate) {
          await client.query("UPDATE home_service_engagements SET status='FINALIZADO', next_visit_date=NULL, updated_at=now() WHERE id=$1", [visit.engagement_id]);
          await client.query("UPDATE home_service_requests SET status='FINALIZADO', updated_at=now() WHERE id=$1", [engagement.request_id]);
          await audit(client, { actorUserId: request.user!.id, action: "HOME_SERVICE_VISIT_COMPLETED", entityType: "home_service_visit", entityId: id.data, ip: request.ip, metadata: { recurring: false } });
          return { completed: true, engagementStatus: "FINALIZADO", nextVisit: null };
        }
        const nextId = randomUUID();
        const sequence = visit.sequence_number + 1;
        await client.query("INSERT INTO home_service_visits (id, engagement_id, sequence_number, scheduled_date, scheduled_time) VALUES ($1,$2,$3,$4,$5)", [nextId, visit.engagement_id, sequence, nextDate, engagement.preferred_time_start]);
        await client.query("INSERT INTO home_service_visit_events (visit_id, actor_user_id, event_type, metadata) VALUES ($1,$2,'PROGRAMADA',jsonb_build_object('autoRecurring',true,'previousVisitId',$3::text))", [nextId, request.user!.id, id.data]);
        await client.query("UPDATE home_service_engagements SET next_visit_date=$2, updated_at=now() WHERE id=$1", [visit.engagement_id, nextDate]);
        await audit(client, { actorUserId: request.user!.id, action: "HOME_SERVICE_VISIT_COMPLETED", entityType: "home_service_visit", entityId: id.data, ip: request.ip, metadata: { recurring: true, nextDate, nextVisitId: nextId } });
        return { completed: true, engagementStatus: "ACTIVO", nextVisit: { id: nextId, sequenceNumber: sequence, scheduledDate: nextDate } };
      });
      if (!result) return response.status(409).json({ error: "La visita debe estar en curso antes de finalizarse." });
      response.json(result);
    } catch (error) { next(error); }
  });

  return router;
}
