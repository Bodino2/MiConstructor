export async function POST() {
  return Response.json(
    {
      error: "La facturación semanal está desactivada. Las nuevas selecciones se cobran individualmente al profesional seleccionado.",
      billingMode: "IMMEDIATE_PER_SELECTION",
      legacyEndpoint: true,
    },
    { status: 410 },
  );
}
