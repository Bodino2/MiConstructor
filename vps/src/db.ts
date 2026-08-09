import pg from "pg";
import type { AppConfig } from "./config.js";

const { Pool } = pg;

export type Database = pg.Pool;
export type DatabaseClient = pg.PoolClient;

export function createDatabase(config: AppConfig): Database {
  return new Pool({
    connectionString: config.DATABASE_URL,
    max: config.NODE_ENV === "test" ? 4 : 15,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
    ssl: config.DATABASE_SSL ? { rejectUnauthorized: true } : undefined,
    application_name: "miconstructor-api",
  });
}

export async function withTransaction<T>(
  database: Database,
  operation: (client: DatabaseClient) => Promise<T>,
): Promise<T> {
  const client = await database.connect();
  try {
    await client.query("BEGIN");
    const result = await operation(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function assertDatabaseReady(database: Database) {
  const result = await database.query<{ version: string }>(
    "SELECT current_database() AS version",
  );
  if (!result.rows[0]?.version) throw new Error("PostgreSQL no está disponible.");
}
