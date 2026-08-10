import { randomUUID } from "node:crypto";
import { Router } from "express";
import { z } from "zod";
import type { Database } from "../db.js";
import { withTransaction } from "../db.js";
import { requireAuth, requireRole } from "../services/auth.js";
import { buildTextPdf } from "../services/simple-pdf.js";
import { audit } from "../services/audit.js";

const acceptSchema = z.object({
  proposalId: z.string().uuid(),
  milestones: z.array(z.object({
    title: z.string().trim().min(3).max(160),
    description: z.string().trim().max(2000).default(""),
    amountCents: z.coerce.number().int().positive().max(500_000_000),
    dueDate: z.string().date().optional(),
  })).min(1).max(20),
});
const evidenceSchema = z.object({ fileId: z.string().uuid(), description: z.string().trim().min(3).max(2000) });
const messageSchema = z.object({ body: z.string().trim().min(1).max(5000) });
const reviewSchema = z.object({ rating: z.coerce.number().int().min(1).max(5), comment: z.string().trim().min(10).max(3000) });

type ContractPdfRow = {
  id: string;
  client_id: string;
  professional_id: string;
  client_name: string;
  professional_name: string;
  company_name: string | null;
  project_title: string;
  project_description: string;
  project_location: string;
  specialty_slug: string;
  agreed_amount_cents: string;
  estimated_days: number;
  proposal_message: string;
  accepted_at: Date | string;
  terms_version: string;
};

type MilestonePdfRow = {
  position: number;
  title: string;
  description: string;
  amount_cents: string;
  due_date: Date | string | null;
};

type ConversationRow = { id: string; client_id: string; professional_id: string };
type ReviewContractRow = { client_id: string; professional_id: string; project_status: string };
type DatabaseError = { code?: string };

export function executionRouter(database: Database) {
  const router = Router();

  router.post("/projects/:id/contracts/accept", requireAuth, requireRole("cliente"), async (request, response, next) => {
    try {
      const projectId = z.string().uuid().safeParse(request.params.id);
      const parsed = acceptSchema.safeParse(request.body);
      if (!projectId.success || !parsed.success) return response.status(400).json({ error: "Datos de contrato no válidos." });
      const total = parsed.data.milestones.reduce((sum, item) => sum + item.amountCents, 0);
      const result = await withTransaction(database, async (client) => {
        const proposal = await client.query<{
          owner_id: string; project_status: string; title: string; description: string; location: string; category: string;
          professional_id: string; amount_cents: string; estimated_days: number; message: string; proposal_status: string;
        }>(`SELECT p.owner_id, p.status AS project_status, p.title, p.description, p.location, p.category,
                  pr.professional_id, pr.amount_cents::text, pr.estimated_days, pr.message, pr.status AS proposal_status
             FROM projects p JOIN proposals pr ON pr.project_id = p.id
            WHERE p.id = $1 AND pr.id = $2 FOR UPDATE OF p, pr`, [projectId.data, parsed.data.proposalId]);
        const row = proposal.rows[0];
        if (!row || row.owner_id !== request.user!.id) return { status: 404, body: { error: "Proyecto o propuesta no encontrados." } };
        if (row.project_status !== "PUBLICADO" || row.proposal_status !== "ENVIADA") return { status: 409, body: { error: "La propuesta ya no puede aceptarse." } };
        if (total !== Number(row.amount_cents)) return { status: 422, body: { error: "La suma de hitos debe coincidir exactamente con el presupuesto aceptado." } };
        const contractId = randomUUID();
        await client.query(`INSERT INTO work_contracts
          (id, project_id, proposal_id, client_id, professional_id, project_title, project_description,
           project_location, specialty_slug, agreed_amount_cents, estimated_days, proposal_message)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`, [contractId, projectId.data, parsed.data.proposalId,
          request.user!.id, row.professional_id, row.title, row.description, row.location, row.category,
          row.amount_cents, row.estimated_days, row.message]);
        await client.query("UPDATE proposals SET status = CASE WHEN id = $2 THEN 'ACEPTADA' ELSE 'RECHAZADA' END, updated_at = now() WHERE project_id = $1 AND status = 'ENVIADA'", [projectId.data, parsed.data.proposalId]);
        await client.query("UPDATE projects SET status = 'EN_CURSO', assigned_professional_id = $2, updated_at = now() WHERE id = $1", [projectId.data, row.professional_id]);
        for (const [index, item] of parsed.data.milestones.entries()) {
          const milestoneId = randomUUID();
          await client.query(`INSERT INTO milestones (id, project_id, position, title, description, amount_cents, due_date)
                              VALUES ($1,$2,$3,$4,$5,$6,$7)`, [milestoneId, projectId.data, index + 1, item.title, item.description, item.amountCents, item.dueDate ?? null]);
          await client.query(`INSERT INTO work_passport_entries (project_id, actor_user_id, event_type, entity_type, entity_id, summary, metadata)
                              VALUES ($1,$2,'HITO_CREADO','milestone',$3,$4,$5::jsonb)`, [projectId.data, request.user!.id, milestoneId, item.title, JSON.stringify({ position: index + 1, amountCents: item.amountCents })]);
        }
        await client.query(`INSERT INTO work_passport_entries (project_id, actor_user_id, event_type, entity_type, entity_id, summary, metadata)
                            VALUES ($1,$2,'CONTRATO_ACEPTADO','contract',$3,'Contrato aceptado y presupuesto congelado',$4::jsonb)`,
          [projectId.data, request.user!.id, contractId, JSON.stringify({ proposalId: parsed.data.proposalId, professionalId: row.professional_id, amountCents: Number(row.amount_cents) })]);
        await audit(client, { actorUserId: request.user!.id, action: "WORK_CONTRACT_ACCEPTED", entityType: "project", entityId: projectId.data, ip: request.ip, metadata: { contractId } });
        return { status: 201, body: { success: true, contractId, projectStatus: "EN_CURSO" } };
      });
      response.status(result.status).json(result.body);
    } catch (error) { next(error); }
  });

  router.get("/projects/:id/contract", requireAuth, async (request, response, next) => {
    try {
      const projectId = z.string().uuid().safeParse(request.params.id);
      if (!projectId.success) return response.status(400).json({ error: "Proyecto no válido." });
      const contract = await database.query(`SELECT c.*, p.status AS project_status FROM work_contracts c JOIN projects p ON p.id = c.project_id
        WHERE c.project_id = $1 AND ($2 = 'admin' OR c.client_id = $3 OR c.professional_id = $3)`, [projectId.data, request.user!.role, request.user!.id]);
      if (!contract.rows[0]) return response.status(404).json({ error: "Contrato no encontrado." });
      const milestones = await database.query("SELECT id, position, title, description, amount_cents, status, due_date, created_at, updated_at FROM milestones WHERE project_id = $1 ORDER BY position", [projectId.data]);
      response.json({ contract: contract.rows[0], milestones: milestones.rows });
    } catch (error) { next(error); }
  });

  router.get("/projects/:id/contract/pdf", requireAuth, async (request, response, next) => {
    try {
      const projectId = z.string().uuid().safeParse(request.params.id);
      if (!projectId.success) return response.status(400).json({ error: "Proyecto no válido." });
      const contractResult = await database.query<ContractPdfRow>(`SELECT c.*, cu.name AS client_name, pu.name AS professional_name, pu.company_name
        FROM work_contracts c JOIN users cu ON cu.id = c.client_id JOIN users pu ON pu.id = c.professional_id
        WHERE c.project_id = $1 AND ($2 = 'admin' OR c.client_id = $3 OR c.professional_id = $3)`, [projectId.data, request.user!.role, request.user!.id]);
      const contract = contractResult.rows[0];
      if (!contract) return response.status(404).json({ error: "Contrato no encontrado." });
      const milestones = await database.query<MilestonePdfRow>("SELECT position, title, description, amount_cents::text, due_date FROM milestones WHERE project_id = $1 ORDER BY position", [projectId.data]);
      const euro = (cents: number | string) => `${(Number(cents) / 100).toFixed(2)} EUR`;
      const pdf = buildTextPdf(`MiConstructor - Contrato de obra ${contract.id}`, [
        { heading: "Partes", body: [`Cliente: ${contract.client_name}`, `Profesional: ${contract.professional_name}${contract.company_name ? ` / ${contract.company_name}` : ""}`] },
        { heading: "Proyecto", body: [contract.project_title, contract.project_description, `Ubicación: ${contract.project_location}`, `Especialidad: ${contract.specialty_slug}`] },
        { heading: "Presupuesto aceptado", body: [`Importe total: ${euro(contract.agreed_amount_cents)}`, `Duración estimada: ${contract.estimated_days} días`, contract.proposal_message] },
        { heading: "Hitos", body: milestones.rows.flatMap((milestone) => [`${milestone.position}. ${milestone.title} - ${euro(milestone.amount_cents)}${milestone.due_date ? ` - ${String(milestone.due_date).slice(0, 10)}` : ""}`, milestone.description || "Sin descripción adicional."]) },
        { heading: "Trazabilidad", body: [`Contrato aceptado: ${new Date(contract.accepted_at).toISOString()}`, `Versión de términos: ${contract.terms_version}`, "Este documento es una instantánea inmutable de la propuesta aceptada y de los hitos acordados en MiConstructor."] },
      ]);
      response.setHeader("content-type", "application/pdf");
      response.setHeader("content-disposition", `inline; filename=contrato-${contract.id}.pdf`);
      response.send(pdf);
    } catch (error) { next(error); }
  });

  router.post("/milestones/:id/evidence", requireAuth, requireRole("profesional"), async (request, response, next) => {
    try {
      const milestoneId = z.string().uuid().safeParse(request.params.id);
      const parsed = evidenceSchema.safeParse(request.body);
      if (!milestoneId.success || !parsed.success) return response.status(400).json({ error: "Evidencia no válida." });
      const result = await withTransaction(database, async (client) => {
        const row = (await client.query<{ project_id: string; assigned_professional_id: string; status: string }>(`SELECT m.project_id, p.assigned_professional_id, m.status FROM milestones m JOIN projects p ON p.id=m.project_id WHERE m.id=$1 FOR UPDATE OF m`, [milestoneId.data])).rows[0];
        if (!row || row.assigned_professional_id !== request.user!.id) return { status: 404, body: { error: "Hito no encontrado." } };
        if (!["PREVISTO", "RETENIDO", "EN_REVISION"].includes(row.status)) return { status: 409, body: { error: "El hito no admite nuevas evidencias." } };
        const file = (await client.query<{ owner_id: string; purpose: string }>("SELECT owner_id, purpose FROM stored_files WHERE id=$1", [parsed.data.fileId])).rows[0];
        if (!file || file.owner_id !== request.user!.id || file.purpose !== "HITO_EVIDENCIA") return { status: 400, body: { error: "Archivo de evidencia no válido." } };
        const evidenceId = randomUUID();
        await client.query("INSERT INTO milestone_evidence (id,milestone_id,professional_id,file_id,description) VALUES ($1,$2,$3,$4,$5)", [evidenceId, milestoneId.data, request.user!.id, parsed.data.fileId, parsed.data.description]);
        await client.query("UPDATE milestones SET status='EN_REVISION', updated_at=now() WHERE id=$1", [milestoneId.data]);
        await client.query("INSERT INTO work_passport_entries (project_id,actor_user_id,event_type,entity_type,entity_id,summary,metadata) VALUES ($1,$2,'EVIDENCIA_SUBIDA','milestone',$3,$4,$5::jsonb)", [row.project_id, request.user!.id, milestoneId.data, parsed.data.description, JSON.stringify({ evidenceId, fileId: parsed.data.fileId })]);
        return { status: 201, body: { success: true, evidenceId, status: "EN_REVISION" } };
      });
      response.status(result.status).json(result.body);
    } catch (error) { next(error); }
  });

  router.post("/milestones/:id/approve", requireAuth, requireRole("cliente"), async (request, response, next) => {
    try {
      const milestoneId = z.string().uuid().safeParse(request.params.id);
      if (!milestoneId.success) return response.status(400).json({ error: "Hito no válido." });
      const result = await withTransaction(database, async (client) => {
        const row = (await client.query<{ project_id: string; owner_id: string; status: string }>(`SELECT m.project_id,p.owner_id,m.status FROM milestones m JOIN projects p ON p.id=m.project_id WHERE m.id=$1 FOR UPDATE OF m`, [milestoneId.data])).rows[0];
        if (!row || row.owner_id !== request.user!.id) return { status: 404, body: { error: "Hito no encontrado." } };
        if (row.status !== "EN_REVISION") return { status: 409, body: { error: "El hito debe estar en revisión." } };
        await client.query("UPDATE milestones SET status='LIBERADO', updated_at=now() WHERE id=$1", [milestoneId.data]);
        await client.query("INSERT INTO work_passport_entries (project_id,actor_user_id,event_type,entity_type,entity_id,summary) VALUES ($1,$2,'HITO_LIBERADO','milestone',$3,'Hito aprobado por el cliente')", [row.project_id, request.user!.id, milestoneId.data]);
        const countResult = await client.query<{ count: string }>("SELECT count(*)::text AS count FROM milestones WHERE project_id=$1 AND status <> 'LIBERADO'", [row.project_id]);
        const pending = Number(countResult.rows[0]?.count ?? "0");
        if (pending === 0) {
          await client.query("UPDATE projects SET status='FINALIZADO', updated_at=now() WHERE id=$1", [row.project_id]);
          await client.query("INSERT INTO work_passport_entries (project_id,actor_user_id,event_type,entity_type,entity_id,summary) VALUES ($1,$2,'PROYECTO_FINALIZADO','project',$1,'Todos los hitos han sido aprobados')", [row.project_id, request.user!.id]);
        }
        return { status: 200, body: { success: true, status: "LIBERADO", projectFinished: pending === 0 } };
      });
      response.status(result.status).json(result.body);
    } catch (error) { next(error); }
  });

  router.get("/projects/:id/passport", requireAuth, async (request, response, next) => {
    try {
      const projectId = z.string().uuid().safeParse(request.params.id);
      if (!projectId.success) return response.status(400).json({ error: "Proyecto no válido." });
      const access = await database.query("SELECT id FROM work_contracts WHERE project_id=$1 AND ($2='admin' OR client_id=$3 OR professional_id=$3)", [projectId.data, request.user!.role, request.user!.id]);
      if (!access.rows[0]) return response.status(404).json({ error: "Proyecto no encontrado." });
      const entries = await database.query("SELECT id,event_type,entity_type,entity_id,summary,metadata,created_at FROM work_passport_entries WHERE project_id=$1 ORDER BY created_at,id", [projectId.data]);
      response.json({ projectId: projectId.data, entries: entries.rows });
    } catch (error) { next(error); }
  });

  router.get("/projects/:id/messages", requireAuth, async (request, response, next) => {
    try {
      const projectId = z.string().uuid().safeParse(request.params.id);
      if (!projectId.success) return response.status(400).json({ error: "Proyecto no válido." });
      const conversation = (await database.query<ConversationRow>("SELECT id,client_id,professional_id FROM conversations WHERE project_id=$1 AND ($2='admin' OR client_id=$3 OR professional_id=$3)", [projectId.data, request.user!.role, request.user!.id])).rows[0];
      if (!conversation) return response.status(404).json({ error: "Conversación no encontrada." });
      const messages = await database.query("SELECT id,sender_id,message_type,body,file_id,created_at FROM messages WHERE conversation_id=$1 ORDER BY created_at,id", [conversation.id]);
      response.json({ conversationId: conversation.id, messages: messages.rows });
    } catch (error) { next(error); }
  });

  router.post("/projects/:id/messages", requireAuth, async (request, response, next) => {
    try {
      const projectId = z.string().uuid().safeParse(request.params.id);
      const parsed = messageSchema.safeParse(request.body);
      if (!projectId.success || !parsed.success) return response.status(400).json({ error: "Mensaje no válido." });
      const conversation = (await database.query<ConversationRow>("SELECT id,client_id,professional_id FROM conversations WHERE project_id=$1 AND (client_id=$2 OR professional_id=$2)", [projectId.data, request.user!.id])).rows[0];
      if (!conversation) return response.status(404).json({ error: "Conversación no encontrada." });
      const id = randomUUID();
      await database.query("INSERT INTO messages (id,conversation_id,sender_id,message_type,body) VALUES ($1,$2,$3,'TEXT',$4)", [id, conversation.id, request.user!.id, parsed.data.body]);
      await database.query("INSERT INTO work_passport_entries (project_id,actor_user_id,event_type,entity_type,entity_id,summary) VALUES ($1,$2,'MENSAJE_ENVIADO','message',$3,'Mensaje registrado en la conversación del proyecto')", [projectId.data, request.user!.id, id]);
      response.status(201).json({ success: true, message: { id, body: parsed.data.body } });
    } catch (error) { next(error); }
  });

  router.post("/projects/:id/reviews", requireAuth, async (request, response, next) => {
    try {
      const projectId = z.string().uuid().safeParse(request.params.id);
      const parsed = reviewSchema.safeParse(request.body);
      if (!projectId.success || !parsed.success) return response.status(400).json({ error: "Reseña no válida." });
      const contract = (await database.query<ReviewContractRow>("SELECT c.client_id,c.professional_id,p.status AS project_status FROM work_contracts c JOIN projects p ON p.id=c.project_id WHERE c.project_id=$1 AND (c.client_id=$2 OR c.professional_id=$2)", [projectId.data, request.user!.id])).rows[0];
      if (!contract) return response.status(404).json({ error: "Proyecto no encontrado." });
      if (contract.project_status !== "FINALIZADO") return response.status(409).json({ error: "Las reseñas se habilitan al finalizar todos los hitos." });
      const subjectId = request.user!.id === contract.client_id ? contract.professional_id : contract.client_id;
      const id = randomUUID();
      try {
        await database.query("INSERT INTO reviews (id,project_id,author_id,subject_id,rating,comment) VALUES ($1,$2,$3,$4,$5,$6)", [id, projectId.data, request.user!.id, subjectId, parsed.data.rating, parsed.data.comment]);
      } catch (error: unknown) {
        if ((error as DatabaseError)?.code === "23505") return response.status(409).json({ error: "Ya has enviado tu reseña para este proyecto." });
        throw error;
      }
      await database.query("UPDATE reviews SET status='PUBLICADA',published_at=now() WHERE project_id=$1 AND status='SELLADA' AND (SELECT count(*) FROM reviews WHERE project_id=$1)=2", [projectId.data]);
      await database.query("INSERT INTO work_passport_entries (project_id,actor_user_id,event_type,entity_type,entity_id,summary) VALUES ($1,$2,'REVIEW_CREADA','review',$3,'Reseña sellada registrada')", [projectId.data, request.user!.id, id]);
      response.status(201).json({ success: true, reviewId: id, status: "SELLADA" });
    } catch (error) { next(error); }
  });

  return router;
}
