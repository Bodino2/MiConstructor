import { databaseError, getD1, getR2 } from "@/lib/server/d1";
import { normalizeEmail, requireIdentity } from "@/lib/server/identity";
import { safeObjectExtension, validateUpload } from "@/lib/media-validation";
import { cleanText, isValidEmail } from "@/lib/validation";

export async function GET(request: Request) {
  try {
    const email = normalizeEmail(new URL(request.url).searchParams.get("profesional"));
    if (!isValidEmail(email)) {
      return Response.json({ error: "Profesional no válido." }, { status: 400 });
    }
    const db = getD1();
    const projects = await db
      .prepare(
        `SELECT id, title, description, category, location, completion_year
           FROM professional_portfolio_projects
          WHERE professional_email = ?1 AND status = 'PUBLICADO'
          ORDER BY completion_year DESC, id DESC`,
      )
      .bind(email)
      .all<Record<string, unknown>>();
    const data = [];
    for (const project of projects.results) {
      const images = await db
        .prepare(
          `SELECT phase, object_key, alt_text
             FROM professional_portfolio_images
            WHERE portfolio_project_id = ?1 ORDER BY sort_order, id`,
        )
        .bind(project.id)
        .all<Record<string, unknown>>();
      data.push({
        ...project,
        images: images.results.map((item) => ({
          fase: item.phase,
          alt: item.alt_text,
          url: `/api/v1/media?key=${encodeURIComponent(String(item.object_key))}`,
        })),
      });
    }
    return Response.json({ success: true, data });
  } catch (error) {
    return Response.json({ error: databaseError(error) }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const identity = requireIdentity(request);
  if (identity instanceof Response) return identity;

  const uploadedKeys = [];
  try {
    const form = await request.formData();
    const before = form.get("antes");
    const after = form.get("despues");
    const beforeValidation = validateUpload(before, "image");
    const afterValidation = validateUpload(after, "image");
    if (!beforeValidation.valid || !afterValidation.valid) {
      return Response.json(
        { error: beforeValidation.error ?? afterValidation.error },
        { status: 400 },
      );
    }

    const title = cleanText(form.get("titulo"), 120);
    const description = cleanText(form.get("descripcion"), 1_000);
    const category = cleanText(form.get("categoria"), 80);
    const location = cleanText(form.get("localidad"), 100);
    const completionYear = Number(form.get("ano"));
    if (!title || !description || !category || !location || completionYear < 1990 || completionYear > new Date().getFullYear()) {
      return Response.json({ error: "Completa los datos de la obra realizada." }, { status: 400 });
    }

    const db = getD1();
    const professional = await db
      .prepare("SELECT role, verification_status FROM users WHERE email = ?1")
      .bind(identity)
      .first<{ role: string; verification_status: string }>();
    if (!professional || professional.role !== "profesional" || professional.verification_status !== "APROBADO") {
      return Response.json({ error: "Solo un profesional aprobado puede publicar trabajos." }, { status: 403 });
    }

    const now = new Date().toISOString();
    const created = await db
      .prepare(
        `INSERT INTO professional_portfolio_projects
          (professional_email, title, description, category, location,
           completion_year, status, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, 'PENDIENTE', ?7, ?7)`,
      )
      .bind(identity, title, description, category, location, completionYear, now)
      .run();
    const portfolioId = Number(created.meta.last_row_id);
    const bucket = getR2();

    for (const [phase, file, sortOrder] of [["ANTES", before, 0], ["DESPUES", after, 1]]) {
      const key = `portfolio/${identity}/${portfolioId}/${crypto.randomUUID()}.${safeObjectExtension(file.type)}`;
      await bucket.put(key, file.stream(), {
        httpMetadata: { contentType: file.type },
        customMetadata: { owner: identity, phase },
      });
      uploadedKeys.push(key);
      await db
        .prepare(
          `INSERT INTO professional_portfolio_images
            (portfolio_project_id, professional_email, phase, object_key,
             content_type, size_bytes, alt_text, sort_order, created_at)
           VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)`,
        )
        .bind(
          portfolioId,
          identity,
          phase,
          key,
          file.type,
          file.size,
          `${phase === "ANTES" ? "Antes" : "Después"}: ${title}`,
          sortOrder,
          now,
        )
        .run();
    }

    return Response.json(
      { success: true, data: { portfolioId, estado: "PENDIENTE_MODERACION" } },
      { status: 201 },
    );
  } catch (error) {
    const bucket = getR2();
    await Promise.all(uploadedKeys.map((key) => bucket.delete(key)));
    return Response.json({ error: databaseError(error) }, { status: 500 });
  }
}
