ALTER TABLE `players` ADD `score` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `players` ADD `revives` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `rooms` ADD `last_hit_by` text;--> statement-breakpoint
ALTER TABLE `rooms` ADD `last_hit_target` text;--> statement-breakpoint
ALTER TABLE `rooms` ADD `last_hit_damage` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `rooms` ADD `last_hit_at` integer DEFAULT 0 NOT NULL;