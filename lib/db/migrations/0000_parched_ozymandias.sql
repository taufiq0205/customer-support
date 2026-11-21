CREATE TABLE `ai_request_log` (
	`id` text PRIMARY KEY NOT NULL,
	`conversation_id` text,
	`model_name` text NOT NULL,
	`requested_at` integer NOT NULL,
	`response_ms` integer,
	`success` integer NOT NULL,
	`error_message` text
);
--> statement-breakpoint
CREATE TABLE `assignment_rules` (
	`id` text PRIMARY KEY NOT NULL,
	`strategy` text NOT NULL,
	`manual_agent_id` text,
	`is_active` integer DEFAULT 1 NOT NULL,
	`updated_by` text,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`manual_agent_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `canned_responses` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`shortcode` text NOT NULL,
	`body` text NOT NULL,
	`created_by` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `canned_responses_shortcode_unique` ON `canned_responses` (`shortcode`);--> statement-breakpoint
CREATE TABLE `conversation_history` (
	`id` text PRIMARY KEY NOT NULL,
	`conversation_id` text NOT NULL,
	`from_status` text,
	`to_status` text NOT NULL,
	`changed_by` text,
	`reason` text,
	`changed_at` integer NOT NULL,
	FOREIGN KEY (`conversation_id`) REFERENCES `conversations`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`changed_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `conversations` (
	`id` text PRIMARY KEY NOT NULL,
	`external_id` text NOT NULL,
	`platform` text NOT NULL,
	`channel` text NOT NULL,
	`status` text DEFAULT 'open' NOT NULL,
	`snoozed_until` integer,
	`assigned_agent_id` text,
	`customer_name` text,
	`customer_identifier` text,
	`unread_count` integer DEFAULT 0 NOT NULL,
	`last_message_at` integer,
	`last_message_preview` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`assigned_agent_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `conversations_external_id_platform_unique` ON `conversations` (`external_id`,`platform`);--> statement-breakpoint
CREATE TABLE `messages` (
	`id` text PRIMARY KEY NOT NULL,
	`conversation_id` text NOT NULL,
	`external_id` text NOT NULL,
	`direction` text NOT NULL,
	`sender_name` text,
	`body` text NOT NULL,
	`has_attachment` integer DEFAULT 0 NOT NULL,
	`status` text NOT NULL,
	`sent_at` integer,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`conversation_id`) REFERENCES `conversations`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `messages_external_id_conversation_id_unique` ON `messages` (`external_id`,`conversation_id`);--> statement-breakpoint
CREATE TABLE `notifications` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`conversation_id` text NOT NULL,
	`type` text NOT NULL,
	`is_read` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`conversation_id`) REFERENCES `conversations`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `platform_configs` (
	`id` text PRIMARY KEY NOT NULL,
	`platform` text NOT NULL,
	`webhook_secret` text,
	`is_active` integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
CREATE TABLE `round_robin_state` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`last_assigned_agent_id` text,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`username` text NOT NULL,
	`password_hash` text NOT NULL,
	`display_name` text NOT NULL,
	`role` text NOT NULL,
	`created_at` integer NOT NULL,
	`is_active` integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_username_unique` ON `users` (`username`);--> statement-breakpoint
CREATE TABLE `webhook_log` (
	`id` text PRIMARY KEY NOT NULL,
	`platform` text NOT NULL,
	`received_at` integer NOT NULL,
	`verified` integer DEFAULT 0 NOT NULL,
	`processing_status` text,
	`error_message` text
);
