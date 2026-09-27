CREATE TABLE `article_analyses` (
	`key` text PRIMARY KEY NOT NULL,
	`article_id` text NOT NULL,
	`analysis` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`article_id`) REFERENCES `articles`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `article_analyses_article` ON `article_analyses` (`article_id`);--> statement-breakpoint
ALTER TABLE `digests` ADD `curation` text;