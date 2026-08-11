import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import test from "node:test";

const adapterUrl = new URL("../public/selection-billing-ui.js", import.meta.url);
const indexUrl = new URL("../public/index.html", import.meta.url);
const billingRouteUrl = new URL("../src/routes/billing.ts", import.meta.url);
const marketplaceRouteUrl = new URL("../src/routes/marketplace.ts", import.meta.url);
const migrationUrl = new URL("../migrations/009_immediate_selection_billing.sql", import.meta.url);
const legacyWeeklyUrl = new URL("../../app/api/v1/facturacion/semanal/route.ts", import.meta.url);
const legacyShortlistUrl = new URL("../../app/api/v1/proyectos/[id]/shortlist/route.ts", import.meta.url);

test("el adaptador web de cobro por selección es JavaScript válido y carga antes de app.js", async () => {
  execFileSync(process.execPath, ["--check", fileURLToPath(adapterUrl)], { stdio: "pipe" });
  const index = await readFile(indexUrl, "utf8");
  assert.match(index, /site-shell\.js[\s\S]*selection-billing-ui\.js[\s\S]*app\.js/);
});

test("la UI elimina la facturación semanal de nuevas selecciones y reintenta cargos individuales", async () => {
  const source = await readFile(adapterUrl, "utf8");
  assert.match(source, /Cobro automático por selección/);
  assert.match(source, /Si no eres seleccionado, no se genera ningún cargo/);
  assert.match(source, /billing\/charges\/\$1\/retry/);
  assert.match(source, /Historial de cargos por selección/);
  assert.match(source, /No se agrupan nuevas selecciones en una factura semanal/);
});

test("backend inicia el cobro al seleccionar y el job semanal queda desactivado", async () => {
  const [billing, marketplace] = await Promise.all([
    readFile(billingRouteUrl, "utf8"),
    readFile(marketplaceRouteUrl, "utf8"),
  ]);
  assert.match(marketplace, /collectSelectionCharge\(database, stripe, result\.charge\)/);
  assert.match(marketplace, /chargeMode:\s*"IMMEDIATE_PER_SELECTION"/);
  assert.match(billing, /\/jobs\/weekly-billing/);
  assert.match(billing, /response\.status\(410\)/);
  assert.match(billing, /selection_charge_id/);
  assert.doesNotMatch(billing, /previousWeeklyPeriod/);
  assert.doesNotMatch(billing, /miconstructor-weekly-/);
});

test("los endpoints Next heredados no pueden reactivar shortlist o facturación semanal", async () => {
  const [weekly, shortlist] = await Promise.all([
    readFile(legacyWeeklyUrl, "utf8"),
    readFile(legacyShortlistUrl, "utf8"),
  ]);
  assert.match(weekly, /status:\s*410/);
  assert.match(weekly, /IMMEDIATE_PER_SELECTION/);
  assert.doesNotMatch(weekly, /previousWeeklyPeriod|weekly_invoices|professional_billable_items/);
  assert.match(shortlist, /status:\s*410/);
  assert.match(shortlist, /IMMEDIATE_PER_SELECTION/);
  assert.doesNotMatch(shortlist, /PENDIENTE_FACTURA|SEMANAL_DIRECT_DEBIT|professional_billable_items/);
});

test("migración 009 conserva invoice_id solo como histórico y añade PaymentIntent por selección", async () => {
  const migration = await readFile(migrationUrl, "utf8");
  assert.match(migration, /stripe_payment_intent_id text UNIQUE/);
  assert.match(migration, /collection_requested_at/);
  assert.match(migration, /paid_at/);
  assert.match(migration, /retry_count/);
  assert.match(migration, /Las nuevas selecciones usan cobro inmediato/);
});
