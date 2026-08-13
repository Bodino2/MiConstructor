import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import test from "node:test";

const deployUrl = new URL("../deploy/deploy-release.sh", import.meta.url);

async function deploySource() {
  return readFile(deployUrl, "utf8");
}

test("deploy-release shell syntax is valid", () => {
  execFileSync("bash", ["-n", fileURLToPath(deployUrl)], { stdio: "pipe" });
});

test("deploy is isolated to MiConstructor and never uses global git safety overrides", async () => {
  const source = await deploySource();
  assert.match(source, /BASE="\$\{MICONSTRUCTOR_BASE:-\/var\/www\/miconstructor\}"/);
  assert.match(source, /SERVICE="miconstructor-api\.service"/);
  assert.match(source, /runuser -u miconstructor -- git/);
  assert.doesNotMatch(source, /onoffcargo|matcher/i);
  assert.doesNotMatch(source, /git config\s+--global|safe\.directory/i);
});

test("deploy validates EnvironmentFile without sourcing secrets into the root shell", async () => {
  const source = await deploySource();
  assert.match(source, /validate_env_structure/);
  assert.match(source, /ENV_STRUCTURE_OK/);
  assert.match(source, /validate_env_runtime/);
  assert.match(source, /EnvironmentFile=\$ENV_FILE/);
  assert.match(source, /invalid GEOAPIFY_API_KEY/);
  assert.doesNotMatch(source, /source\s+["']?\$ENV_FILE/);
});

test("deploy only accepts the current GitHub main head", async () => {
  const source = await deploySource();
  assert.match(source, /git -C "\$RELEASE" fetch --quiet origin main/);
  assert.match(source, /rev-parse origin\/main/);
  assert.match(source, /SHA-ul cerut nu este HEAD-ul origin\/main/);
});

test("build always installs dev dependencies before TypeScript compilation", async () => {
  const source = await deploySource();
  assert.match(source, /NODE_ENV=development npm ci --include=dev/);
  assert.match(source, /NODE_ENV=development npm run build/);
  assert.match(source, /dist\/src\/server\.js/);
  assert.match(source, /dist\/src\/migrate\.js/);
});

test("pre-live overrides production port explicitly and verifies launch surfaces", async () => {
  const source = await deploySource();
  assert.match(source, /PRELIVE_PORT="\$\{MICONSTRUCTOR_PRELIVE_PORT:-3201\}"/);
  assert.match(source, /\/usr\/bin\/env NODE_ENV=production HOST=127\.0\.0\.1 PORT="\$PRELIVE_PORT"/);
  assert.match(source, /\/health\/ready/);
  assert.match(source, /\/guia/);
  assert.match(source, /\/opiniones/);
  assert.match(source, /qr\/espana-clientes-v1\.svg/);
  assert.match(source, /qr\/espana-profesionales-v1\.svg/);
  assert.match(source, /guide-nav\.js/);
  assert.match(source, /PRELIVE_FULL_OK/);
});

test("backup and migration happen before atomic activation with rollback", async () => {
  const source = await deploySource();
  const backup = source.lastIndexOf("backup_before_migration\n");
  const migration = source.lastIndexOf("migrate_release\n");
  const prelive = source.lastIndexOf("prelive_release\n");
  const activate = source.lastIndexOf("activate_release\n");
  assert.ok(backup >= 0 && migration > backup && prelive > migration && activate > prelive);
  assert.match(source, /current\.new/);
  assert.match(source, /current\.rollback/);
  assert.match(source, /ROLLBACK_START/);
  assert.match(source, /systemctl restart "\$SERVICE"/);
});

test("public smoke failure rolls back instead of leaving an ambiguous release live", async () => {
  const source = await deploySource();
  assert.match(source, /if ! public_smoke; then\s+rollback\s+fail "public smoke failed"/s);
  assert.match(source, /PUBLIC_SMOKE_OK/);
});

test("successful deploy requires local and public smoke checks", async () => {
  const source = await deploySource();
  assert.match(source, /LOCAL_LIVE_OK/);
  assert.match(source, /PUBLIC_SMOKE_OK/);
  assert.match(source, /MICONSTRUCTOR_DEPLOY_OK/);
  assert.match(source, /https:\/\/miconstructor\.es\/health\/ready/);
});
