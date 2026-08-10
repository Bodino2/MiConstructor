import { createHash, randomUUID } from "node:crypto";
import { Router } from "express";
import multer from "multer";
import { z } from "zod";
import type { AppConfig } from "../config.js";
import type { Database } from "../db.js";
import { withTransaction } from "../db.js";
import { audit } from "../services/audit.js";
import { requireAuth, requireRole } from "../services/auth.js";
import type { PrivateStorage, StoredFile } from "../services/storage.js";

const allowedImageTypes = new Set(["image/jpeg", "image/png", "image/webp"]);
const allowedEvidenceTypes = new Set([...allowedImageTypes, "video/mp4", "video/webm", "application/pdf"]);

function uploader(config: AppConfig) {
  return multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: config.MAX_UPLOAD_BYTES, files: 4, fields: 20 },
    fileFilter: (_request, file, callback) => {
      if (!allowedEvidenceTypes.has(file.mimetype)) return callback(new Error("Tipo de archivo no permitido."));
      callback(null, true);
    },
  });
}

async function persistFile(
  database: Database,
  storage: PrivateStorage,
  ownerId: string,
  purpose: string,
  file: Express.Multer.File,
) {
  const stored = await storage.put(file.buffer, file.originalname, file.mimetype);
  const id = randomUUID();
  try {
    await database.query(
      `INSERT INTO stored_files
        (id, owner_id, purpose, object_key, original_name, content_type, size_bytes, sha256)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [id, ownerId, purpose, stored.key, stored.originalName, stored.contentType, stored.sizeBytes, createHash("sha256").update(file.buffer).digest("hex")],
    );
    return { id, ...stored };
  } catch (error) {
    await storage.delete(stored.key);
    throw error;
  }
}

export function uploadsRouter(database: Database, config: AppConfig, storage: PrivateStorage) {
  const router = Router();
  const upload = uploader(config);

  router.post(
    "/professionals/portfolio",
    requireAuth,
    requireRole("profesional"),
    upload.fields([{ name: "before", maxCount: 2 }, { name: "after", maxCount: 2 }]),
    async (request, response, next) => {
      const created: Array<StoredFile & { id: string }> = [];
      try {
        const parsed = z.object({
          title: z.string().trim().min(5).max(160),
          description: z.string().trim().min(20).max(3000),
          category: z.string().trim().min(2).max(80),
          location: z.string().trim().min(2).max(160),
          completionYear: z.coerce.number().int().min(1950).max(new Date().getFullYear()).optional(),
          publicationConsent: z.enum(["true"]),
        }).safeParse(request.body);
        if (!parsed.success) return response.status(400).json({ error: parsed.error.issues[0]?.message });
        const files = request.files as Record<string, Express.Multer.File[]> | undefined;
        const before = files?.before ?? [];
        const after = files?.after ?? [];
        if (!before.length || !after.length || [...before, ...after].some((file) => !allowedImageTypes.has(file.mimetype))) {
          return response.status(400).json({ error: "Debes subir al menos una imagen antes y una después." });
        }
        const portfolioId = randomUUID();
        const storedPairs: Array<{ file: Awaited<ReturnType<typeof persistFile>>; phase: "ANTES" | "DESPUES" }> = [];
        for (const [phase, list] of [["ANTES", before], ["DESPUES", after]] as const) {
          for (const file of list) {
            const stored = await persistFile(database, storage, request.user!.id, `PORTFOLIO_${phase}`, file);
            created.push(stored);
            storedPairs.push({ file: stored, phase });
          }
        }
        await withTransaction(database, async (client) => {
          await client.query(
            `INSERT INTO portfolio_projects
              (id, professional_id, title, description, category, location, completion_year)
             VALUES ($1, $2, $3, $4, $5, $6, $7)`,
            [portfolioId, request.user!.id, parsed.data.title, parsed.data.description, parsed.data.category, parsed.data.location, parsed.data.completionYear ?? null],
          );
          for (const [index, pair] of storedPairs.entries()) {
            await client.query(
              "INSERT INTO portfolio_files (portfolio_id, file_id, phase, sort_order) VALUES ($1, $2, $3, $4)",
              [portfolioId, pair.file.id, pair.phase, index],
            );
          }
          await audit(client, { actorUserId: request.user!.id, action: "PORTFOLIO_SUBMITTED", entityType: "portfolio", entityId: portfolioId, ip: request.ip });
        });
        response.status(201).json({ success: true, portfolioId, status: "PENDIENTE" });
      } catch (error) {
        await Promise.all(created.map((file) => storage.delete(file.key).catch(() => undefined)));
        if (created.length) await database.query("DELETE FROM stored_files WHERE id = ANY($1::uuid[])", [created.map((file) => file.id)]).catch(() => undefined);
        next(error);
      }
    },
  );

  router.post(
    "/professionals/insurance",
    requireAuth,
    requireRole("profesional"),
    upload.single("policy"),
    async (request, response, next) => {
      try {
        const parsed = z.object({
          insurer: z.string().trim().min(2).max(120),
          policyNumberLast4: z.string().trim().regex(/^[A-Za-z0-9]{4}$/),
          coverageCents: z.coerce.number().int().positive(),
          validFrom: z.iso.date(),
          validUntil: z.iso.date(),
        }).safeParse(request.body);
        if (!parsed.success || !request.file || request.file.mimetype !== "application/pdf") {
          return response.status(400).json({ error: parsed.success ? "La póliza debe ser un PDF." : parsed.error.issues[0]?.message });
        }
        if (parsed.data.validUntil < parsed.data.validFrom) return response.status(400).json({ error: "La fecha final no puede ser anterior a la inicial." });
        const stored = await persistFile(database, storage, request.user!.id, "SEGURO_RC", request.file);
        const id = randomUUID();
        try {
          await database.query(
            `INSERT INTO insurance_policies
              (id, professional_id, file_id, insurer, policy_number_masked, coverage_cents, valid_from, valid_until)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
            [id, request.user!.id, stored.id, parsed.data.insurer, `••••${parsed.data.policyNumberLast4.toUpperCase()}`, parsed.data.coverageCents, parsed.data.validFrom, parsed.data.validUntil],
          );
        } catch (error) {
          await database.query("DELETE FROM stored_files WHERE id = $1", [stored.id]).catch(() => undefined);
          await storage.delete(stored.key).catch(() => undefined);
          throw error;
        }
        response.status(201).json({ success: true, policyId: id, status: "PENDIENTE" });
      } catch (error) { next(error); }
    },
  );

  router.get("/files/:id", requireAuth, async (request, response, next) => {
    try {
      const fileId = z.string().uuid().safeParse(request.params.id);
      if (!fileId.success) return response.status(404).end();
      const file = await database.query<{
        owner_id: string;
        purpose: string;
        object_key: string;
        original_name: string;
        content_type: string;
        size_bytes: string;
        moderation_status: string;
        portfolio_status: string | null;
      }>(
        `SELECT f.owner_id, f.purpose, f.object_key, f.original_name, f.content_type,
                f.size_bytes::text, f.moderation_status, pp.status AS portfolio_status
           FROM stored_files f
           LEFT JOIN portfolio_files pf ON pf.file_id = f.id
           LEFT JOIN portfolio_projects pp ON pp.id = pf.portfolio_id
          WHERE f.id = $1`,
        [fileId.data],
      );
      const row = file.rows[0];
      if (!row) return response.status(404).end();
      const publicPortfolio = row.purpose.startsWith("PORTFOLIO_") && row.moderation_status === "APROBADO" && row.portfolio_status === "PUBLICADO";
      if (row.owner_id !== request.user!.id && request.user!.role !== "admin" && !publicPortfolio) return response.status(404).end();
      response.setHeader("Content-Type", row.content_type);
      response.setHeader("Content-Length", row.size_bytes);
      response.setHeader("Content-Disposition", `${publicPortfolio ? "inline" : "attachment"}; filename*=UTF-8''${encodeURIComponent(row.original_name)}`);
      response.setHeader("Cache-Control", publicPortfolio ? "public, max-age=3600" : "private, no-store");
      storage.stream(row.object_key).on("error", next).pipe(response);
    } catch (error) { next(error); }
  });

  return router;
}
