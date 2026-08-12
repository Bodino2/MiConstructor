import { z } from "zod";

const booleanValue = z
  .string()
  .optional()
  .transform((value) => value === "true");

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  HOST: z.string().default("127.0.0.1"),
  PORT: z.coerce.number().int().min(1).max(65535).default(3200),
  APP_URL: z.string().url().default("http://localhost:3200"),
  DATABASE_URL: z.string().min(1),
  DATABASE_SSL: booleanValue,
  SESSION_PEPPER: z.string().min(32),
  TOKEN_PEPPER: z.string().min(32),
  UPLOAD_DIR: z.string().min(1).default("./uploads"),
  MAX_UPLOAD_BYTES: z.coerce.number().int().positive().default(15 * 1024 * 1024),
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().int().positive().default(587),
  SMTP_SECURE: booleanValue,
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  SMTP_FROM: z.string().default("MiConstructor <no-reply@miconstructor.es>"),
  STRIPE_SECRET_KEY: z.string().optional(),
  STRIPE_WEBHOOK_SECRET: z.string().optional(),
  STRIPE_PUBLISHABLE_KEY: z.string().optional(),
  GEOAPIFY_API_KEY: z.string().trim().min(16).optional(),
  BILLING_JOB_SECRET: z.string().min(24),
  ADMIN_EMAIL: z.string().email(),
  PUBLIC_CONTACT_EMAIL: z.string().email().default("oficina@miconstructor.es"),
  PUBLIC_CONTACT_PHONE: z.string().trim().min(6).max(40).optional(),
  LEGAL_ENTITY_TYPE: z.enum(["persona_fisica", "sociedad"]).default("persona_fisica"),
  LEGAL_ENTITY_NAME: z.string().trim().min(2).max(200).optional(),
  LEGAL_TAX_ID: z.string().trim().min(3).max(60).optional(),
  LEGAL_ADDRESS: z.string().trim().min(5).max(300).optional(),
  LEGAL_REGISTRY: z.string().trim().min(3).max(500).optional(),
  REQUIRE_EXTERNAL_SERVICES: booleanValue,
  TRUST_PROXY: z.coerce.number().int().min(0).max(2).default(1),
});

export type AppConfig = z.infer<typeof envSchema>;

export function loadConfig(source: NodeJS.ProcessEnv = process.env): AppConfig {
  const parsed = envSchema.safeParse(source);
  if (!parsed.success) {
    const problems = parsed.error.issues
      .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
      .join("; ");
    throw new Error(`Configuración inválida: ${problems}`);
  }

  const config = parsed.data;
  if (config.NODE_ENV === "production" && config.REQUIRE_EXTERNAL_SERVICES) {
    const required: Array<[string, unknown]> = [
      ["SMTP_HOST", config.SMTP_HOST],
      ["SMTP_USER", config.SMTP_USER],
      ["SMTP_PASS", config.SMTP_PASS],
      ["STRIPE_SECRET_KEY", config.STRIPE_SECRET_KEY],
      ["STRIPE_WEBHOOK_SECRET", config.STRIPE_WEBHOOK_SECRET],
      ["STRIPE_PUBLISHABLE_KEY", config.STRIPE_PUBLISHABLE_KEY],
      ["GEOAPIFY_API_KEY", config.GEOAPIFY_API_KEY],
      ["LEGAL_ENTITY_NAME", config.LEGAL_ENTITY_NAME],
      ["LEGAL_TAX_ID", config.LEGAL_TAX_ID],
      ["LEGAL_ADDRESS", config.LEGAL_ADDRESS],
    ];
    if (config.LEGAL_ENTITY_TYPE === "sociedad") {
      required.push(["LEGAL_REGISTRY", config.LEGAL_REGISTRY]);
    }
    const missing = required.filter(([, value]) => !value).map(([name]) => name);
    if (missing.length) {
      throw new Error(`Faltan servicios externos o datos legales obligatorios: ${missing.join(", ")}`);
    }
    if (!config.APP_URL.startsWith("https://")) {
      throw new Error("APP_URL debe usar HTTPS en producción.");
    }
  }
  return config;
}

export function publicRuntimeConfig(config: AppConfig) {
  const legalIdentityComplete = Boolean(
    config.LEGAL_ENTITY_NAME
    && config.LEGAL_TAX_ID
    && config.LEGAL_ADDRESS
    && (config.LEGAL_ENTITY_TYPE === "persona_fisica" || config.LEGAL_REGISTRY),
  );
  return {
    appUrl: config.APP_URL,
    stripePublishableKey: config.STRIPE_PUBLISHABLE_KEY ?? null,
    billingEnabled: Boolean(config.STRIPE_SECRET_KEY && config.STRIPE_WEBHOOK_SECRET),
    contactEmail: config.PUBLIC_CONTACT_EMAIL,
    contactPhone: config.PUBLIC_CONTACT_PHONE ?? null,
    legalEntityType: config.LEGAL_ENTITY_TYPE,
    legalEntityName: config.LEGAL_ENTITY_NAME ?? null,
    legalTaxId: config.LEGAL_TAX_ID ?? null,
    legalAddress: config.LEGAL_ADDRESS ?? null,
    legalRegistry: config.LEGAL_REGISTRY ?? null,
    legalIdentityComplete,
    privacyVersion: "2026-08-10",
    termsVersion: "2026-08-10",
    sepaTermsVersion: "2026-08-10",
  };
}
