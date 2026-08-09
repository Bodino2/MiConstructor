CREATE TABLE `professional_specialty_qualifications` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`professional_email` text NOT NULL,
	`specialty_slug` text NOT NULL,
	`specialty_label` text NOT NULL,
	`is_primary` integer DEFAULT false NOT NULL,
	`assessment_version` text NOT NULL,
	`question_count` integer NOT NULL,
	`score` integer NOT NULL,
	`passed_at` text NOT NULL,
	`verification_status` text DEFAULT 'PENDIENTE_REVISION' NOT NULL,
	`reviewed_at` text,
	`reviewed_by` text,
	`review_reason` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `professional_specialty_qualifications_unique_idx` ON `professional_specialty_qualifications` (`professional_email`,`specialty_slug`);