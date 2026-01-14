const fs = require('fs');
const path = require('path');
require('dotenv').config();

const { pool } = require('./db');

async function ensureMigrationsTable(client) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS migrations (
      id SERIAL PRIMARY KEY,
      filename TEXT UNIQUE NOT NULL,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);
}

async function listMigrationFiles(migrationsDir) {
  const entries = await fs.promises.readdir(migrationsDir);
  return entries
    .filter((f) => f.toLowerCase().endsWith('.sql'))
    .sort((a, b) => a.localeCompare(b));
}

async function runMigrations() {
  const migrationsDir = path.join(__dirname, 'migrations');
  const files = await listMigrationFiles(migrationsDir);

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await ensureMigrationsTable(client);

    const applied = await client.query('SELECT filename FROM migrations');
    const appliedSet = new Set(applied.rows.map((r) => r.filename));

    for (const file of files) {
      if (appliedSet.has(file)) continue;

      const sql = await fs.promises.readFile(path.join(migrationsDir, file), 'utf8');
      await client.query(sql);
      await client.query('INSERT INTO migrations (filename) VALUES ($1)', [file]);
    }

    await client.query('COMMIT');
    console.log('Auth DB migrations ready');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Auth DB migrations failed', err);
    throw err;
  } finally {
    client.release();
  }
}

module.exports = { runMigrations };

if (require.main === module) {
  runMigrations().catch(() => process.exit(1));
}
