import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import express from "express";
import test from "node:test";
import request from "supertest";
import type { Database } from "../src/db.js";
import { adminBillingRouter } from "../src/routes/admin-billing.js";

const uiUrl = new URL("../public/admin-billing-ui.js", import.meta.url);
const cssUrl = new URL("../public/admin-billing.css", import.meta.url);
const indexUrl = new URL("../public/index.html", import.meta.url);
const routeUrl = new URL("../src/routes/admin-billing.ts", import.meta.url);

function adminUser() {
  return {
    id: "00000000-0000-4000-8000-000000000001",
    email: "admin@miconstructor.es",
    name: "Admin",
    role: "admin" as const,
    emailVerified: true,
    accountStatus: "ACTIVO",
    verificationStatus: "NO_APLICA",
  };
}

test("el endpoint admin devuelve resumen y movimientos con filtros validados", async () => {
  const calls: Array<{ sql: string; params: unknown[] | undefined }> = [];
  const database = {
    async query(sql: string, params?: unknown[]) {
      calls.push({ sql, params });
      if (sql.includes("paid_this_month_cents")) {
        return {
          rows: [{
            paid_this_month_cents: "12500",
            processing_cents: "4800",
            overdue_balance_cents: "3200",
            paid_count: "3",
            processing_count: "1",
            failed_count: "1",
          }],
        };
      }
      if (sql.includes("WITH ledger AS")) {
        return {
          rows: [{
            id: "00000000-0000-4000-8000-000000000010",
            entry_type: "SELECCION",
            professional_id: "00000000-0000-4000-8000-000000000011",
            professional_name: "Profesional Prueba",
            professional_company: "Empresa Prueba SL",
            professional_email: "pro@example.es",
            project_id: "00000000-0000-4000-8000-000000000012",
            project_title: "Reforma cocina",
            description: "Selección de profesional",
            amount_cents: "3200",
            status: "PAGADO",
            service_date: "2026-08-10T08:00:00.000Z",
            collection_requested_at: "2026-08-10T08:01:00.000Z",
            paid_at: "2026-08-11T08:00:00.000Z",
            failure_reason: null,
            retry_count: 0,
            created_at: "2026-08-10T08:00:00.000Z",
            account_status: "ACTIVO",
            account_overdue_balance_cents: "0",
          }],
        };
      }
      throw new Error("Consulta inesperada");
    },
  } as unknown as Database;

  const app = express();
  app.use((req, _res, next) => { req.user = adminUser(); next(); });
  app.use("/api/v1", adminBillingRouter(database));

  const response = await request(app)
    .get("/api/v1/admin/billing")
    .query({ status: "PAGADO", q: "Empresa", from: "2026-08-01", to: "2026-08-31", limit: 25 });

  assert.equal(response.status, 200, response.text);
  assert.deepEqual(response.body.summary, {
    paidThisMonthCents: 12500,
    processingCents: 4800,
    overdueBalanceCents: 3200,
    paidCount: 3,
    processingCount: 1,
    failedCount: 1,
  });
  assert.equal(response.body.entries[0].professional_company, "Empresa Prueba SL");
  assert.equal(response.body.entries[0].project_title, "Reforma cocina");
  assert.equal(response.body.entries[0].amount_cents, "3200");
  assert.equal(response.body.entries[0].paid_at, "2026-08-11T08:00:00.000Z");
  assert.deepEqual(calls.find((call) => call.sql.includes("WITH ledger AS"))?.params, [
    "PAGADO", "Empresa", "2026-08-01", "2026-08-31", 25,
  ]);
});

test("el endpoint rechaza rangos de fecha invertidos antes de consultar la base", async () => {
  let queries = 0;
  const database = { query: async () => { queries += 1; return { rows: [] }; } } as unknown as Database;
  const app = express();
  app.use((req, _res, next) => { req.user = adminUser(); next(); });
  app.use("/api/v1", adminBillingRouter(database));

  const response = await request(app)
    .get("/api/v1/admin/billing")
    .query({ from: "2026-08-20", to: "2026-08-01" });

  assert.equal(response.status, 400);
  assert.match(response.body.error, /fecha inicial/i);
  assert.equal(queries, 0);
});

test("la facturación admin queda protegida y no expone porcentajes internos", async () => {
  const route = await readFile(routeUrl, "utf8");
  assert.match(route, /router\.use\(requireAuth, requireRole\("admin"\)\)/);
  assert.match(route, /invoice_id IS NULL/);
  assert.match(route, /professional_company/);
  assert.match(route, /project_title/);
  assert.match(route, /paid_at/);
  assert.match(route, /failure_reason/);
  assert.doesNotMatch(route, /fee_percent|percentage|0\.0[345]/);
});

test("el panel carga la pestaña, filtros, detalle y exportación CSV", async () => {
  execFileSync(process.execPath, ["--check", fileURLToPath(uiUrl)], { stdio: "pipe" });
  const [ui, css, index] = await Promise.all([
    readFile(uiUrl, "utf8"),
    readFile(cssUrl, "utf8"),
    readFile(indexUrl, "utf8"),
  ]);

  assert.match(index, /admin-billing\.css[\s\S]*admin-billing-ui\.js/);
  assert.match(index, /admin-dashboard\.js[\s\S]*admin-billing-ui\.js/);
  assert.match(ui, /data\.adminTab = "billing"/);
  assert.match(ui, /\/api\/v1\/admin\/billing/);
  assert.match(ui, /Quién pagó, por qué concepto, cuánto, cuándo/);
  assert.match(ui, /professional_company \|\| entry\.professional_name/);
  assert.match(ui, /project_title/);
  assert.match(ui, /amount_cents/);
  assert.match(ui, /paid_at/);
  assert.match(ui, /failure_reason/);
  assert.match(ui, /Exportar CSV/);
  assert.match(css, /admin-billing-toolbar/);
  assert.match(css, /data-admin-open-billing/);
});
