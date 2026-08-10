CREATE TABLE `bilateral_reviews` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`project_id` integer NOT NULL,
	`author_email` text NOT NULL,
	`subject_email` text NOT NULL,
	`direction` text NOT NULL,
	`rating` integer NOT NULL,
	`comment` text NOT NULL,
	`sealed_until` text NOT NULL,
	`status` text DEFAULT 'SELLADA' NOT NULL,
	`published_at` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `bilateral_reviews_project_author_idx` ON `bilateral_reviews` (`project_id`,`author_email`);--> statement-breakpoint
CREATE TABLE `conversation_messages` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`conversation_id` integer NOT NULL,
	`sender_email` text NOT NULL,
	`message_type` text NOT NULL,
	`body` text,
	`audio_object_key` text,
	`blocked_sensitive_data` integer DEFAULT false NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE `conversations` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`project_id` integer NOT NULL,
	`client_email` text NOT NULL,
	`professional_email` text NOT NULL,
	`contact_unlocked_at` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `conversations_project_participants_idx` ON `conversations` (`project_id`,`client_email`,`professional_email`);--> statement-breakpoint
CREATE TABLE `milestone_evidence` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`milestone_id` integer NOT NULL,
	`project_id` integer NOT NULL,
	`professional_email` text NOT NULL,
	`media_type` text NOT NULL,
	`object_key` text NOT NULL,
	`content_type` text NOT NULL,
	`size_bytes` integer NOT NULL,
	`description` text NOT NULL,
	`captured_at` text,
	`review_status` text DEFAULT 'PENDIENTE' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE `professional_billable_items` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`professional_email` text NOT NULL,
	`shortlist_id` integer NOT NULL,
	`invoice_id` integer,
	`description` text NOT NULL,
	`amount_cents` integer NOT NULL,
	`status` text DEFAULT 'PENDIENTE' NOT NULL,
	`service_date` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `professional_billable_items_shortlist_idx` ON `professional_billable_items` (`shortlist_id`);--> statement-breakpoint
CREATE TABLE `professional_billing_accounts` (
	`professional_email` text PRIMARY KEY NOT NULL,
	`status` text DEFAULT 'PENDIENTE_MANDATO' NOT NULL,
	`payment_provider` text DEFAULT 'STRIPE' NOT NULL,
	`payment_customer_ref` text,
	`direct_debit_mandate_ref` text,
	`unbilled_balance_cents` integer DEFAULT 0 NOT NULL,
	`overdue_balance_cents` integer DEFAULT 0 NOT NULL,
	`last_invoiced_at` text,
	`suspended_at` text,
	`suspension_reason` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE `professional_insurance_policies` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`professional_email` text NOT NULL,
	`insurer` text NOT NULL,
	`policy_number_masked` text NOT NULL,
	`coverage_cents` integer NOT NULL,
	`valid_from` text NOT NULL,
	`valid_until` text NOT NULL,
	`object_key` text NOT NULL,
	`verification_status` text DEFAULT 'PENDIENTE' NOT NULL,
	`reviewed_at` text,
	`reviewed_by` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE `professional_portfolio_images` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`portfolio_project_id` integer NOT NULL,
	`professional_email` text NOT NULL,
	`phase` text NOT NULL,
	`object_key` text NOT NULL,
	`content_type` text NOT NULL,
	`size_bytes` integer NOT NULL,
	`alt_text` text NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `professional_portfolio_images_object_key_idx` ON `professional_portfolio_images` (`object_key`);--> statement-breakpoint
CREATE TABLE `professional_portfolio_projects` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`professional_email` text NOT NULL,
	`title` text NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`category` text NOT NULL,
	`location` text NOT NULL,
	`completion_year` integer,
	`status` text DEFAULT 'PENDIENTE' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE `professional_service_areas` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`professional_email` text NOT NULL,
	`service_slug` text NOT NULL,
	`city_slug` text NOT NULL,
	`city_name` text NOT NULL,
	`province_name` text NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `professional_service_areas_unique_idx` ON `professional_service_areas` (`professional_email`,`service_slug`,`city_slug`);--> statement-breakpoint
CREATE TABLE `project_insurance_selections` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`project_id` integer NOT NULL,
	`client_email` text NOT NULL,
	`provider` text,
	`rate_basis_points` integer DEFAULT 150 NOT NULL,
	`premium_cents` integer,
	`status` text DEFAULT 'NO_DISPONIBLE' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE `property_passport_entries` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`project_id` integer NOT NULL,
	`milestone_id` integer,
	`author_email` text NOT NULL,
	`category` text NOT NULL,
	`title` text NOT NULL,
	`description` text NOT NULL,
	`object_key` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE `structured_quote_items` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`quote_id` integer NOT NULL,
	`category` text NOT NULL,
	`description` text NOT NULL,
	`quantity_milli` integer NOT NULL,
	`unit` text NOT NULL,
	`unit_price_cents` integer NOT NULL,
	`total_cents` integer NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE `structured_quotes` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`project_id` integer NOT NULL,
	`professional_email` text NOT NULL,
	`title` text NOT NULL,
	`notes` text DEFAULT '' NOT NULL,
	`subtotal_cents` integer NOT NULL,
	`tax_cents` integer NOT NULL,
	`total_cents` integer NOT NULL,
	`valid_until` text NOT NULL,
	`status` text DEFAULT 'BORRADOR' NOT NULL,
	`accepted_at` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `structured_quotes_project_professional_idx` ON `structured_quotes` (`project_id`,`professional_email`);--> statement-breakpoint
CREATE TABLE `weekly_invoices` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`professional_email` text NOT NULL,
	`period_start` text NOT NULL,
	`period_end` text NOT NULL,
	`subtotal_cents` integer NOT NULL,
	`total_cents` integer NOT NULL,
	`status` text DEFAULT 'PENDIENTE_COBRO' NOT NULL,
	`payment_provider` text DEFAULT 'STRIPE' NOT NULL,
	`payment_provider_ref` text,
	`failure_reason` text,
	`collection_requested_at` text,
	`paid_at` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `weekly_invoices_professional_period_idx` ON `weekly_invoices` (`professional_email`,`period_start`,`period_end`);--> statement-breakpoint
CREATE TABLE `work_contracts` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`project_id` integer NOT NULL,
	`quote_id` integer NOT NULL,
	`client_email` text NOT NULL,
	`professional_email` text NOT NULL,
	`template_version` text NOT NULL,
	`object_key` text NOT NULL,
	`document_sha256` text NOT NULL,
	`status` text DEFAULT 'PENDIENTE_FIRMA' NOT NULL,
	`client_accepted_at` text,
	`professional_accepted_at` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `work_contracts_project_idx` ON `work_contracts` (`project_id`);