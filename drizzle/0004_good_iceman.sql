CREATE TABLE `digest_generation_events` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`session_id` text NOT NULL,
	`event` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`session_id`) REFERENCES `digest_generation_sessions`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `digest_generation_events_session` ON `digest_generation_events` (`session_id`,`id`);--> statement-breakpoint
CREATE TABLE `digest_generation_sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`status` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `digest_generation_sessions_status` ON `digest_generation_sessions` (`status`,`updated_at`);