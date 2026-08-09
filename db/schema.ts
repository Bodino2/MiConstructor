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

export const professionalBillingAccounts = sqliteTable("professional_billing_accounts", {
  professionalEmail: text("professional_email").primaryKey(),
  status: text("status", {
    enum: ["PENDIENTE_MANDATO", "ACTIVO", "SUSPENDIDO_IMPAGO"],
  })
    .notNull()
    .default("PENDIENTE_MANDATO"),
  paymentProvider: text("payment_provider").notNull().default("STRIPE"),
  paymentCustomerRef: text("payment_customer_ref"),
  directDebitMandateRef: text("direct_debit_mandate_ref"),
  unbilledBalanceCents: integer("unbilled_balance_cents").notNull().default(0),
  overdueBalanceCents: integer("overdue_balance_cents").notNull().default(0),
  lastInvoicedAt: text("last_invoiced_at"),
  suspendedAt: text("suspended_at"),
  suspensionReason: text("suspension_reason"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const weeklyInvoices = sqliteTable(
  "weekly_invoices",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    professionalEmail: text("professional_email").notNull(),
    periodStart: text("period_start").notNull(),
    periodEnd: text("period_end").notNull(),
    subtotalCents: integer("subtotal_cents").notNull(),
    totalCents: integer("total_cents").notNull(),
    status: text("status", {
      enum: ["PENDIENTE_COBRO", "PAGADA", "FALLIDA"],
    })
      .notNull()
      .default("PENDIENTE_COBRO"),
    paymentProvider: text("payment_provider").notNull().default("STRIPE"),
    paymentProviderRef: text("payment_provider_ref"),
    failureReason: text("failure_reason"),
    collectionRequestedAt: text("collection_requested_at"),
    paidAt: text("paid_at"),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    uniqueIndex("weekly_invoices_professional_period_idx").on(
      table.professionalEmail,
      table.periodStart,
      table.periodEnd,
    ),
  ],
);

export const professionalBillableItems = sqliteTable(
  "professional_billable_items",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    professionalEmail: text("professional_email").notNull(),
    shortlistId: integer("shortlist_id").notNull(),
    invoiceId: integer("invoice_id"),
    description: text("description").notNull(),
    amountCents: integer("amount_cents").notNull(),
    status: text("status", {
      enum: ["PENDIENTE", "FACTURADO", "PAGADO", "FALLIDO"],
    })
      .notNull()
      .default("PENDIENTE"),
    serviceDate: text("service_date").notNull(),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    uniqueIndex("professional_billable_items_shortlist_idx").on(table.shortlistId),
  ],
);

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
    chargeMethod: text("charge_method", {
      enum: ["CREDITS", "STRIPE", "DIRECT_DEBIT"],
    }),
    paymentStatus: text("payment_status", {
      enum: [
        "PENDIENTE",
        "PENDIENTE_FACTURA",
        "FACTURADO",
        "PAGADO",
        "FALLIDO",
        "REEMBOLSADO",
      ],
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

export const professionalPortfolioProjects = sqliteTable(
  "professional_portfolio_projects",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    professionalEmail: text("professional_email").notNull(),
    title: text("title").notNull(),
    description: text("description").notNull().default(""),
    category: text("category").notNull(),
    location: text("location").notNull(),
    completionYear: integer("completion_year"),
    status: text("status", { enum: ["PENDIENTE", "PUBLICADO", "RECHAZADO"] })
      .notNull()
      .default("PENDIENTE"),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
);

export const professionalPortfolioImages = sqliteTable(
  "professional_portfolio_images",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    portfolioProjectId: integer("portfolio_project_id").notNull(),
    professionalEmail: text("professional_email").notNull(),
    phase: text("phase", { enum: ["ANTES", "DESPUES"] }).notNull(),
    objectKey: text("object_key").notNull(),
    contentType: text("content_type").notNull(),
    sizeBytes: integer("size_bytes").notNull(),
    altText: text("alt_text").notNull(),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [uniqueIndex("professional_portfolio_images_object_key_idx").on(table.objectKey)],
);

export const structuredQuotes = sqliteTable(
  "structured_quotes",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    projectId: integer("project_id").notNull(),
    professionalEmail: text("professional_email").notNull(),
    title: text("title").notNull(),
    notes: text("notes").notNull().default(""),
    subtotalCents: integer("subtotal_cents").notNull(),
    taxCents: integer("tax_cents").notNull(),
    totalCents: integer("total_cents").notNull(),
    validUntil: text("valid_until").notNull(),
    status: text("status", {
      enum: ["BORRADOR", "ENVIADO", "ACEPTADO", "RECHAZADO", "EXPIRADO"],
    })
      .notNull()
      .default("BORRADOR"),
    acceptedAt: text("accepted_at"),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    uniqueIndex("structured_quotes_project_professional_idx").on(
      table.projectId,
      table.professionalEmail,
    ),
  ],
);

export const structuredQuoteItems = sqliteTable("structured_quote_items", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  quoteId: integer("quote_id").notNull(),
  category: text("category", {
    enum: ["MANO_OBRA", "MATERIALES", "TRANSPORTE", "RESIDUOS", "OTROS"],
  }).notNull(),
  description: text("description").notNull(),
  quantityMilli: integer("quantity_milli").notNull(),
  unit: text("unit").notNull(),
  unitPriceCents: integer("unit_price_cents").notNull(),
  totalCents: integer("total_cents").notNull(),
  sortOrder: integer("sort_order").notNull().default(0),
});

export const workContracts = sqliteTable(
  "work_contracts",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    projectId: integer("project_id").notNull(),
    quoteId: integer("quote_id").notNull(),
    clientEmail: text("client_email").notNull(),
    professionalEmail: text("professional_email").notNull(),
    templateVersion: text("template_version").notNull(),
    objectKey: text("object_key").notNull(),
    documentSha256: text("document_sha256").notNull(),
    status: text("status", { enum: ["BORRADOR", "PENDIENTE_FIRMA", "FIRMADO"] })
      .notNull()
      .default("PENDIENTE_FIRMA"),
    clientAcceptedAt: text("client_accepted_at"),
    professionalAcceptedAt: text("professional_accepted_at"),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [uniqueIndex("work_contracts_project_idx").on(table.projectId)],
);

export const milestoneEvidence = sqliteTable("milestone_evidence", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  milestoneId: integer("milestone_id").notNull(),
  projectId: integer("project_id").notNull(),
  professionalEmail: text("professional_email").notNull(),
  mediaType: text("media_type", { enum: ["FOTO", "VIDEO"] }).notNull(),
  objectKey: text("object_key").notNull(),
  contentType: text("content_type").notNull(),
  sizeBytes: integer("size_bytes").notNull(),
  description: text("description").notNull(),
  capturedAt: text("captured_at"),
  reviewStatus: text("review_status", {
    enum: ["PENDIENTE", "ACEPTADA", "RECHAZADA"],
  })
    .notNull()
    .default("PENDIENTE"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const propertyPassportEntries = sqliteTable("property_passport_entries", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  projectId: integer("project_id").notNull(),
  milestoneId: integer("milestone_id"),
  authorEmail: text("author_email").notNull(),
  category: text("category", {
    enum: ["INSTALACIONES", "MATERIALES", "PLANOS", "GARANTIAS", "MANTENIMIENTO"],
  }).notNull(),
  title: text("title").notNull(),
  description: text("description").notNull(),
  objectKey: text("object_key"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const bilateralReviews = sqliteTable(
  "bilateral_reviews",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    projectId: integer("project_id").notNull(),
    authorEmail: text("author_email").notNull(),
    subjectEmail: text("subject_email").notNull(),
    direction: text("direction", {
      enum: ["CLIENTE_A_PROFESIONAL", "PROFESIONAL_A_CLIENTE"],
    }).notNull(),
    rating: integer("rating").notNull(),
    comment: text("comment").notNull(),
    sealedUntil: text("sealed_until").notNull(),
    status: text("status", { enum: ["SELLADA", "PUBLICADA", "OCULTA"] })
      .notNull()
      .default("SELLADA"),
    publishedAt: text("published_at"),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    uniqueIndex("bilateral_reviews_project_author_idx").on(
      table.projectId,
      table.authorEmail,
    ),
  ],
);

export const professionalInsurancePolicies = sqliteTable(
  "professional_insurance_policies",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    professionalEmail: text("professional_email").notNull(),
    insurer: text("insurer").notNull(),
    policyNumberMasked: text("policy_number_masked").notNull(),
    coverageCents: integer("coverage_cents").notNull(),
    validFrom: text("valid_from").notNull(),
    validUntil: text("valid_until").notNull(),
    objectKey: text("object_key").notNull(),
    verificationStatus: text("verification_status", {
      enum: ["PENDIENTE", "APROBADA", "RECHAZADA", "EXPIRADA"],
    })
      .notNull()
      .default("PENDIENTE"),
    reviewedAt: text("reviewed_at"),
    reviewedBy: text("reviewed_by"),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
);

export const professionalServiceAreas = sqliteTable(
  "professional_service_areas",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    professionalEmail: text("professional_email").notNull(),
    serviceSlug: text("service_slug").notNull(),
    citySlug: text("city_slug").notNull(),
    cityName: text("city_name").notNull(),
    provinceName: text("province_name").notNull(),
    active: integer("active", { mode: "boolean" }).notNull().default(true),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    uniqueIndex("professional_service_areas_unique_idx").on(
      table.professionalEmail,
      table.serviceSlug,
      table.citySlug,
    ),
  ],
);

export const projectInsuranceSelections = sqliteTable("project_insurance_selections", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  projectId: integer("project_id").notNull(),
  clientEmail: text("client_email").notNull(),
  provider: text("provider"),
  rateBasisPoints: integer("rate_basis_points").notNull().default(150),
  premiumCents: integer("premium_cents"),
  status: text("status", {
    enum: ["NO_DISPONIBLE", "PENDIENTE", "ACTIVA", "CANCELADA"],
  })
    .notNull()
    .default("NO_DISPONIBLE"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const conversations = sqliteTable(
  "conversations",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    projectId: integer("project_id").notNull(),
    clientEmail: text("client_email").notNull(),
    professionalEmail: text("professional_email").notNull(),
    contactUnlockedAt: text("contact_unlocked_at"),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    uniqueIndex("conversations_project_participants_idx").on(
      table.projectId,
      table.clientEmail,
      table.professionalEmail,
    ),
  ],
);

export const conversationMessages = sqliteTable("conversation_messages", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  conversationId: integer("conversation_id").notNull(),
  senderEmail: text("sender_email").notNull(),
  messageType: text("message_type", { enum: ["TEXTO", "AUDIO"] }).notNull(),
  body: text("body"),
  audioObjectKey: text("audio_object_key"),
  blockedSensitiveData: integer("blocked_sensitive_data", { mode: "boolean" })
    .notNull()
    .default(false),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});
