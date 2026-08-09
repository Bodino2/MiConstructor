import { databaseError, getD1 } from "@/lib/server/d1";
import { requireIdentity } from "@/lib/server/identity";
import { cleanText, toCents } from "@/lib/validation";

type MilestonePayload = {
  descripcion?: unknown;
  monto?: unknown;
};

type ProjectPayload = {
  titulo?: unknown;
  descripcion?: unknown;
  categoria?: unknown;
  ubicacion?: unknown;
  presupuestoTotal?: unknown;
  hitos?: unknown;
};

async function getProfile(email: string) {
  return getD1()
    .prepare("SELECT email, role FROM users WHERE email = ?1")
    .bind(email)
    .first<{ email: string; role: string }>();
}

export async function GET(request: Request) {
  const identity = requireIdentity(request);
  if (identity instanceof Response) return identity;

  try {
    const profile = await getProfile(identity);
    if (!profile) {
      return Response.json({ error: "Completa tu perfil primero." }, { status: 403 });
    }

    const db = getD1();
    const filter =
      profile.role === "cliente"
        ? "WHERE p.owner_email = ?1"
        : "WHERE p.status IN ('PUBLICADO', 'EN_CURSO')";
    const statement = db.prepare(
      `SELECT p.id, p.owner_email, p.title, p.description, p.category,
              p.location, p.budget_cents, p.status,
              p.assigned_professional_email, p.created_at,
              COUNT(m.id) AS milestone_count,
              SUM(CASE WHEN m.status = 'LIBERADO' THEN 1 ELSE 0 END) AS completed_count,
              COALESCE(SUM(CASE WHEN m.status = 'LIBERADO' THEN m.amount_cents ELSE 0 END), 0) AS released_cents
         FROM projects p
         LEFT JOIN milestones m ON m.project_id = p.id
         ${filter}
         GROUP BY p.id
         ORDER BY p.created_at DESC`,
    );
    const result =
      profile.role === "cliente"
        ? await statement.bind(identity).all<Record<string, unknown>>()
        : await statement.all<Record<string, unknown>>();

    return Response.json({
      success: true,
      total: result.results.length,
      data: result.results.map((row) => ({
        id: row.id,
        titulo: row.title,
        descripcion: row.description,
        categoria: row.category,
        ubicacion: row.location,
        presupuestoTotal: Number(row.budget_cents) / 100,
        estado: row.status,
        profesional: row.assigned_professional_email,
        hitos: Number(row.milestone_count),
        hitosCompletados: Number(row.completed_count),
        importeLiberado: Number(row.released_cents) / 100,
        fechaCreacion: row.created_at,
      })),
    });
  } catch (error) {
    return Response.json({ error: databaseError(error) }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const identity = requireIdentity(request);
  if (identity instanceof Response) return identity;

  try {
    const profile = await getProfile(identity);
    if (!profile || profile.role !== "cliente") {
      return Response.json(
        { error: "Solo un perfil de cliente puede publicar proyectos." },
        { status: 403 },
      );
    }

    const payload = (await request.json()) as ProjectPayload;
    const titulo = cleanText(payload.titulo, 140);
    const descripcion = cleanText(payload.descripcion, 1500);
    const categoria = cleanText(payload.categoria, 60);
    const ubicacion = cleanText(payload.ubicacion, 120);
    const budgetCents = toCents(payload.presupuestoTotal);
    const rawMilestones = Array.isArray(payload.hitos)
      ? (payload.hitos as MilestonePayload[])
      : [];

    if (!titulo || !descripcion || !categoria || !ubicacion || budgetCents < 100_000) {
      return Response.json(
        { error: "Título, descripción, categoría, ubicación y un presupuesto mínimo de 1.000 € son obligatorios." },
        { status: 400 },
      );
    }
    if (rawMilestones.length < 2 || rawMilestones.length > 8) {
      return Response.json(
        { error: "El proyecto debe tener entre 2 y 8 hitos." },
        { status: 400 },
      );
    }

    const hitos = rawMilestones.map((item, index) => ({
      position: index + 1,
      title: cleanText(item.descripcion, 140),
      amountCents: toCents(item.monto),
    }));
    if (hitos.some((item) => !item.title || item.amountCents <= 0)) {
      return Response.json(
        { error: "Cada hito necesita descripción e importe positivo." },
        { status: 400 },
      );
    }
    const milestoneTotal = hitos.reduce((sum, item) => sum + item.amountCents, 0);
    if (milestoneTotal !== budgetCents) {
      return Response.json(
        { error: "La suma de los hitos debe coincidir exactamente con el presupuesto total." },
        { status: 400 },
      );
    }

    const db = getD1();
    const now = new Date().toISOString();
    const inserted = await db
      .prepare(
        `INSERT INTO projects
          (owner_email, title, description, category, location,
           budget_cents, status, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, 'PUBLICADO', ?7, ?7)`,
      )
      .bind(identity, titulo, descripcion, categoria, ubicacion, budgetCents, now)
      .run();
    const projectId = Number(inserted.meta.last_row_id);

    await db.batch([
      ...hitos.map((hito) =>
        db
          .prepare(
            `INSERT INTO milestones
              (project_id, position, title, description, amount_cents,
               status, created_at, updated_at)
             VALUES (?1, ?2, ?3, '', ?4, 'RETENIDO', ?5, ?5)`,
          )
          .bind(projectId, hito.position, hito.title, hito.amountCents, now),
      ),
      db
        .prepare(
          `INSERT INTO events (project_id, actor_email, type, message, created_at)
           VALUES (?1, ?2, 'PROYECTO_CREADO', ?3, ?4)`,
        )
        .bind(projectId, identity, `Proyecto publicado con ${hitos.length} hitos.`, now),
    ]);

    return Response.json(
      {
        success: true,
        mensaje: "Proyecto publicado con hitos protegidos.",
        data: {
          id: projectId,
          titulo,
          descripcion,
          categoria,
          ubicacion,
          presupuestoTotal: budgetCents / 100,
          estado: "PUBLICADO",
          hitos: hitos.map((hito) => ({
            idHito: hito.position,
            descripcion: hito.title,
            monto: hito.amountCents / 100,
            estado: "RETENIDO",
          })),
          fechaCreacion: now,
        },
      },
      { status: 201 },
    );
  } catch (error) {
    return Response.json({ error: databaseError(error) }, { status: 500 });
  }
}
