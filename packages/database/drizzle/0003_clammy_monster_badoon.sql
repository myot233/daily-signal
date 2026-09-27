CREATE TABLE `provider_checks` (
	`id` text PRIMARY KEY NOT NULL,
	`provider_id` text NOT NULL,
	`model_id` text,
	`config_revision` integer NOT NULL,
	`stage` text NOT NULL,
	`status` text NOT NULL,
	`latency_ms` integer NOT NULL,
	`checked_at` text NOT NULL,
	`safe_error` text,
	FOREIGN KEY (`provider_id`) REFERENCES `providers`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `provider_checks_provider` ON `provider_checks` (`provider_id`,`checked_at`);--> statement-breakpoint
CREATE TABLE `provider_credentials` (
	`provider_id` text PRIMARY KEY NOT NULL,
	`api_key` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`provider_id`) REFERENCES `providers`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `provider_models` (
	`id` text PRIMARY KEY NOT NULL,
	`provider_id` text NOT NULL,
	`model_id` text NOT NULL,
	`display_name` text,
	`enabled` integer DEFAULT true NOT NULL,
	`capabilities` text NOT NULL,
	`options` text NOT NULL,
	`source` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`provider_id`) REFERENCES `providers`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `provider_models_provider_model` ON `provider_models` (`provider_id`,`model_id`);--> statement-breakpoint
CREATE INDEX `provider_models_provider` ON `provider_models` (`provider_id`);--> statement-breakpoint
CREATE TABLE `providers` (
	`id` text PRIMARY KEY NOT NULL,
	`preset_id` text NOT NULL,
	`name` text NOT NULL,
	`protocol` text NOT NULL,
	`base_url` text NOT NULL,
	`enabled` integer DEFAULT true NOT NULL,
	`options` text NOT NULL,
	`revision` integer DEFAULT 1 NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
ALTER TABLE `digests` ADD `provider_id` text;--> statement-breakpoint
ALTER TABLE `digests` ADD `provider_name` text;--> statement-breakpoint
ALTER TABLE `digests` ADD `provider_protocol` text;--> statement-breakpoint
ALTER TABLE `digests` ADD `provider_model_id` text;--> statement-breakpoint
ALTER TABLE `digests` ADD `provider_options` text;--> statement-breakpoint
ALTER TABLE `settings` ADD `default_provider_model_id` text REFERENCES provider_models(id) ON DELETE SET NULL;--> statement-breakpoint
INSERT INTO `providers` (`id`, `preset_id`, `name`, `protocol`, `base_url`, `enabled`, `options`, `revision`, `created_at`, `updated_at`)
SELECT
	'00000000-0000-4000-8000-000000000001',
	CASE
		WHEN json_extract(`value`, '$.baseUrl') = 'https://api.deepseek.com' OR json_extract(`value`, '$.baseUrl') LIKE 'https://api.deepseek.com/%' THEN 'deepseek'
		WHEN json_extract(`value`, '$.baseUrl') = 'https://api.openai.com' OR json_extract(`value`, '$.baseUrl') LIKE 'https://api.openai.com/%' THEN 'openai'
		ELSE 'custom'
	END,
	CASE
		WHEN json_extract(`value`, '$.baseUrl') = 'https://api.deepseek.com' OR json_extract(`value`, '$.baseUrl') LIKE 'https://api.deepseek.com/%' THEN 'DeepSeek · 已迁移'
		WHEN json_extract(`value`, '$.baseUrl') = 'https://api.openai.com' OR json_extract(`value`, '$.baseUrl') LIKE 'https://api.openai.com/%' THEN 'OpenAI · 已迁移'
		ELSE '旧连接 · 已迁移'
	END,
	'openai-chat-completions',
	json_extract(`value`, '$.baseUrl'),
	1,
	json_object(
		'timeoutMs', 120000,
		'maxOutputTokens', CASE WHEN COALESCE(json_extract(`value`, '$.deepseekThinking'), 'disabled') = 'enabled' THEN 16384 ELSE 6000 END,
		'deepseekThinking', COALESCE(json_extract(`value`, '$.deepseekThinking'), 'disabled')
	),
	1,
	strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
	strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
FROM `settings` WHERE `id` = 1;--> statement-breakpoint
INSERT INTO `provider_models` (`id`, `provider_id`, `model_id`, `display_name`, `enabled`, `capabilities`, `options`, `source`, `created_at`, `updated_at`)
SELECT
	'00000000-0000-4000-8000-000000000002',
	'00000000-0000-4000-8000-000000000001',
	json_extract(`value`, '$.model'),
	NULL,
	1,
	json_object('vision', NULL, 'reasoning', NULL, 'contextWindow', NULL),
	json_object(),
	'migration',
	strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
	strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
FROM `settings` WHERE `id` = 1;--> statement-breakpoint
INSERT INTO `provider_credentials` (`provider_id`, `api_key`, `updated_at`)
SELECT
	'00000000-0000-4000-8000-000000000001',
	`api_key`,
	strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
FROM `settings` WHERE `id` = 1 AND `api_key` IS NOT NULL;--> statement-breakpoint
UPDATE `settings`
SET `default_provider_model_id` = '00000000-0000-4000-8000-000000000002', `api_key` = NULL
WHERE `id` = 1;
