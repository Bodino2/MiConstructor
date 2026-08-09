import { sql } from "drizzle-orm";
import { integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const users = sqliteTable(
  "users",
  {
    id: text("id").primaryKey(),
    email: text("email").notNull(),
    name: text("name").notNull(),
    role: text("role", { enum: ["cliente", "profesional"] }).notNull(),
    taxId: text("tax_id").notNull(),
    companyName: text("company_name"),
    phone: text("phone"),
    professionalSpecialty: text("professional_specialty"),
    verificationStatus: text("verification_status", {
      enum: [
        "NO_APLICA",
        "PENDIENTE_REVISION",
        "APROBADO",
        "RECHAZADO",
        "SUSPENDIDO",
      ],
    })
      .notNull()
      .default("NO_APLICA"),
    knowledgeAssessmentVersion: text("knowledge_assessment_version"),
    knowledgeAssessmentScore: integer("knowledge_assessment_score"),
    knowledgeAssessmentPassedAt: text("knowledge_assessment_passed_at"),
    verificationReviewedAt: text("verification_reviewed_at"),
    verificationReviewedBy: text("verification_reviewed_by"),
    verificationReason: text("verification_reason"),
    privacyVersion: text("privacy_version").notNull().default("2026-08-09"),
    privacyAcceptedAt: text("privacy_accepted_at").notNull(),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    uniqueIndex("users_email_idx").on(table.email),
    uniqueIndex("users_tax_id_idx").on(table.taxId),
  ],
);

export const projects = sqliteTable(
  "projects",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    ownerEmail: text("owner_email").notNull(),
    title: text("title").notNull(),
    description: text("description").notNull().default(""),
    category: text("category").notNull(),
    location: text("location").notNull(),
    budgetCents: integer("budget_cents").notNull(),
    status: text("status", {
      enum: ["BORRADOR", "PUBLICADO", "EN_CURSO", "FINALIZADO", "CANCELADO"],
    })
      .notNull()
      .default("PUBLICADO"),
    assignedProfessionalEmail: text("assigned_professional_email"),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    uniqueIndex("projects_owner_title_idx").on(table.ownerEmail, table.title),
  ],
);

export const milestones = sqliteTable(
  "milestones",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    projectId: integer("project_id").notNull(),
    position: integer("position").notNull(),
    title: text("title").notNull(),
    description: text("description").notNull().default(""),
    amountCents: integer("amount_cents").notNull(),
    status: text("status", {
      enum: ["PREVISTO", "RETENIDO", "EN_REVISION", "LIBERADO", "DISPUTADO"],
    })
      .notNull()
      .default("RETENIDO"),
    dueDate: text("due_date"),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    uniqueIndex("milestones_project_position_idx").on(
      table.projectId,
      table.position,
    ),
  ],
);

export const proposals = sqliteTable(
  "proposals",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    projectId: integer("project_id").notNull(),
    professionalEmail: text("professional_email").notNull(),
    amountCents: integer("amount_cents").notNull(),
    message: text("message").notNull().default(""),
    estimatedDays: integer("estimated_days").notNull(),
    status: text("status", {
      enum: ["ENVIADA", "ACEPTADA", "RECHAZADA", "RETIRADA"],
    })
      .notNull()
      .default("ENVIADA"),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    uniqueIndex("proposals_project_professional_idx").on(
      table.projectId,
      table.professionalEmail,
    ),
  ],
);

export const events = sqliteTable("events", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  projectId: integer("project_id").notNull(),
  actorEmail: text("actor_email").notNull(),
  type: text("type").notNull(),
  message: text("message").notNull(),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const professionalCreditAccounts = sqliteTable("professional_credit_accounts", {
  professionalEmail: text("professional_email").primaryKey(),
  balanceCents: integer("balance_cents").notNull().default(0),
  autoChargeEnabled: integer("auto_charge_enabled", { mode: "boolean" })
    .notNull()
    .default(false),
  paymentCustomerRef: text("payment_customer_ref"),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const projectShortlists = sqliteTable(
  "project_shortlists",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    projectId: integer("project_id").notNull(),
    clientEmail: text("client_email").notNull(),
    professionalEmail: text("professional_email").notNull(),
    projectBudgetCents: integer("project_budget_cents").notNull(),
    feeCents: integer("fee_cents").notNull(),
    pricingVersion: text("pricing_version").notNull(),
    chargeMethod: text("charge_method", { enum: ["CREDITS", "STRIPE"] }),
    paymentStatus: text("payment_status", {
      enum: ["PENDIENTE", "PAGADO", "FALLIDO", "REEMBOLSADO"],
    })
      .notNull()
      .default("PENDIENTE"),
    paymentProviderRef: text("payment_provider_ref"),
    contactUnlockedAt: text("contact_unlocked_at"),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    uniqueIndex("project_shortlists_project_professional_idx").on(
      table.projectId,
      table.professionalEmail,
    ),
  ],
);

export const creditTransactions = sqliteTable("credit_transactions", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  professionalEmail: text("professional_email").notNull(),
  shortlistId: integer("shortlist_id"),
  type: text("type", {
    enum: ["COMPRA_CREDITOS", "CARGO_SHORTLIST", "REEMBOLSO"],
  }).notNull(),
  amountCents: integer("amount_cents").notNull(),
  status: text("status", {
    enum: ["PENDIENTE", "COMPLETADO", "FALLIDO"],
  })
    .notNull()
    .default("COMPLETADO"),
  paymentProvider: text("payment_provider"),
  paymentProviderRef: text("payment_provider_ref"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});
