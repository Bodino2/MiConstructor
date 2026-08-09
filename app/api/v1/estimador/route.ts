import { estimateProjectPrice } from "@/lib/project-estimator";

export async function POST(request: Request) {
  try {
    const payload = (await request.json()) as {
      tipoObra?: unknown;
      superficieM2?: unknown;
      nivelCalidades?: unknown;
    };
    const estimation = estimateProjectPrice({
      projectType: String(payload.tipoObra ?? ""),
      squareMeters: Number(payload.superficieM2),
      qualityLevel: String(payload.nivelCalidades ?? ""),
    });

    if (!estimation.valid) {
      return Response.json({ error: estimation.error }, { status: 400 });
    }

    return Response.json({ success: true, data: estimation });
  } catch {
    return Response.json(
      { error: "No hemos podido calcular la estimación." },
      { status: 400 },
    );
  }
}
