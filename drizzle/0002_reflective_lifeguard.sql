PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_milestones` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`project_id` integer NOT NULL,
	`position` integer NOT NULL,
	`title` text NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`amount_cents` integer NOT NULL,
	`status` text DEFAULT 'PREVISTO' NOT NULL,
	`due_date` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
INSERT INTO `__new_milestones`("id", "project_id", "position", "title", "description", "amount_cents", "status", "due_date", "created_at", "updated_at") SELECT "id", "project_id", "position", "title", "description", "amount_cents", "status", "due_date", "created_at", "updated_at" FROM `milestones`;--> statement-breakpoint
DROP TABLE `milestones`;--> statement-breakpoint
ALTER TABLE `__new_milestones` RENAME TO `milestones`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `milestones_project_position_idx` ON `milestones` (`project_id`,`position`);--> statement-breakpoint
ALTER TABLE `projects` ADD `requires_guarantee` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `projects` ADD `guarantee_charge_status` text DEFAULT 'NOT_REQUIRED' NOT NULL;--> statement-breakpoint
ALTER TABLE `projects` ADD `escrow_status` text DEFAULT 'PENDING' NOT NULL;--> statement-breakpoint
ALTER TABLE `projects` ADD `escrow_held_at` text;--> statement-breakpoint
ALTER TABLE `projects` ADD `completed_at` text;--> statement-breakpoint
ALTER TABLE `projects` ADD `auto_release_at` text;--> statement-breakpoint
ALTER TABLE `projects` ADD `dispute_open` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `projects` ADD `released_at` text;