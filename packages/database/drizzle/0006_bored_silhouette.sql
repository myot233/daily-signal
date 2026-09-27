CREATE TABLE `feed_icons` (
	`url` text PRIMARY KEY NOT NULL,
	`data_url` text,
	`next_fetch_at` integer NOT NULL
);
