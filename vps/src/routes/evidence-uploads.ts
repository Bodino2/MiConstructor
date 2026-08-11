import { createHash, randomUUID } from "node:crypto";
import { Router } from "express";
import multer from "multer";
import type { AppConfig } from "../config.js";
import type { Database } from "../db.js";
import { audit } from "../services/audit.js";
import { requireAuth, requireRole } from "../services/auth.js";
import type { PrivateStorage } from "../services/storage.js";

const allowedEvidenceTypes = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "video/mp4",
  "video/webm",
  "application/pdf",
]);

export function evidenceUploadsRouter(database: Database, config: AppConfig, storage: PrivateStorage) {
  const router = Router();
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: config.MAX_UPLOAD_BYTES, files: 1, fields: 5 },
    fileFilter: (_request, file, callback) => {
      if (!allowedEvidenceTypes.has(file.mimetype)) return callback(new Error("Tipo de archivo no permitido."));
      callback(null, true);
    },
  });

  router.post(
    "/milestones/:id/evidence-file",
    requireAuth,
    requireRole("profesional"),
    upload.single("file"),
    async (request, response, next) => {
      let storedKey: string | null = null;
      let storedFileId: string | null = null;
      try {
        if (!/^[0-9a-f-]{36}$/i.test(request.params.id)) {
          return response.status(400).json({ error: "Hito no válido." });
        }
        if (!request.file) return response.status(400).json({ error: "Debes adjuntar una evidencia." });

        const milestone = await database.query<{ assigned_professional_id: string | null; status: string; project_id: string }>(
          `SELECT p.assigned_professional_id, m.status, m.project_id
             FROM milestones m
             JOIN projects p ON p.id = m.project_id
            WHERE m.id = $1`,
          [request.params.id],
        );
        const row = milestone.rows[0];
        if (!row || row.assigned_professional_id !== request.user!.id) {
          return response.status(404).json({ error: "Hito no encontrado." });
        }
        if (!["PREVISTO", "RETENIDO", "EN_REVISION"].includes(row.status)) {
          return response.status(409).json({ error: "El hito no admite nuevas evidencias." });
        }

        const stored = await storage.put(request.file.buffer, request.file.originalname, request.file.mimetype);
        storedKey = stored.key;
        storedFileId = randomUUID();
        await database.query(
          `INSERT INTO stored_files
            (id, owner_id, purpose, object_key, original_name, content_type, size_bytes, sha256)
           VALUES ($1, $2, 'HITO_EVIDENCIA', $3, $4, $5, $6, $7)`,
          [
            storedFileId,
            request.user!.id,
            stored.key,
            stored.originalName,
            stored.contentType,
            stored.sizeBytes,
            createHash("sha256").update(request.file.buffer).digest("hex"),
          ],
        );
        await audit(database, {
          actorUserId: request.user!.id,
          action: "MILESTONE_EVIDENCE_FILE_UPLOADED",
          entityType: "milestone",
          entityId: request.params.id,
          ip: request.ip,
          metadata: { fileId: storedFileId, projectId: row.project_id, contentType: stored.contentType },
        });
        response.status(201).json({ success: true, fileId: storedFileId });
      } catch (error) {
        if (storedFileId) {
          await database.query("DELETE FROM stored_files WHERE id = $1", [storedFileId]).catch(() => undefined);
        }
        if (storedKey) await storage.delete(storedKey).catch(() => undefined);
        next(error);
      }
    },
  );

  return router;
}
