CREATE TABLE `players` (
	`id` text PRIMARY KEY NOT NULL,
	`room_code` text NOT NULL,
	`token` text NOT NULL,
	`name` text NOT NULL,
	`x` integer DEFAULT 18 NOT NULL,
	`y` integer DEFAULT 50 NOT NULL,
	`hp` integer DEFAULT 10 NOT NULL,
	`strikes` integer DEFAULT 0 NOT NULL,
	`last_attack_at` integer DEFAULT 0 NOT NULL,
	`last_move_at` integer DEFAULT 0 NOT NULL,
	`seen_at` integer NOT NULL,
	FOREIGN KEY (`room_code`) REFERENCES `rooms`(`code`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `players_token_unique` ON `players` (`token`);--> statement-breakpoint
CREATE TABLE `rooms` (
	`code` text PRIMARY KEY NOT NULL,
	`stage` integer DEFAULT 0 NOT NULL,
	`hp` integer DEFAULT 12 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
