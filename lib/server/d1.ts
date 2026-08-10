type MiConstructorRuntime = typeof globalThis & {
  __MICONSTRUCTOR_DB__?: D1Database;
  __MICONSTRUCTOR_BUCKET__?: R2Bucket;
  __MICONSTRUCTOR_BILLING_JOB_SECRET__?: string;
};

export function getD1(): D1Database {
  const database = (globalThis as MiConstructorRuntime).__MICONSTRUCTOR_DB__;
  if (!database) {
    throw new Error("La base de datos de MiConstructor no está disponible.");
  }

  return database;
}

export function getR2(): R2Bucket {
  const bucket = (globalThis as MiConstructorRuntime).__MICONSTRUCTOR_BUCKET__;
  if (!bucket) {
    throw new Error("El almacenamiento de imágenes no está disponible.");
  }
  return bucket;
}

export function requireBillingJob(request: Request): Response | null {
  const runtime = globalThis as MiConstructorRuntime;
  const configuredSecret = runtime.__MICONSTRUCTOR_BILLING_JOB_SECRET__;
  const suppliedSecret = request.headers.get("x-miconstructor-billing-secret");
  if (!configuredSecret) {
    return Response.json(
      { error: "La automatización de facturación todavía no está configurada." },
      { status: 503 },
    );
  }
  if (!suppliedSecret || suppliedSecret !== configuredSecret) {
    return Response.json({ error: "No autorizado." }, { status: 401 });
  }
  return null;
}

export function databaseError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  if (message.includes("no such table")) {
    return "La base de datos todavía se está preparando. Vuelve a intentarlo en unos segundos.";
  }
  return "No hemos podido completar la operación.";
}
