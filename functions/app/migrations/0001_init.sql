-- Migration number: 0001 	 2025-01-31T00:42:00.000Z
create table activityLogs (
	id integer primary key,
	teamId integer not null references teams (id),
	userId integer references users (id),
	action text not null,
	timestamp text not null default (datetime('now')),
	ipAddress text
);

--> statement-breakpoint
create table invitations (
	id integer primary key,
	teamId integer not null references teams (id),
	email text not null,
	role text not null,
	invitedBy integer not null references users (id),
	invitedAt text not null default (datetime('now')),
	status text not null default 'pending'
);

--> statement-breakpoint
create table teamMembers (
	id integer primary key,
	userId integer not null references users (id),
	teamId integer not null references teams (id),
	role text not null,
	joinedAt text not null default (datetime('now'))
);

--> statement-breakpoint
create table teams (
	id integer primary key,
	name text not null,
	createdAt text not null default (datetime('now')),
	updatedAt text not null default (datetime('now')),
	stripeCustomerId text unique,
	stripeSubscriptionId text unique,
	stripeProductId text,
	planName text,
	subscriptionStatus text
);

--> statement-breakpoint
create table users (
	id integer primary key,
	name text not null default '',
	email text not null unique,
	role text not null default 'member',
	createdAt text not null default (datetime('now')),
	updatedAt text not null default (datetime('now')),
	deletedAt text
);
