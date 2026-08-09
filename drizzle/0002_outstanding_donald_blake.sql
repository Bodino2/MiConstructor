CREATE TABLE `credit_transactions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`professional_email` text NOT NULL,
	`shortlist_id` integer,
	`type` text NOT NULL,
	`amount_cents` integer NOT NULL,
	`status` text DEFAULT 'COMPLETADO' NOT NULL,
	`payment_provider` text,
	`payment_provider_ref` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE `professional_credit_accounts` (
	`professional_email` text PRIMARY KEY NOT NULL,
	`balance_cents` integer DEFAULT 0 NOT NULL,
	`auto_charge_enabled` integer DEFAULT false NOT NULL,
	`payment_customer_ref` text,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE `project_shortlists` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`project_id` integer NOT NULL,
	`client_email` text NOT NULL,
	`professional_email` text NOT NULL,
	`project_budget_cents` integer NOT NULL,
	`fee_cents` integer NOT NULL,
	`pricing_version` text NOT NULL,
	`charge_method` text,
	`payment_status` text DEFAULT 'PENDIENTE' NOT NULL,
	`payment_provider_ref` text,
	`contact_unlocked_at` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `project_shortlists_project_professional_idx` ON `project_shortlists` (`project_id`,`professional_email`);--> statement-breakpoint
ALTER TABLE `users` ADD `phone` text;--> statement-breakpoint
ALTER TABLE `users` ADD `professional_specialty` text;--> statement-breakpoint
ALTER TABLE `users` ADD `verification_status` text DEFAULT 'NO_APLICA' NOT NULL;--> statement-breakpoint
ALTER TABLE `users` ADD `knowledge_assessment_version` text;--> statement-breakpoint
ALTER TABLE `users` ADD `knowledge_assessment_score` integer;--> statement-breakpoint
ALTER TABLE `users` ADD `knowledge_assessment_passed_at` text;--> statement-breakpoint
ALTER TABLE `users` ADD `verification_reviewed_at` text;--> statement-breakpoint
ALTER TABLE `users` ADD `verification_reviewed_by` text;--> statement-breakpoint
ALTER TABLE `users` ADD `verification_reason` text;