import { generateWorkContractPdf, WORK_CONTRACT_TEMPLATE_VERSION } from "@/lib/contract-pdf";
import { databaseError, getD1, getR2 } from "@/lib/server/d1";
import { requireIdentity } from "@/lib/server/identity";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const identity = requireIdentity(request);
  if (identity instanceof Response) return identity;

  try {
    const projectId = Number((await params).id);
    const payload = (await request.json()) as { presupuestoId?: unknown };
    const quoteId = Number(payload.presupuestoId);
    if (!Number.isInteger(projectId) || projectId < 1 || !Number.isInteger(quoteId) || quoteId < 1) {
      return Response.json({ error: "Proyecto y presupuesto válidos son obligatorios." }, { status: 400 });
    }
    const db = getD1();
    const row = await db
      .prepare(
        `SELECT p.title, p.category, p.location, p.owner_email, p.status,
                q.professional_email, q.total_cents, q.status AS quote_status,
                c.name AS client_name, c.tax_id AS client_tax_id,
                pro.name AS professional_name, pro.tax_id AS professional_tax_id,
                pro.company_name AS professional_company
           FROM projects p
           JOIN structured_quotes q ON q.project_id = p.id AND q.id = ?2
           JOIN users c ON c.email = p.owner_email
           JOIN users pro ON pro.email = q.professional_email
          WHERE p.id = ?1`,
      )
      .bind(projectId, quoteId)
      .first<Record<string, unknown>>();
    if (!row || row.owner_email !== identity) return Response.json({ error: "Proyecto no encontrado." }, { status: 404 });
    if (row.status !== "PUBLICADO" || row.quote_status !== "ENVIADO") {
      return Response.json({ error: "El proyecto o presupuesto ya no puede aceptarse." }, { status: 409 });
    }
    const items = await db
      .prepare(
        `SELECT category, description, total_cents
           FROM structured_quote_items WHERE quote_id = ?1 ORDER BY sort_order, id`,
      )
      .bind(quoteId)
      .all<Record<string, unknown>>();
    const reference = `MC-${String(projectId).padStart(6, "0")}`;
    const pdf = await generateWorkContractPdf({
      reference,
      client: { name: row.client_name, taxId: row.client_tax_id, email: row.owner_email },
      professional: { name: row.professional_name, taxId: row.professional_tax_id, email: row.professional_email, companyName: row.professional_company },
      project: { title: row.title, category: row.category, location: row.location },
      quote: { totalCents: Number(row.total_cents) },
      items: items.results.map((item) => ({ category: item.category, description: item.description, totalCents: Number(item.total_cents) })),
    });
    const digest = await crypto.subtle.digest("SHA-256", pdf);
    const sha256 = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
    const objectKey = `contracts/${projectId}/${crypto.randomUUID()}.pdf`;
    await getR2().put(objectKey, pdf, {
      httpMetadata: { contentType: "application/pdf" },
      customMetadata: { projectId: String(projectId), sha256 },
    });
    const now = new Date().toISOString();
    const created = await db
      .prepare(
        `INSERT INTO work_contracts
          (project_id, quote_id, client_email, professional_email,
           template_version, object_key, document_sha256, status,
           client_accepted_at, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, 'PENDIENTE_FIRMA', ?8, ?8, ?8)`,
      )
      .bind(projectId, quoteId, identity, row.professional_email, WORK_CONTRACT_TEMPLATE_VERSION, objectKey, sha256, now)
      .run();
    const contractId = Number(created.meta.last_row_id);
    await db.batch([
      db.prepare("UPDATE structured_quotes SET status = 'ACEPTADO', accepted_at = ?1, updated_at = ?1 WHERE id = ?2").bind(now, quoteId),
      db.prepare("UPDATE projects SET status = 'EN_CURSO', assigned_professional_email = ?1, updated_at = ?2 WHERE id = ?3").bind(row.professional_email, now, projectId),
    ]);
    return Response.json({ success: true, data: { contractId, estado: "PENDIENTE_FIRMA", pdf: `/api/v1/contratos/${contractId}/pdf`, sha256 } }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message.includes("UNIQUE constraint failed")) return Response.json({ error: "El proyecto ya tiene contrato." }, { status: 409 });
    return Response.json({ error: databaseError(error) }, { status: 500 });
  }
}
