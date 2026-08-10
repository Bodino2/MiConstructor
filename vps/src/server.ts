import { loadConfig } from "./config.js";
import { assertDatabaseReady, createDatabase } from "./db.js";
import { createApp } from "./app.js";
import { dispatchMailOutbox } from "./services/mail.js";
import { PrivateStorage } from "./services/storage.js";

const config = loadConfig();
const database = createDatabase(config);
const storage = new PrivateStorage(config.UPLOAD_DIR);

await storage.initialize();
await assertDatabaseReady(database);

const app = createApp({ database, config, storage });
const server = app.listen(config.PORT, config.HOST, () => {
  console.log(JSON.stringify({ level: "info", message: "MiConstructor API started", host: config.HOST, port: config.PORT }));
});

const mailTimer = setInterval(() => {
  void dispatchMailOutbox(database, config).catch((error) => {
    console.error(JSON.stringify({ level: "error", message: "Mail outbox failed", error: error instanceof Error ? error.message : String(error) }));
  });
}, 30_000);
mailTimer.unref();

async function shutdown(signal: string) {
  console.log(JSON.stringify({ level: "info", message: "Shutdown requested", signal }));
  clearInterval(mailTimer);
  server.close(async () => {
    await database.end();
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10_000).unref();
}

process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));
