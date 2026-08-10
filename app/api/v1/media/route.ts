import { databaseError, getD1, getR2 } from "@/lib/server/d1";

export async function GET(request: Request) {
  try {
    const key = new URL(request.url).searchParams.get("key") ?? "";
    if (!key.startsWith("portfolio/") || key.includes("..")) {
      return Response.json({ error: "Archivo no válido." }, { status: 400 });
    }
    const allowed = await getD1()
      .prepare(
        `SELECT i.content_type
           FROM professional_portfolio_images i
           JOIN professional_portfolio_projects p ON p.id = i.portfolio_project_id
          WHERE i.object_key = ?1 AND p.status = 'PUBLICADO'`,
      )
      .bind(key)
      .first<{ content_type: string }>();
    if (!allowed) return Response.json({ error: "Archivo no encontrado." }, { status: 404 });

    const object = await getR2().get(key);
    if (!object) return Response.json({ error: "Archivo no encontrado." }, { status: 404 });
    return new Response(object.body, {
      headers: {
        "content-type": allowed.content_type,
        "cache-control": "public, max-age=3600",
        "x-content-type-options": "nosniff",
      },
    });
  } catch (error) {
    return Response.json({ error: databaseError(error) }, { status: 500 });
  }
}
