import {
  evaluateProfessionalAssessment,
  getProfessionalSpecialties,
  getPublicProfessionalAssessment,
} from "@/lib/professional-assessment";

export async function GET(request: Request) {
  const specialty = new URL(request.url).searchParams.get("especialidad");
  const assessment = getPublicProfessionalAssessment(specialty);

  if (!assessment) {
    return Response.json(
      {
        success: false,
        error: "Selecciona una especialidad profesional válida.",
        data: { especialidades: getProfessionalSpecialties() },
      },
      { status: 400 },
    );
  }

  return Response.json({
    success: true,
    data: assessment,
    especialidades: getProfessionalSpecialties(),
  });
}

export async function POST(request: Request) {
  try {
    const payload = await request.json();
    const result = evaluateProfessionalAssessment(payload);

    if (!result.valid) {
      return Response.json(
        { success: false, error: result.error, data: result },
        { status: 400 },
      );
    }

    return Response.json({ success: true, data: result });
  } catch {
    return Response.json(
      { success: false, error: "No se ha podido corregir la evaluación." },
      { status: 400 },
    );
  }
}
