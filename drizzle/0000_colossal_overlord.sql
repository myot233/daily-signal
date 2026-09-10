CREATE TABLE `articles` (
	`id` text PRIMARY KEY NOT NULL,
	`feed_id` text NOT NULL,
	`title` text NOT NULL,
	`url` text NOT NULL,
	`content` text NOT NULL,
	`published_at` text NOT NULL,
	`date_estimated` integer DEFAULT false NOT NULL,
	FOREIGN KEY (`feed_id`) REFERENCES `feeds`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `articles_feed_url` ON `articles` (`feed_id`,`url`);--> statement-breakpoint
CREATE INDEX `articles_date` ON `articles` (`published_at`);--> statement-breakpoint
CREATE TABLE `digests` (
	`id` text PRIMARY KEY NOT NULL,
	`date` text NOT NULL,
	`title` text NOT NULL,
	`markdown` text NOT NULL,
	`created_at` text NOT NULL,
	`article_count` integer NOT NULL,
	`model` text NOT NULL,
	`sources` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `feeds` (
	`id` text PRIMARY KEY NOT NULL,
	`url` text NOT NULL,
	`title` text NOT NULL,
	`category` text DEFAULT '' NOT NULL,
	`site_url` text DEFAULT '' NOT NULL,
	`created_at` text NOT NULL,
	`last_fetched_at` text,
	`error` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `feeds_url_unique` ON `feeds` (`url`);--> statement-breakpoint
CREATE TABLE `settings` (
	`id` integer PRIMARY KEY NOT NULL,
	`value` text NOT NULL
);
