import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { loadConfig } from "./config.js";
import { createDatabase } from "./db.js";

export async function migrate(databaseUrl?: string) {
  const config = loadConfig(databaseUrl ? { ...process.env, DATABASE_URL: databaseUrl } : process.env);
  const database = createDatabase(config);
  // Resolve migrations from the application working directory rather than
  // relative to the compiled file. In production the service runs from
  // /var/www/miconstructor/current/vps, while compiled code lives in dist/.
  // Keeping SQL migrations in vps/migrations means the same path works for
  // source execution, tests and the compiled production migrator.
  const migrationsDir = join(process.cwd(), "migrations");
  const client = await database.connect();
  try {
    await client.query("SELECT pg_advisory_lock(696943678421)");
    await client.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
      name text PRIMARY KEY,
      checksum text NOT NULL,
      applied_at timestamptz NOT NULL DEFAULT now()
    )`);
    const names = (await readdir(migrationsDir)).filter((name) => name.endsWith(".sql")).sort();
    for (const name of names) {
      const sql = await readFile(join(migrationsDir, name), "utf8");
      const checksum = createHash("sha256").update(sql).digest("hex");
      const existing = await client.query<{ checksum: string }>(
        "SELECT checksum FROM schema_migrations WHERE name = $1",
        [name],
      );
      if (existing.rows[0]) {
        if (existing.rows[0].checksum !== checksum) {
          throw new Error(`La migración aplicada ${name} ha sido modificada.`);
        }
        continue;
      }
      await client.query("BEGIN");
      try {
        await client.query(sql);
        await client.query(
          "INSERT INTO schema_migrations (name, checksum) VALUES ($1, $2)",
          [name, checksum],
        );
        await client.query("COMMIT");
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      }
    }
  } finally {
    await client.query("SELECT pg_advisory_unlock(696943678421)").catch(() => undefined);
    client.release();
    await database.end();
  }
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  migrate().then(() => console.log("Migraciones aplicadas.")).catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
