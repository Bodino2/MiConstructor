import { drizzle } from "drizzle-orm/d1";
import * as schema from "./schema";

type MiConstructorRuntime = typeof globalThis & {
  __MICONSTRUCTOR_DB__?: D1Database;
};

export function getDb() {
  const database = (globalThis as MiConstructorRuntime).__MICONSTRUCTOR_DB__;
  if (!database) {
    throw new Error(
      "Cloudflare D1 binding `DB` is unavailable. Set the `d1` field in .openai/hosting.json to `DB` or let your control plane inject the real binding values before using the database."
    );
  }

  return drizzle(database, { schema });
}
