import { createHash, randomUUID } from "node:crypto";
import { Router } from "express";
import multer from "multer";
import { z } from "zod";
import type { AppConfig } from "../config.js";
import type { Database, DatabaseClient } from "../db.js";
import { withTransaction } from "../db.js";
import { audit } from "../services/audit.js";
import { requireAuth, requireRole } from "../services/auth.js";
import type { PrivateStorage, StoredFile } from "../services/storage.js";

const allowedDocumentTypes = new Set(["application/pdf", "image/jpeg", "image/png", "image/webp"]);

const decisionSchema = z.object({
  decision: z.enum(["APROBAR", "RECHAZAR"]),
  reason: z.string().trim().min(5).max(1000),
});

type Queryable = Pick<Database, "query"> | Pick<DatabaseClient, "query">;

type PersistedFile = StoredFile & { id: string };

function verificationUploader(config: AppConfig) {
  return multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: config.MAX_UPLOAD_BYTES, files: 2, fields: 10 },
    fileFilter: (_request, file, callback) => {
      if (!allowedDocumentTypes.has(file.mimetype)) return callback(new Error("Tipo de archivo no permitido."));
      callback(null, true);
    },
  });
}

async function persistVerificationFile(
  database: Database,
  storage: PrivateStorage,
  ownerId: string,
  file: Express.Multer.File,
): Promise<PersistedFile> {
  const stored = await storage.put(file.buffer, file.originalname, file.mimetype);
  const id = randomUUID();
  try {
    await database.query(
      `INSERT INTO stored_files
        (id, owner_id, purpose, object_key, original_name, content_type, size_bytes, sha256)
       VALUES ($1, $2, 'VERIFICACION_PROFESIONAL', $3, $4, $5, $6, $7)`,
      [
        id,
        ownerId,
        stored.key,
        stored.originalName,
        stored.contentType,
        stored.sizeBytes,
        createHash("sha256").update(file.buffer).digest("hex"),
      ],
    );
    return { id, ...stored };
  } catch (error) {
    await storage.delete(stored.key).catch(() => undefined);
    throw error;
  }
}

async function verificationReadiness(database: Queryable, professionalId: string) {
  const result = await database.query<{
    approved_document_count: string;
    has_approved_qualification: boolean;
  }>(
    `SELECT
       (SELECT count(*)::text
          FROM (
            SELECT DISTINCT ON (document_type) document_type, status
              FROM professional_verification_documents
             WHERE professional_id = $1
               AND document_type IN ('IDENTIDAD', 'SITUACION_FISCAL')
             ORDER BY document_type, created_at DESC, id DESC
          ) latest
         WHERE latest.status = 'APROBADO') AS approved_document_count,
       EXISTS (
         SELECT 1 FROM professional_specialty_qualifications
          WHERE professional_id = $1 AND verification_status = 'APROBADO'
       ) AS has_approved_qualification`,
    [professionalId],
  );
  const row = result.rows[0];
  return {
    documentsApproved: Number(row?.approved_document_count ?? 0) === 2,
    qualificationApproved: Boolean(row?.has_approved_qualification),
  };
}

async function refreshProfessionalStatus(database: Queryable, professionalId: string) {
  const readiness = await verificationReadiness(database, professionalId);
  const approved = readiness.documentsApproved && readiness.qualificationApproved;
  await database.query(
    `UPDATE users
        SET verification_status = CASE
              WHEN verification_status = 'SUSPENDIDO' THEN 'SUSPENDIDO'
              WHEN $2::boolean THEN 'APROBADO'
              ELSE 'PENDIENTE_REVISION'
            END,
            verification_reason = CASE
              WHEN verification_status = 'SUSPENDIDO' THEN verification_reason
              WHEN $2::boolean THEN 'Verificación técnica y documental completada.'
              ELSE 'Pendiente de completar la verificación técnica y documental obligatoria.'
            END,
            updated_at = now()
      WHERE id = $1 AND role = 'profesional'`,
    [professionalId, approved],
  );
  return { ...readiness, approved };
}

export function professionalVerificationRouter(database: Database, config: AppConfig, storage: PrivateStorage) {
  const router = Router();
  const upload = verificationUploader(config);

  router.post(
    "/professionals/verification-documents",
    requireAuth,
    requireRole("profesional"),
    upload.fields([
      { name: "identity", maxCount: 1 },
      { name: "taxStatus", maxCount: 1 },
    ]),
    async (request, response, next) => {
      const created: PersistedFile[] = [];
      try {
        const files = request.files as Record<string, Express.Multer.File[]> | undefined;
        const identity = files?.identity?.[0];
        const taxStatus = files?.taxStatus?.[0];
        if (!identity || !taxStatus) {
          return response.status(400).json({
            error: "Debes adjuntar el documento de identidad/NIF y la acreditación de situación fiscal o alta profesional.",
          });
        }

        const identityStored = await persistVerificationFile(database, storage, request.user!.id, identity);
        created.push(identityStored);
        const taxStored = await persistVerificationFile(database, storage, request.user!.id, taxStatus);
        created.push(taxStored);

        const documentIds = await withTransaction(database, async (client) => {
          const identityId = randomUUID();
          const taxStatusId = randomUUID();
          await client.query(
            `INSERT INTO professional_verification_documents
              (id, professional_id, file_id, document_type)
             VALUES
              ($1, $3, $4, 'IDENTIDAD'),
              ($2, $3, $5, 'SITUACION_FISCAL')`,
            [identityId, taxStatusId, request.user!.id, identityStored.id, taxStored.id],
          );
          await client.query(
            `UPDATE users
                SET verification_status = CASE
                      WHEN verification_status = 'SUSPENDIDO' THEN 'SUSPENDIDO'
                      ELSE 'PENDIENTE_REVISION'
                    END,
                    verification_reason = CASE
                      WHEN verification_status = 'SUSPENDIDO' THEN verification_reason
                      ELSE 'Documentación profesional enviada y pendiente de revisión.'
                    END,
                    updated_at = now()
              WHERE id = $1`,
            [request.user!.id],
          );
          await audit(client, {
            actorUserId: request.user!.id,
            action: "PROFESSIONAL_VERIFICATION_DOCUMENTS_SUBMITTED",
            entityType: "professional",
            entityId: request.user!.id,
            ip: request.ip,
            metadata: { identityDocumentId: identityId, taxStatusDocumentId: taxStatusId },
          });
          return { identityId, taxStatusId };
        });

        return response.status(201).json({
          success: true,
          status: "PENDIENTE_REVISION",
          documents: documentIds,
        });
      } catch (error) {
        if (created.length) {
          await database.query("DELETE FROM stored_files WHERE id = ANY($1::uuid[])", [created.map((file) => file.id)]).catch(() => undefined);
          await Promise.all(created.map((file) => storage.delete(file.key).catch(() => undefined)));
        }
        next(error);
      }
    },
  );

  router.get(
    "/professionals/verification-documents",
    requireAuth,
    requireRole("profesional"),
    async (request, response, next) => {
      try {
        const documents = await database.query(
          `SELECT DISTINCT ON (d.document_type)
                  d.id, d.document_type, d.status, d.review_reason, d.reviewed_at, d.created_at,
                  f.id AS file_id, f.original_name, f.content_type
             FROM professional_verification_documents d
             JOIN stored_files f ON f.id = d.file_id
            WHERE d.professional_id = $1
            ORDER BY d.document_type, d.created_at DESC, d.id DESC`,
          [request.user!.id],
        );
        const readiness = await verificationReadiness(database, request.user!.id);
        response.json({ documents: documents.rows, readiness });
      } catch (error) { next(error); }
    },
  );

  router.get(
    "/admin/verification-documents",
    requireAuth,
    requireRole("admin"),
    async (_request, response, next) => {
      try {
        const documents = await database.query(
          `SELECT d.id, d.document_type, d.status, d.created_at,
                  f.id AS file_id, f.original_name, f.content_type,
                  u.id AS professional_id, u.name, u.email, u.company_name, u.tax_id
             FROM professional_verification_documents d
             JOIN stored_files f ON f.id = d.file_id
             JOIN users u ON u.id = d.professional_id
            WHERE d.status = 'PENDIENTE'
            ORDER BY d.created_at, d.id`,
        );
        response.json({ documents: documents.rows });
      } catch (error) { next(error); }
    },
  );

  router.post(
    "/admin/verification-documents/:id/decision",
    requireAuth,
    requireRole("admin"),
    async (request, response, next) => {
      try {
        const id = z.string().uuid().safeParse(request.params.id);
        const body = decisionSchema.safeParse(request.body);
        if (!id.success || !body.success) return response.status(400).json({ error: "Decisión no válida." });
        const documentStatus = body.data.decision === "APROBAR" ? "APROBADO" : "RECHAZADO";
        const moderationStatus = body.data.decision === "APROBAR" ? "APROBADO" : "RECHAZADO";

        const result = await withTransaction(database, async (client) => {
          const updated = await client.query<{ professional_id: string; file_id: string; document_type: string }>(
            `UPDATE professional_verification_documents
                SET status = $2, reviewed_at = now(), reviewed_by = $3,
                    review_reason = $4, updated_at = now()
              WHERE id = $1 AND status = 'PENDIENTE'
              RETURNING professional_id, file_id, document_type`,
            [id.data, documentStatus, request.user!.id, body.data.reason],
          );
          const row = updated.rows[0];
          if (!row) return null;
          await client.query("UPDATE stored_files SET moderation_status = $2 WHERE id = $1", [row.file_id, moderationStatus]);
          const readiness = await refreshProfessionalStatus(client, row.professional_id);
          await audit(client, {
            actorUserId: request.user!.id,
            action: `PROFESSIONAL_DOCUMENT_${documentStatus}`,
            entityType: "professional_verification_document",
            entityId: id.data,
            ip: request.ip,
            metadata: { reason: body.data.reason, documentType: row.document_type, professionalId: row.professional_id },
          });
          return readiness;
        });

        if (!result) return response.status(404).json({ error: "Documento pendiente no encontrado." });
        response.json({ success: true, status: documentStatus, professionalVerification: result });
      } catch (error) { next(error); }
    },
  );

  return router;
}