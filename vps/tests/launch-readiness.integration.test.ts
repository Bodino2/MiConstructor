import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, test } from "node:test";
import request from "supertest";
import { createApp } from "../src/app.js";
import { loadConfig } from "../src/config.js";
import { createDatabase } from "../src/db.js";
import { migrate } from "../src/migrate.js";
import { hashPassword } from "../src/services/crypto.js";
import { PrivateStorage } from "../src/services/storage.js";

const databaseUrl = process.env.TEST_DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:5432/miconstructor_test";
const environment = {
  ...process.env,
  NODE_ENV: "test",
  APP_URL: "http://localhost:3200",
  DATABASE_URL: databaseUrl,
  SESSION_PEPPER: "s".repeat(32),
  TOKEN_PEPPER: "t".repeat(32),
  BILLING_JOB_SECRET: "b".repeat(32),
  ADMIN_EMAIL: "admin@miconstructor.es",
  PUBLIC_CONTACT_EMAIL: "admin@miconstructor.es",
  REQUIRE_EXTERNAL_SERVICES: "false",
};
const config = loadConfig(environment);
const database = createDatabase(config);
let uploadDir = "";
let application: ReturnType<typeof createApp>;

before(async () => {
  Object.assign(process.env, environment);
  await migrate(databaseUrl);
  await database.query("TRUNCATE TABLE users RESTART IDENTITY CASCADE");
  await database.query("TRUNCATE TABLE marketing_events RESTART IDENTITY");
  uploadDir = await mkdtemp(join(tmpdir(), "miconstructor-launch-"));
  const storage = new PrivateStorage(uploadDir);
  await storage.initialize();
  application = createApp({ database, config: { ...config, UPLOAD_DIR: uploadDir }, storage });
});

after(async () => {
  await database.end();
  if (uploadDir) await rm(uploadDir, { recursive: true, force: true });
});

async function createUser(input: {
  id: string;
  email: string;
  password: string;
  role: "cliente" | "profesional" | "admin";
  name: string;
  taxId: string;
  verification?: "NO_APLICA" | "APROBADO";
  latitude?: number | null;
  longitude?: number | null;
  radiusKm?: number;
}) {
  const hash = await hashPassword(input.password, config.SESSION_PEPPER);
  await database.query(
    `INSERT INTO users
      (id,email,name,password_hash,role,tax_id,email_verified,account_status,verification_status,
       privacy_version,privacy_accepted_at,service_province,service_locality,service_radius_km,
       service_latitude,service_longitude,service_geocoded_at)
     VALUES ($1,$2,$3,$4,$5,$6,true,'ACTIVO',$7,'test-v1',now(),$8,$9,$10,$11,$12,
             CASE WHEN $11::double precision IS NULL THEN NULL ELSE now() END)`,
    [
      input.id, input.email, input.name, hash, input.role, input.taxId,
      input.verification ?? (input.role === "profesional" ? "APROBADO" : "NO_APLICA"),
      input.latitude == null ? null : "Jaén",
      input.latitude == null ? null : "Base QA",
      input.radiusKm ?? 50,
      input.latitude ?? null,
      input.longitude ?? null,
    ],
  );
}

async function login(email: string, password: string) {
  const agent = request.agent(application);
  const response = await agent.post("/api/v1/auth/login").send({ email, password });
  assert.equal(response.status, 200, response.text);
  return agent;
}

test("launch smoke: 20/45/80 km, review verificat și funnel QR", async () => {
  const clientId = randomUUID();
  const professionalId = randomUUID();
  const adminId = randomUUID();
  const clientPassword = "Client-Launch-2026-Test";
  const professionalPassword = "Pro-Launch-2026-Test";
  const adminPassword = "Admin-Launch-2026-Test";

  await database.query(
    `INSERT INTO geo_location_cache
      (area_key,province,locality,latitude,longitude,formatted_address,provider,resolved_at)
     VALUES ('jaén|base qa','Jaén','Base QA',0,0,'Base QA, Jaén, España','geoapify',now())
     ON CONFLICT (area_key) DO UPDATE SET latitude=0,longitude=0,resolved_at=now()`,
  );

  await createUser({ id: clientId, email: "launch-client@example.es", password: clientPassword, role: "cliente", name: "Cliente Launch", taxId: `C-${clientId}` });
  await createUser({ id: professionalId, email: "launch-pro@example.es", password: professionalPassword, role: "profesional", name: "Profesional Launch", taxId: `P-${professionalId}`, verification: "APROBADO", latitude: 0, longitude: 0, radiusKm: 50 });
  await createUser({ id: adminId, email: "launch-admin@miconstructor.es", password: adminPassword, role: "admin", name: "Admin Launch", taxId: `A-${adminId}` });

  await database.query(
    `INSERT INTO professional_specialty_qualifications
      (id,professional_id,specialty_slug,specialty_label,is_primary,assessment_version,question_count,score,passed_at,verification_status)
     VALUES ($1,$2,'electricidad','Electricidad',true,'launch-v1',15,95,now(),'APROBADO')`,
    [randomUUID(), professionalId],
  );
  await database.query(
    `INSERT INTO billing_accounts
      (professional_id,status,stripe_customer_id,stripe_payment_method_id)
     VALUES ($1,'ACTIVO','cus_launch','pm_launch')`,
    [professionalId],
  );

  const project20 = randomUUID();
  const project45 = randomUUID();
  const project80 = randomUUID();
  const projects = [
    [project20, "Proyecto 20 km", 0.18],
    [project45, "Proyecto 45 km", 0.40],
    [project80, "Proyecto 80 km", 0.72],
  ] as const;
  for (const [id, title, longitude] of projects) {
    await database.query(
      `INSERT INTO projects
        (id,owner_id,title,description,category,project_type,location,square_meters,quality_level,budget_cents,status,
         service_province,service_locality,latitude,longitude,geocoded_at,search_radius_km)
       VALUES ($1,$2,$3,'Proyecto QA de lanzamiento con ubicación y radio controlados.','electricidad','bano',$4,10,'estandar',500000,'PUBLICADO','Jaén',$5,0,$6,now(),50)`,
      [id, clientId, title, `${title}, Jaén`, title, longitude],
    );
  }

  const professionalAgent = await login("launch-pro@example.es", professionalPassword);
  const available = await professionalAgent.get("/api/v1/projects");
  assert.equal(available.status, 200, available.text);
  assert.equal(available.body.matchingMode, "GEOSPATIAL_RADIUS");
  const visibleIds = available.body.projects.map((project: { id: string }) => project.id);
  assert.ok(visibleIds.includes(project20), "20 km trebuie să fie vizibil");
  assert.ok(visibleIds.includes(project45), "45 km trebuie să fie vizibil");
  assert.equal(visibleIds.includes(project80), false, "80 km trebuie exclus");

  const blocked = await professionalAgent.post("/api/v1/proposals").send({
    projectId: project80,
    amountCents: 450000,
    estimatedDays: 6,
    message: "Oferta manuală QA care trebuie blocată de gardul geospațial la aproximativ 80 km.",
  });
  assert.equal(blocked.status, 403, blocked.text);
  assert.ok(blocked.body.distanceKm > 79 && blocked.body.distanceKm < 81.5, JSON.stringify(blocked.body));
  assert.equal(blocked.body.radiusKm, 50);

  const reviewProjectId = randomUUID();
  const proposalId = randomUUID();
  await database.query(
    `INSERT INTO projects
      (id,owner_id,title,description,category,project_type,location,square_meters,quality_level,budget_cents,status,assigned_professional_id,
       service_province,service_locality,latitude,longitude,geocoded_at,search_radius_km)
     VALUES ($1,$2,'Reforma verificada Linares','Proyecto finalizado para validar opiniones públicas verificadas.','electricidad','bano','Linares, Jaén',5,'estandar',325000,'FINALIZADO',$3,'Jaén','Linares',38.095,-3.636,now(),50)`,
    [reviewProjectId, clientId, professionalId],
  );
  await database.query(
    `INSERT INTO proposals
      (id,project_id,professional_id,amount_cents,estimated_days,message,status)
     VALUES ($1,$2,$3,300000,5,'Presupuesto final aceptado para el smoke test de reseñas.','ACEPTADA')`,
    [proposalId, reviewProjectId, professionalId],
  );
  await database.query(
    `INSERT INTO work_contracts
      (id,project_id,proposal_id,client_id,professional_id,project_title,project_description,project_location,specialty_slug,
       agreed_amount_cents,estimated_days,proposal_message,status,completed_at)
     VALUES ($1,$2,$3,$4,$5,'Reforma verificada Linares','Proyecto finalizado para QA','Linares, Jaén','electricidad',300000,5,'Presupuesto aceptado','FINALIZADO',now())`,
    [randomUUID(), reviewProjectId, proposalId, clientId, professionalId],
  );

  const clientAgent = await login("launch-client@example.es", clientPassword);
  const review = await clientAgent.post(`/api/v1/projects/${reviewProjectId}/public-review`).send({
    rating: 5,
    comment: "Trabajo terminado dentro del plazo acordado, buena comunicación y resultado final correcto.",
    publicationConsent: true,
    publicPriceConsent: true,
  });
  assert.equal(review.status, 201, review.text);
  assert.equal(review.body.publicationConsent, true);
  await database.query("UPDATE reviews SET publish_after=now()-interval '1 day' WHERE id=$1", [review.body.reviewId]);

  const opinions = await request(application).get("/opiniones");
  assert.equal(opinions.status, 200, opinions.text);
  assert.match(opinions.text, /OPINIÓN VERIFICADA/);
  assert.match(opinions.text, /Trabajo terminado dentro del plazo acordado/);
  assert.match(opinions.text, /Linares/);
  assert.match(opinions.text, /3(?:\.)?000/);
  assert.doesNotMatch(opinions.text, /Cliente Launch/);
  assert.doesNotMatch(opinions.text, /launch-client@example\.es/);
  const published = await database.query<{ status: string; publication_consent: boolean }>("SELECT status,publication_consent FROM reviews WHERE id=$1", [review.body.reviewId]);
  assert.deepEqual(published.rows[0], { status: "PUBLICADA", publication_consent: true });

  const campaignId = "01000000-0000-4000-8000-000000000001";
  await database.query("DELETE FROM marketing_events WHERE campaign_id=$1", [campaignId]);
  for (const [eventType, count] of [["QR_SCAN", 10], ["LANDING_VIEW", 8], ["CTA_CLICK", 4], ["SIGNUP", 2]] as const) {
    await database.query(
      `INSERT INTO marketing_events (campaign_id,event_type,path)
       SELECT $1,$2,'/qa' FROM generate_series(1,$3)`,
      [campaignId, eventType, count],
    );
  }
  const adminAgent = await login("launch-admin@miconstructor.es", adminPassword);
  const marketing = await adminAgent.get("/api/v1/admin/marketing?days=30");
  assert.equal(marketing.status, 200, marketing.text);
  const campaign = marketing.body.campaigns.find((item: { code: string }) => item.code === "espana-clientes-v1");
  assert.ok(campaign);
  assert.equal(campaign.qrScans, 10);
  assert.equal(campaign.landingViews, 8);
  assert.equal(campaign.ctaClicks, 4);
  assert.equal(campaign.signups, 2);
  assert.deepEqual(campaign.conversions, {
    scanToLandingPct: 80,
    landingToCtaPct: 50,
    ctaToSignupPct: 50,
    scanToSignupPct: 20,
  });
});
