-- Migration number: 0001 	 2025-01-31T00:42:00.000Z
create table userTypes (userTypeId text primary key);

--> statement-breakpoint
insert into
	userTypes (userTypeId)
values
	('customer'),
	('staffer');

--> statement-breakpoint
create table accountMembers (
	accountMemberId integer primary key,
	userId integer not null references users (userId),
	accountId integer not null references accounts (accountId),
	unique (userId, accountId)
);

--> statement-breakpoint
create table accounts (
	accountId integer primary key,
	userId integer unique not null references users (userId),
	stripeCustomerId text unique,
	stripeSubscriptionId text unique,
	stripeProductId text,
	planName text,
	subscriptionStatus text,
	createdAt text not null default (datetime('now')),
	updatedAt text not null default (datetime('now'))
);

--> statement-breakpoint
create table users (
	userId integer primary key,
	name text not null default '',
	email text not null unique,
	userType text not null default 'customer' references userTypes (userTypeId),
	createdAt text not null default (datetime('now')),
	updatedAt text not null default (datetime('now'))
);

--> statement-breakpoint
create table invitations (
	invitationId integer primary key,
	accountId integer not null references accounts (accountId),
	email text not null,
	invitedBy integer not null references users (userId),
	invitedAt text not null default (datetime('now')),
	status text not null default 'pending'
);

--> statement-breakpoint
insert into
	users (name, email, userType)
values
	('Admin (motio)', 'motio@mail.com', 'staffer'),
	('Admin (a)', 'a@a.com', 'staffer');
