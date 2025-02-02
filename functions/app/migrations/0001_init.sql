-- Migration number: 0001 	 2025-01-31T00:42:00.000Z
create table activityLogs (
	activityLogId integer primary key,
	teamId integer not null references teams (teamId),
	userId integer references users (userId),
	action text not null,
	timestamp text not null default (datetime('now')),
	ipAddress text
);

--> statement-breakpoint
create table invitations (
	invitationId integer primary key,
	teamId integer not null references teams (teamId),
	email text not null,
	role text not null,
	invitedBy integer not null references users (userId),
	invitedAt text not null default (datetime('now')),
	status text not null default 'pending'
);

--> statement-breakpoint
create table teamMembers (
	teamMemberId integer primary key,
	userId integer not null references users (userId),
	teamId integer not null references teams (teamId),
	role text not null,
	joinedAt text not null default (datetime('now'))
);

--> statement-breakpoint
create table teams (
	teamId integer primary key,
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
	userId integer primary key,
	name text not null default '',
	email text not null unique,
	role text not null default 'member',
	createdAt text not null default (datetime('now')),
	updatedAt text not null default (datetime('now')),
	deletedAt text
);

--> statement-breakpoint
insert into
	users (name, email, role)
values
	('A', 'a@a.com', 'owner');

insert into
	teams (name)
values
	('A Team');

--> statement-breakpoint
insert into
	teamMembers (userId, teamId, role)
values
	(
		(
			select
				userId
			from
				users
			where
				email = 'a@a.com'
		),
		last_insert_rowid(),
		'owner'
	);
