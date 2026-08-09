import { databaseError, getD1, getR2 } from "@/lib/server/d1";
import { requireIdentity } from "@/lib/server/identity";
import { safeObjectExtension, validateUpload } from "@/lib/media-validation";
import { cleanText } from "@/lib/validation";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const identity = requireIdentity(request);
  if (identity instanceof Response) return identity;
  let objectKey = "";
  try {
    const milestoneId = Number((await params).id);
    const form = await request.formData();
    const file = form.get("archivo");
    const validation = validateUpload(file, "evidence");
    const description = cleanText(form.get("descripcion"), 800);
    const capturedAt = String(form.get("capturadoEn") ?? "").slice(0, 40) || null;
    if (!Number.isInteger(milestoneId) || milestoneId < 1 || !validation.valid || description.length < 10) {
      return Response.json({ error: validation.error ?? "Archivo y descripción son obligatorios." }, { status: 400 });
    }
    const db = getD1();
    const milestone = await db
      .prepare(
        `SELECT m.project_id, m.title, p.assigned_professional_email
           FROM milestones m JOIN projects p ON p.id = m.project_id
          WHERE m.id = ?1`,
      )
      .bind(milestoneId)
      .first<{ project_id: number; title: string; assigned_professional_email: string | null }>();
    if (!milestone || milestone.assigned_professional_email !== identity) {
      return Response.json({ error: "Solo el profesional asignado puede añadir evidencias." }, { status: 403 });
    }
    objectKey = `projects/${milestone.project_id}/milestones/${milestoneId}/${crypto.randomUUID()}.${safeObjectExtension(file.type)}`;
    await getR2().put(objectKey, file.stream(), {
      httpMetadata: { contentType: file.type },
      customMetadata: { projectId: String(milestone.project_id), milestoneId: String(milestoneId), owner: identity },
    });
    const now = new Date().toISOString();
    const created = await db
      .prepare(
        `INSERT INTO milestone_evidence
          (milestone_id, project_id, professional_email, media_type, object_key,
           content_type, size_bytes, description, captured_at, review_status, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, 'PENDIENTE', ?10)`,
      )
      .bind(milestoneId, milestone.project_id, identity, file.type.startsWith("video/") ? "VIDEO" : "FOTO", objectKey, file.type, file.size, description, capturedAt, now)
      .run();
    await db
      .prepare(
        `INSERT INTO property_passport_entries
          (project_id, milestone_id, author_email, category, title, description,
           object_key, created_at)
         VALUES (?1, ?2, ?3, 'INSTALACIONES', ?4, ?5, ?6, ?7)`,
      )
      .bind(milestone.project_id, milestoneId, identity, milestone.title, description, objectKey, now)
      .run();
    return Response.json({ success: true, data: { evidenceId: created.meta.last_row_id, estado: "PENDIENTE_REVISION", añadidoAlPasaporte: true } }, { status: 201 });
  } catch (error) {
    if (objectKey) await getR2().delete(objectKey);
    return Response.json({ error: databaseError(error) }, { status: 500 });
  }
}
