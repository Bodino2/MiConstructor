import { randomUUID } from "node:crypto";
import { join } from "node:path";
import cookieParser from "cookie-parser";
import express, { type NextFunction, type Request, type Response } from "express";
import rateLimit from "express-rate-limit";
import helmet from "helmet";
import type { AppConfig } from "./config.js";
import { publicRuntimeConfig } from "./config.js";
import type { Database } from "./db.js";
import { assertDatabaseReady } from "./db.js";
import { adminRouter } from "./routes/admin.js";
import { authRouter } from "./routes/auth.js";
import { billingRouter, stripeWebhookHandler } from "./routes/billing.js";
import { executionRouter } from "./routes/execution.js";
import { homeServicesRouter } from "./routes/home-services.js";
import { legalSupportRouter, registrationLegalGate, sepaLegalGate } from "./routes/legal-support.js";
import { marketplaceRouter } from "./routes/marketplace.js";
import { mobileAuthRouter } from "./routes/mobile-auth.js";
import { operatingSystemRouter } from "./routes/operating-system.js";
import { uploadsRouter } from "./routes/uploads.js";
import { authentication, originProtection } from "./services/auth.js";
import type { PrivateStorage } from "./services/storage.js";

export function createApp(dependencies: { database: Database; config: AppConfig; storage: PrivateStorage }) {
  const { database, config, storage } = dependencies;
  const app = express();
  app.disable("x-powered-by");
  app.set("trust proxy", config.TRUST_PROXY);

  app.use((request, response, next) => {
    const requestId = request.get("x-request-id")?.slice(0, 100) || randomUUID();
    response.setHeader("x-request-id", requestId);
    response.setHeader("cache-control", request.path.startsWith("/api/") ? "no-store" : "public, max-age=300");
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
        styleSrc: ["'self'"],
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
    stripeWebhookHandler(database, config),
  );

  app.use(express.json({ limit: "1mb", strict: true }));
  app.use(express.urlencoded({ extended: false, limit: "64kb" }));
  app.use(cookieParser());
  app.use(authentication(database, config));
  app.use(originProtection(config));

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
  app.post("/api/v1/auth/register", registrationLegalGate);
  app.use("/api/v1/auth", authLimiter, mobileAuthRouter(database, config));
  app.use("/api/v1/auth", authLimiter, authRouter(database, config));
  app.use("/api/v1", writeLimiter, marketplaceRouter(database));
  app.use("/api/v1", writeLimiter, executionRouter(database));
  app.use("/api/v1", writeLimiter, operatingSystemRouter(database, config, storage));
  app.use("/api/v1", writeLimiter, homeServicesRouter(database));
  app.post("/api/v1/billing/setup-intent", sepaLegalGate(database));
  app.use("/api/v1", writeLimiter, billingRouter(database, config));
  app.use("/api/v1", writeLimiter, uploadsRouter(database, config, storage));
  app.use("/api/v1", writeLimiter, legalSupportRouter(database));
  app.use("/api/v1", writeLimiter, adminRouter(database));

  const publicDir = join(process.cwd(), "public");
  app.use(express.static(publicDir, { index: false, maxAge: config.NODE_ENV === "production" ? "1h" : 0 }));
  app.get([
    "/",
    "/login",
    "/registro",
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
    response.sendFile(join(publicDir, "index.html"));
  });

  app.use((_request, response) => response.status(404).json({ error: "Ruta no encontrada." }));
  app.use((error: unknown, request: Request, response: Response, _next: NextFunction) => {
    const message = error instanceof Error ? error.message : "Error desconocido";
    console.error(JSON.stringify({ level: "error", requestId: response.getHeader("x-request-id"), path: request.path, message }));
    if (message.includes("Tipo de archivo") || message.includes("File too large")) {
      return response.status(400).json({ error: message.includes("large") ? "El archivo supera el límite permitido." : message });
    }
    response.status(500).json({ error: "No hemos podido completar la operación." });
  });
  return app;
}
