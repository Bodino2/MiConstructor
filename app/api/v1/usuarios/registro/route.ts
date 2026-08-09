import { databaseError, getD1 } from "@/lib/server/d1";
import { getIdentityEmail, normalizeEmail } from "@/lib/server/identity";
import {
  cleanText,
  isValidEmail,
  isValidSpanishTaxId,
} from "@/lib/validation";

type RegistrationPayload = {
  nombre?: unknown;
  email?: unknown;
  tipo?: unknown;
  cifDni?: unknown;
  empresa?: unknown;
  aceptaRGPD?: unknown;
};

function publicUser(row: Record<string, unknown>) {
  const taxId = String(row.tax_id ?? "");
  return {
    id: row.id,
    nombre: row.name,
    email: row.email,
    tipo: row.role,
    empresa: row.company_name,
    cifDniEnmascarado: taxId ? `••••${taxId.slice(-4)}` : "",
    fechaRegistro: row.created_at,
    rgpdAceptadoEn: row.privacy_accepted_at,
  };
}

export async function GET(request: Request) {
  const email = getIdentityEmail(request);
  if (!email) {
    return Response.json({ error: "Debes iniciar sesión." }, { status: 401 });
  }

  try {
    const row = await getD1()
      .prepare(
        `SELECT id, email, name, role, tax_id, company_name,
                privacy_accepted_at, created_at
           FROM users
          WHERE email = ?1`,
      )
      .bind(email)
      .first<Record<string, unknown>>();

    if (!row) {
      return Response.json({ error: "Perfil no registrado." }, { status: 404 });
    }

    return Response.json({ success: true, data: publicUser(row) });
  } catch (error) {
    return Response.json({ error: databaseError(error) }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const payload = (await request.json()) as RegistrationPayload;
    const nombre = cleanText(payload.nombre, 100);
    const suppliedEmail = normalizeEmail(payload.email);
    const identityEmail = getIdentityEmail(request);
    const email = identityEmail || suppliedEmail;
    const tipo = cleanText(payload.tipo, 20);
    const cifDni = cleanText(payload.cifDni, 20)
      .toUpperCase()
      .replace(/[\s-]/g, "");
    const empresa = cleanText(payload.empresa, 120);

    if (!nombre || !email || !tipo || !cifDni) {
      return Response.json(
        { error: "Nombre, email, tipo y NIF/CIF son obligatorios." },
        { status: 400 },
      );
    }
    if (identityEmail && suppliedEmail && identityEmail !== suppliedEmail) {
      return Response.json(
        { error: "El email debe coincidir con la sesión iniciada." },
        { status: 400 },
      );
    }
    if (!isValidEmail(email)) {
      return Response.json(
        { error: "El formato del email no es válido." },
        { status: 400 },
      );
    }
    if (payload.aceptaRGPD !== true) {
      return Response.json(
        { error: "Debes aceptar la política de privacidad (RGPD)." },
        { status: 400 },
      );
    }
    if (!["cliente", "profesional"].includes(tipo)) {
      return Response.json(
        { error: 'El tipo debe ser "cliente" o "profesional".' },
        { status: 400 },
      );
    }
    if (!isValidSpanishTaxId(cifDni)) {
      return Response.json(
        { error: "El NIF, NIE o CIF español no es válido." },
        { status: 400 },
      );
    }
    if (tipo === "profesional" && !empresa) {
      return Response.json(
        { error: "La razón social es obligatoria para profesionales." },
        { status: 400 },
      );
    }

    const db = getD1();
    const existing = await db
      .prepare("SELECT id FROM users WHERE email = ?1 OR tax_id = ?2")
      .bind(email, cifDni)
      .first();
    if (existing) {
      return Response.json(
        { error: "El email o NIF/CIF ya está registrado." },
        { status: 409 },
      );
    }

    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    await db
      .prepare(
        `INSERT INTO users
          (id, email, name, role, tax_id, company_name,
           privacy_version, privacy_accepted_at, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?8, ?8)`,
      )
      .bind(
        id,
        email,
        nombre,
        tipo,
        cifDni,
        empresa || null,
        "2026-08-09",
        now,
      )
      .run();

    return Response.json(
      {
        success: true,
        mensaje: "Usuario registrado correctamente.",
        data: { usuarioId: id, email, tipo },
      },
      { status: 201 },
    );
  } catch (error) {
    return Response.json({ error: databaseError(error) }, { status: 500 });
  }
}
