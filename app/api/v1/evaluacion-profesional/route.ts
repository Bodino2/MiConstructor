import {
  evaluateProfessionalAssessment,
  getPublicProfessionalAssessment,
} from "@/lib/professional-assessment";

export async function GET() {
  return Response.json({ success: true, data: getPublicProfessionalAssessment() });
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
