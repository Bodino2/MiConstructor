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
      enum: ["BORRADOR", "PUBLICADO", "IN_PROGRESS", "COMPLETED", "RELEASED", "CANCELADO"],
    })
      .notNull()
      .default("PUBLICADO"),
    requiresGuarantee: integer("requires_guarantee", { mode: "boolean" })
      .notNull()
      .default(false),
    guaranteeChargeStatus: text("guarantee_charge_status", {
      enum: ["NOT_REQUIRED", "PENDING", "PAID", "FAILED"],
    })
      .notNull()
      .default("NOT_REQUIRED"),
    escrowStatus: text("escrow_status", {
      enum: ["PENDING", "HELD", "RELEASED", "REFUNDED"],
    })
      .notNull()
      .default("PENDING"),
    escrowHeldAt: text("escrow_held_at"),
    completedAt: text("completed_at"),
    autoReleaseAt: text("auto_release_at"),
    disputeOpen: integer("dispute_open", { mode: "boolean" })
      .notNull()
      .default(false),
    releasedAt: text("released_at"),
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
      .default("PREVISTO"),
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
