ALTER TABLE `articles` ADD `read_at` text;--> statement-breakpoint
ALTER TABLE `articles` ADD `starred` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `feeds` ADD `custom_title` text;