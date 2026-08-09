import { randomUUID } from "node:crypto";
import { loadConfig } from "./config.js";
import { createDatabase } from "./db.js";
import { hashPassword } from "./services/crypto.js";

const config = loadConfig();
const password = process.env.ADMIN_BOOTSTRAP_PASSWORD;
if (!password || password.length < 16) {
  throw new Error("ADMIN_BOOTSTRAP_PASSWORD debe tener al menos 16 caracteres.");
}
const database = createDatabase(config);
try {
  const existing = await database.query("SELECT id FROM users WHERE email = $1", [config.ADMIN_EMAIL.toLowerCase()]);
  if (existing.rows[0]) {
    console.log("El administrador ya existe; no se ha modificado.");
  } else {
    const passwordHash = await hashPassword(password, config.SESSION_PEPPER);
    await database.query(
      `INSERT INTO users
        (id, email, name, password_hash, role, tax_id, email_verified,
         account_status, verification_status, privacy_version, privacy_accepted_at)
       VALUES ($1, $2, 'Administración MiConstructor', $3, 'admin', $4, true,
               'ACTIVO', 'NO_APLICA', '2026-08-09', now())`,
      [randomUUID(), config.ADMIN_EMAIL.toLowerCase(), passwordHash, `ADMIN-${randomUUID()}`],
    );
    console.log("Administrador creado. Elimina ADMIN_BOOTSTRAP_PASSWORD del entorno.");
  }
} finally {
  await database.end();
}
