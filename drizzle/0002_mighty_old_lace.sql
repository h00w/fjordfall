ALTER TABLE `players` ADD `ready` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `players` ADD `direction` text DEFAULT 'right' NOT NULL;--> statement-breakpoint
ALTER TABLE `players` ADD `revive_target` text;--> statement-breakpoint
ALTER TABLE `players` ADD `revive_started_at` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `rooms` ADD `host_id` text;--> statement-breakpoint
ALTER TABLE `rooms` ADD `status` text DEFAULT 'lobby' NOT NULL;--> statement-breakpoint
ALTER TABLE `rooms` ADD `mode` text DEFAULT 'expedition' NOT NULL;--> statement-breakpoint
ALTER TABLE `rooms` ADD `difficulty` text DEFAULT 'slow' NOT NULL;--> statement-breakpoint
ALTER TABLE `rooms` ADD `slots` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `rooms` ADD `enemy_x` integer DEFAULT 72 NOT NULL;--> statement-breakpoint
ALTER TABLE `rooms` ADD `enemy_y` integer DEFAULT 50 NOT NULL;--> statement-breakpoint
ALTER TABLE `rooms` ADD `last_tick_at` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `rooms` ADD `round` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `rooms` ADD `winner_id` text;--> statement-breakpoint
ALTER TABLE `rooms` ADD `event_seq` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `rooms` ADD `message` text DEFAULT '' NOT NULL;