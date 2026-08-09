import { databaseError, getD1, getR2 } from "@/lib/server/d1";
import { requireIdentity } from "@/lib/server/identity";
import { safeObjectExtension, validateUpload } from "@/lib/media-validation";
import { cleanText } from "@/lib/validation";

export async function POST(request: Request) {
  const identity = requireIdentity(request);
  if (identity instanceof Response) return identity;
  let objectKey = "";
  try {
    const form = await request.formData();
    const file = form.get("poliza");
    const validation = validateUpload(file, "pdf");
    const insurer = cleanText(form.get("aseguradora"), 120);
    const policyNumber = cleanText(form.get("numeroPoliza"), 80);
    const coverageCents = Math.round(Number(form.get("cobertura")) * 100);
    const validFrom = String(form.get("validaDesde") ?? "");
    const validUntil = String(form.get("validaHasta") ?? "");
    if (!validation.valid || !insurer || policyNumber.length < 4 || coverageCents < 1 || !/^\d{4}-\d{2}-\d{2}$/.test(validFrom) || !/^\d{4}-\d{2}-\d{2}$/.test(validUntil)) {
      return Response.json({ error: validation.error ?? "Completa los datos de la póliza RC." }, { status: 400 });
    }
    const db = getD1();
    const profile = await db
      .prepare("SELECT role FROM users WHERE email = ?1")
      .bind(identity)
      .first<{ role: string }>();
    if (!profile || profile.role !== "profesional") return Response.json({ error: "Solo para profesionales." }, { status: 403 });
    objectKey = `insurance/${identity}/${crypto.randomUUID()}.${safeObjectExtension(file.type)}`;
    await getR2().put(objectKey, file.stream(), { httpMetadata: { contentType: "application/pdf" }, customMetadata: { owner: identity } });
    const now = new Date().toISOString();
    const masked = `••••${policyNumber.slice(-4)}`;
    const created = await db
      .prepare(
        `INSERT INTO professional_insurance_policies
          (professional_email, insurer, policy_number_masked, coverage_cents,
           valid_from, valid_until, object_key, verification_status,
           created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, 'PENDIENTE', ?8, ?8)`,
      )
      .bind(identity, insurer, masked, coverageCents, validFrom, validUntil, objectKey, now)
      .run();
    return Response.json({ success: true, data: { policyId: created.meta.last_row_id, estado: "PENDIENTE_VERIFICACION", badge: false } }, { status: 201 });
  } catch (error) {
    if (objectKey) await getR2().delete(objectKey);
    return Response.json({ error: databaseError(error) }, { status: 500 });
  }
}
