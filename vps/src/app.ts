import { randomUUID } from "node:crypto";
import { join } from "node:path";
import cookieParser from "cookie-parser";
import express, { type NextFunction, type Request, type Response } from "express";
import rateLimit from "express-rate-limit";
import helmet from "helmet";
import type Stripe from "stripe";
import type { AppConfig } from "./config.js";
import { publicRuntimeConfig } from "./config.js";
import type { Database } from "./db.js";
import { assertDatabaseReady } from "./db.js";
import { adminBillingRouter } from "./routes/admin-billing.js";
import { adminRouter } from "./routes/admin.js";
import { authRouter } from "./routes/auth.js";
import { billingRouter, stripeClient, stripeWebhookHandler } from "./routes/billing.js";
import { contentRouter } from "./routes/content.js";
import { evidenceUploadsRouter } from "./routes/evidence-uploads.js";
import { executionRouter } from "./routes/execution.js";
import { geospatialRouter } from "./routes/geospatial.js";
import { homeServicesLifecycleRouter } from "./routes/home-services-lifecycle.js";
import { homeServicesRouter } from "./routes/home-services.js";
import { intelligenceRouter } from "./routes/intelligence.js";
import { legalSupportRouter, registrationLegalGate, sepaLegalGate } from "./routes/legal-support.js";
import { marketingRedirectRouter, marketingRouter } from "./routes/marketing.js";
import { marketplaceRouter } from "./routes/marketplace.js";
import { mobileAuthRouter } from "./routes/mobile-auth.js";
import { operatingSystemRouter } from "./routes/operating-system.js";
import { professionalVerificationRouter } from "./routes/professional-verification.js";
import { publicDirectoryRouter } from "./routes/public-directory.js";
import { unifiedAssessmentsRouter } from "./routes/unified-assessments.js";
import { uploadsRouter } from "./routes/uploads.js";
import { verifiedReviewsRouter } from "./routes/verified-reviews.js";
import { authentication, originProtection } from "./services/auth.js";
import type { PrivateStorage } from "./services/storage.js";

const domainConflictMessages: Array<[string, string]> = [
  ["shortlist_client_not_project_owner", "El proyecto ya no puede seleccionarse desde esta cuenta."],
  ["shortlist_project_not_open", "El proyecto ya no admite selecciones."],
  ["shortlist_active_proposal_required", "La propuesta ya no está disponible para selección."],
  ["shortlist_professional_not_eligible", "El profesional ya no cumple los requisitos para este proyecto."],
  ["contract_client_not_project_owner", "El proyecto ya no puede contratarse desde esta cuenta."],
  ["contract_project_not_open", "El proyecto ya no admite contratación."],
  ["contract_active_proposal_required", "La propuesta ya no está disponible para contratación."],
  ["contract_shortlist_required", "Debes seleccionar al profesional antes de aceptar su propuesta."],
  ["contract_professional_not_eligible", "El profesional ya no cumple los requisitos para formalizar el contrato."],
  ["home_service_private_address_required", "Añade la dirección exacta en los datos privados antes de aceptar una oferta."],
  ["professional_schedule_capacity_exceeded", "El profesional ya ha alcanzado su capacidad para esa franja horaria. Elige otra fecha, hora u oferta."],
];

export function createApp(dependencies: { database: Database; config: AppConfig; storage: PrivateStorage; stripe?: Stripe | null }) {
  const { database, config, storage } = dependencies;
  const stripe = dependencies.stripe === undefined ? stripeClient(config) : dependencies.stripe;
  const app = express();
  app.disable("x-powered-by");
  app.set("trust proxy", config.TRUST_PROXY);

  app.use((request, response, next) => {
    const requestId = request.get("x-request-id")?.slice(0, 100) || randomUUID();
    response.setHeader("x-request-id", requestId);
    response.setHeader("cache-control", request.path.startsWith("/api/") ? "no-store" : "no-cache");
    next();
  });

  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "https://js.stripe.com"],
        frameSrc: ["https://js.stripe.com", "https://hooks.stripe.com"],
        connectSrc: ["'self'", "https://api.stripe.com"],
        imgSrc: ["'self'", "data:", "blob:"],
        styleSrc: ["'self'", "https://fonts.googleapis.com"],
        fontSrc: ["'self'", "https://fonts.gstatic.com"],
        objectSrc: ["'none'"],
        baseUri: ["'self'"],
        formAction: ["'self'"],
      },
    },
    referrerPolicy: { policy: "strict-origin-when-cross-origin" },
  }));

  app.get("/health/live", (_request, response) => response.json({ status: "ok" }));
  app.get("/health/ready", async (_request, response) => {
    try {
      await assertDatabaseReady(database);
      response.json({ status: "ready" });
    } catch {
      response.status(503).json({ status: "unavailable" });
    }
  });

  app.post(
    "/api/v1/billing/stripe/webhook",
    express.raw({ type: "application/json", limit: "1mb" }),
    stripeWebhookHandler(database, config, stripe),
  );

  app.use(express.json({ limit: "1mb", strict: true }));
  app.use(express.urlencoded({ extended: false, limit: "64kb" }));
  app.use(cookieParser());
  app.use(authentication(database, config));
  app.use(originProtection(config));
  app.use(marketingRedirectRouter(database));

  const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: config.NODE_ENV === "test" ? 1000 : 20,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    message: { error: "Demasiados intentos. Espera unos minutos." },
  });
  const writeLimiter = rateLimit({
    windowMs: 60 * 1000,
    limit: config.NODE_ENV === "test" ? 1000 : 120,
    standardHeaders: "draft-8",
    legacyHeaders: false,
  });

  app.get("/api/v1/config", (_request, response) => response.json(publicRuntimeConfig(config)));
  app.use("/api/v1", publicDirectoryRouter(database));
  app.post("/api/v1/auth/register", registrationLegalGate);
  app.use("/api/v1/auth", authLimiter, mobileAuthRouter(database, config));
  app.use("/api/v1/auth", authLimiter, authRouter(database, config));
  app.use("/api/v1", writeLimiter, marketingRouter(database));
  app.use("/api/v1", writeLimiter, unifiedAssessmentsRouter(database));
  app.use("/api/v1", writeLimiter, verifiedReviewsRouter(database));
  app.use("/api/v1", writeLimiter, geospatialRouter(database, config));
  app.use("/api/v1", writeLimiter, marketplaceRouter(database, config, stripe));
  app.use("/api/v1", writeLimiter, intelligenceRouter(database));
  app.use("/api/v1", writeLimiter, executionRouter(database));
  app.use("/api/v1", writeLimiter, operatingSystemRouter(database, config, storage));
  app.use("/api/v1", writeLimiter, homeServicesRouter(database));
  app.use("/api/v1", writeLimiter, homeServicesLifecycleRouter(database));
  app.post("/api/v1/billing/setup-intent", sepaLegalGate(database));
  app.use("/api/v1", writeLimiter, billingRouter(database, config, stripe));
  app.use("/api/v1", writeLimiter, professionalVerificationRouter(database, config, storage));
  app.use("/api/v1", writeLimiter, evidenceUploadsRouter(database, config, storage));
  app.use("/api/v1", writeLimiter, uploadsRouter(database, config, storage));
  app.use("/api/v1", writeLimiter, legalSupportRouter(database));
  app.use("/api/v1", writeLimiter, adminBillingRouter(database));
  app.use("/api/v1", writeLimiter, adminRouter(database));

  // Public Guía HTML, sitemap/robots and admin CMS API share one source of truth.
  // It is mounted before the static SPA fallback so crawlers receive real article HTML and metadata.
  app.use(contentRouter(database, config));

  const publicDir = join(process.cwd(), "public");
  app.use(express.static(publicDir, {
    index: false,
    etag: true,
    maxAge: 0,
    immutable: false,
    setHeaders: (response) => response.setHeader("cache-control", "public, max-age=0, must-revalidate"),
  }));
  app.get([
    "/",
    "/login",
    "/registro",
    "/registro-cliente",
    "/para-profesionales",
    "/registro-profesional",
    "/publicar",
    "/servicios-hogar",
    "/campana/:slug",
    "/panel",
    "/verificar-email",
    "/restablecer",
    "/aviso-legal",
    "/privacidad",
    "/cookies",
    "/terminos",
    "/sepa",
    "/contacto",
  ], (_request, response) => {
    response.setHeader("cache-control", "no-cache");
    response.sendFile(join(publicDir, "index.html"));
  });

  app.use((_request, response) => response.status(404).json({ error: "Ruta no encontrada." }));
  app.use((error: unknown, request: Request, response: Response, _next: NextFunction) => {
    const message = error instanceof Error ? error.message : "Error desconocido";
    console.error(JSON.stringify({ level: "error", requestId: response.getHeader("x-request-id"), path: request.path, message }));
    for (const [code, publicMessage] of domainConflictMessages) {
      if (message.includes(code)) return response.status(409).json({ error: publicMessage });
    }
    if (message.includes("Tipo de archivo") || message.includes("File too large")) {
      return response.status(400).json({ error: message.includes("large") ? "El archivo supera el límite permitido." : message });
    }
    response.status(500).json({ error: "No hemos podido completar la operación." });
  });
  return app;
}
