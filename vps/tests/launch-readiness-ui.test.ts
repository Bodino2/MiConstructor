import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import test from "node:test";

const migrationUrl = new URL("../migrations/015_verified_reviews_publication.sql", import.meta.url);
const verifiedReviewsRouteUrl = new URL("../src/routes/verified-reviews.ts", import.meta.url);
const marketingRouteUrl = new URL("../src/routes/marketing.ts", import.meta.url);
const reviewUiUrl = new URL("../public/verified-reviews-ui.js", import.meta.url);
const marketingUiUrl = new URL("../public/admin-marketing-ui.js", import.meta.url);
const indexUrl = new URL("../public/index.html", import.meta.url);
const guideNavUrl = new URL("../public/guide-nav.js", import.meta.url);
const shellUrl = new URL("../public/site-shell.js", import.meta.url);

test("opiniile verificate cer consimțământ explicit și datele vechi sunt sigilate", async () => {
  const [migration, route] = await Promise.all([
    readFile(migrationUrl, "utf8"),
    readFile(verifiedReviewsRouteUrl, "utf8"),
  ]);
  assert.match(migration, /publication_consent boolean NOT NULL DEFAULT false/);
  assert.match(migration, /public_price_consent boolean NOT NULL DEFAULT false/);
  assert.match(migration, /NOT public_price_consent OR publication_consent/);
  assert.match(migration, /UPDATE reviews[\s\S]*status='SELLADA'[\s\S]*publication_consent=false/);
  assert.match(migration, /reviews_publication_consent_guard/);
  assert.match(route, /\/projects\/:id\/public-review/);
  assert.match(route, /requireRole\("cliente"\)/);
  assert.match(route, /project_status !== "FINALIZADO"/);
  assert.match(route, /publicationConsent/);
  assert.match(route, /publicPriceConsent/);
  assert.match(route, /VERIFIED_REVIEW_CREATED/);
});

test("pagina publică de opinii nu expune identitatea clientului și eliberează doar review-uri consentite", async () => {
  const route = await readFile(marketingRouteUrl, "utf8");
  assert.match(route, /router\.get\("\/opiniones"/);
  assert.match(route, /r\.author_id=c\.client_id/);
  assert.match(route, /r\.subject_id=c\.professional_id/);
  assert.match(route, /r\.publication_consent=true/);
  assert.match(route, /r\.publish_after<=now\(\)/);
  assert.match(route, /public_price_consent/);
  assert.match(route, /Ubicación no publicada/);
  assert.doesNotMatch(route, /client\.email|client_email|client_name/);
});

test("dashboardul QR are perioade, funnel și conversii fără telemetrie personală", async () => {
  execFileSync(process.execPath, ["--check", fileURLToPath(marketingUiUrl)], { stdio: "pipe" });
  const [route, ui] = await Promise.all([
    readFile(marketingRouteUrl, "utf8"),
    readFile(marketingUiUrl, "utf8"),
  ]);
  assert.match(route, /\["7", "30", "90", "365", "all"\]/);
  assert.match(route, /scanToLandingPct/);
  assert.match(route, /landingToCtaPct/);
  assert.match(route, /ctaToSignupPct/);
  assert.match(route, /scanToSignupPct/);
  assert.doesNotMatch(route, /request\.ip.*marketing_events|user-agent|fingerprint/i);
  assert.match(ui, /Marketing \/ QR/);
  assert.match(ui, /Escaneos/);
  assert.match(ui, /Registros/);
  assert.match(ui, /Scan → registro/);
  assert.match(ui, /\/qr\/\$\{escapeHtml\(item\.code\)\}\.svg/);
});

test("UI-ul de review și assets de lansare sunt încărcate și JavaScript valid", async () => {
  execFileSync(process.execPath, ["--check", fileURLToPath(reviewUiUrl)], { stdio: "pipe" });
  execFileSync(process.execPath, ["--check", fileURLToPath(guideNavUrl)], { stdio: "pipe" });
  const [reviewUi, index, nav, shell] = await Promise.all([
    readFile(reviewUiUrl, "utf8"),
    readFile(indexUrl, "utf8"),
    readFile(guideNavUrl, "utf8"),
    readFile(shellUrl, "utf8"),
  ]);
  assert.match(reviewUi, /Valora el trabajo finalizado/);
  assert.match(reviewUi, /publicationConsent/);
  assert.match(reviewUi, /publicPriceConsent/);
  assert.match(reviewUi, /La localidad pública procede de la zona del proyecto/);
  assert.match(index, /verified-reviews-ui\.js/);
  assert.match(index, /verified-reviews\.css/);
  assert.match(index, /admin-marketing-ui\.js/);
  assert.match(index, /admin-marketing\.css/);
  assert.match(nav, /MiConstructorShell/);
  assert.match(nav, /miconstructor:shell-ready/);
  assert.match(shell, /\/opiniones/);
  assert.match(shell, /"Opiniones"/);
});
