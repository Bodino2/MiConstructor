import { databaseError, getD1, getR2 } from "@/lib/server/d1";
import { requireIdentity } from "@/lib/server/identity";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const identity = requireIdentity(request);
  if (identity instanceof Response) return identity;
  try {
    const contractId = Number((await params).id);
    const contract = await getD1()
      .prepare("SELECT project_id, client_email, professional_email, object_key FROM work_contracts WHERE id = ?1")
      .bind(contractId)
      .first<{ project_id: number; client_email: string; professional_email: string; object_key: string }>();
    if (!contract || ![contract.client_email, contract.professional_email].includes(identity)) {
      return Response.json({ error: "Contrato no encontrado." }, { status: 404 });
    }
    const object = await getR2().get(contract.object_key);
    if (!object) return Response.json({ error: "PDF no encontrado." }, { status: 404 });
    return new Response(object.body, {
      headers: {
        "content-type": "application/pdf",
        "content-disposition": `inline; filename="contrato-miconstructor-${contract.project_id}.pdf"`,
        "cache-control": "private, no-store",
        "x-content-type-options": "nosniff",
      },
    });
  } catch (error) {
    return Response.json({ error: databaseError(error) }, { status: 500 });
  }
}
