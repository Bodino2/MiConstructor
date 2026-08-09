type MiConstructorRuntime = typeof globalThis & {
  __MICONSTRUCTOR_DB__?: D1Database;
};

export function getD1(): D1Database {
  const database = (globalThis as MiConstructorRuntime).__MICONSTRUCTOR_DB__;
  if (!database) {
    throw new Error("La base de datos de MiConstructor no está disponible.");
  }

  return database;
}

export function databaseError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  if (message.includes("no such table")) {
    return "La base de datos todavía se está preparando. Vuelve a intentarlo en unos segundos.";
  }
  return "No hemos podido completar la operación.";
}
