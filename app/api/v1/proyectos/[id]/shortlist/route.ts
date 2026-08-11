export async function POST() {
  return Response.json(
    {
      error: "Este endpoint de shortlist pertenece al flujo de facturación anterior y está desactivado. La selección activa utiliza cobro automático individual al profesional seleccionado.",
      billingMode: "IMMEDIATE_PER_SELECTION",
      legacyEndpoint: true,
    },
    { status: 410 },
  );
}
