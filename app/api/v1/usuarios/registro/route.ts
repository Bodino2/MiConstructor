import { databaseError, getD1 } from "@/lib/server/d1";
import { getIdentityEmail, normalizeEmail } from "@/lib/server/identity";
import {
  cleanText,
  isValidEmail,
  isValidSpanishTaxId,
} from "@/lib/validation";
import {
  evaluateProfessionalAssessment,
  PROFESSIONAL_ASSESSMENT_VERSION,
} from "@/lib/professional-assessment";

type RegistrationPayload = {
  nombre?: unknown;
  email?: unknown;
  tipo?: unknown;
  cifDni?: unknown;
  empresa?: unknown;
  telefono?: unknown;
  especialidad?: unknown;
  evaluacionConocimientos?: unknown;
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
    telefono: row.phone,
    especialidad: row.professional_specialty,
    estadoVerificacion: row.verification_status,
    puntuacionConocimientos: row.knowledge_assessment_score,
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
        `SELECT id, email, name, role, tax_id, company_name, phone,
                professional_specialty, verification_status,
                knowledge_assessment_score, privacy_accepted_at, created_at
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
    const telefono = cleanText(payload.telefono, 30);
    const especialidad = cleanText(payload.especialidad, 80);

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
    if (tipo === "profesional" && (!empresa || !especialidad || !telefono)) {
      return Response.json(
        { error: "La razón social, la especialidad y el teléfono son obligatorios para profesionales." },
        { status: 400 },
      );
    }

    const assessment = tipo === "profesional"
      ? evaluateProfessionalAssessment(payload.evaluacionConocimientos)
      : null;
    if (assessment && !assessment.valid) {
      return Response.json(
        { error: assessment.error ?? "Debes completar el test de conocimientos." },
        { status: 400 },
      );
    }
    if (assessment && !assessment.passed) {
      return Response.json(
        {
          error: "Debes aprobar el test de conocimientos para crear una cuenta profesional.",
          data: { puntuacion: assessment.score, minimo: 80 },
        },
        { status: 422 },
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
          (id, email, name, role, tax_id, company_name, phone, professional_specialty,
           verification_status, knowledge_assessment_version,
           knowledge_assessment_score, knowledge_assessment_passed_at,
           privacy_version, privacy_accepted_at, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?14, ?14)`,
      )
      .bind(
        id,
        email,
        nombre,
        tipo,
        cifDni,
        empresa || null,
        telefono || null,
        especialidad || null,
        tipo === "profesional" ? "PENDIENTE_REVISION" : "NO_APLICA",
        assessment ? PROFESSIONAL_ASSESSMENT_VERSION : null,
        assessment?.score ?? null,
        assessment ? now : null,
        "2026-08-09",
        now,
      )
      .run();

    if (tipo === "profesional") {
      await db
        .prepare(
          `INSERT INTO professional_billing_accounts
            (professional_email, status, payment_provider,
             unbilled_balance_cents, overdue_balance_cents, created_at, updated_at)
           VALUES (?1, 'PENDIENTE_MANDATO', 'STRIPE', 0, 0, ?2, ?2)`,
        )
        .bind(email, now)
        .run();
    }

    return Response.json(
      {
        success: true,
        mensaje: tipo === "profesional"
          ? "Test aprobado. Activa la domiciliación y completa la revisión profesional."
          : "Usuario registrado correctamente.",
        data: {
          usuarioId: id,
          email,
          tipo,
          estadoVerificacion: tipo === "profesional" ? "PENDIENTE_REVISION" : "NO_APLICA",
          puntuacionConocimientos: assessment?.score ?? null,
          domiciliacionObligatoria: tipo === "profesional",
        },
      },
      { status: 201 },
    );
  } catch (error) {
    return Response.json({ error: databaseError(error) }, { status: 500 });
  }
}
