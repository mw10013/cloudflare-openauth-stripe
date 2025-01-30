-- Migration number: 0001 	 2025-01-30T17:56:57.557Z
CREATE TABLE users (
	`userId` integer PRIMARY KEY,
	`email` text UNIQUE NOT NULL
);

--> statement-breakpoint
