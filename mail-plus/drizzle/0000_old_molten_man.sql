CREATE TABLE `mail_settings` (
	`owner` text PRIMARY KEY NOT NULL,
	`client_id` text DEFAULT '' NOT NULL
);
--> statement-breakpoint
CREATE TABLE `mail_tasks` (
	`id` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`title` text NOT NULL,
	`url` text,
	`due` text,
	`done` integer DEFAULT 0 NOT NULL,
	`created` text NOT NULL
);
