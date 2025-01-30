-- Migration number: 0001 	 2025-01-30T17:56:57.557Z
create table users (
	userId integer primary key,
	email text unique not null
);

--> statement-breakpoint
