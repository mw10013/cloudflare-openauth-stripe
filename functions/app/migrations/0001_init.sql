-- Migration number: 0001 	 2025-01-31T00:42:00.000Z
create table roles (roleId text primary key);

--> statement-breakpoint
insert into
	roles (roleId)
values
	('customer'),
	('admin');

--> statement-breakpoint
create table accountMemberRoles (accountMemberRoleId text primary key);

--> statement-breakpoint
insert into
	accountMemberRoles (accountMemberRoleId)
values
	('owner'),
	('member');

--> statement-breakpoint
create table accountMembers (
	accountMemberId integer primary key,
	userId integer not null references users (userId),
	accountId integer not null references accounts (accountId),
	accountMemberRole text not null references accountMemberRoles (accountMemberRoleId),
	joinedAt text not null default (datetime('now'))
);

--> statement-breakpoint
create table accounts (
	accountId integer primary key,
	userId integer unique not null references users (userId),
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
	role text not null default 'customer' references roles (roleId),
	createdAt text not null default (datetime('now')),
	updatedAt text not null default (datetime('now')),
	deletedAt text
);

--> statement-breakpoint
create table invitations (
	invitationId integer primary key,
	accountId integer not null references accounts (accountId),
	email text not null,
	role text not null,
	invitedBy integer not null references users (userId),
	invitedAt text not null default (datetime('now')),
	status text not null default 'pending'
);

--> statement-breakpoint
insert into
	users (name, email, role)
values
	('Admin (motio)', 'motio@mail.com', 'admin'),
	('Admin (a)', 'a@a.com', 'admin'),
	('Motio1 (owner)', 'motio1@mail.com', 'customer'),
	('Motio2 (member)', 'motio2@mail.com', 'customer'),
	('User (owner)', 'u@u.com', 'customer'),
	('User1 (member)', 'u1@u.com', 'customer');

--> statement-breakpoint
insert into accounts (userId) values ((select userId from users where email = 'motio@mail.com'));

--> statement-breakpoint
with
	account as materialized (
		select
			accountId
		from
			accounts
		where
			accountId = last_insert_rowid()
	)
insert into
	accountMembers (userId, accountId, accountMemberRole)
values
	(
		(
			select
				userId
			from
				users
			where
				email = 'motio1@mail.com'
		),
		(
			select
				accountId
			from
				account
		),
		'owner'
	),
	(
		(
			select
				userId
			from
				users
			where
				email = 'motio1@mail.com'
		),
		(
			select
				accountId
			from
				account
		),
		'member'
	);

--> statement-breakpoint
insert into
	accounts (userId)
values
	((select userId from users where email = 'motio1@mail.com'));

--> statement-breakpoint
with
	account as materialized (
		select
			accountId
		from
			accounts
		where
			accountId = last_insert_rowid()
	)
insert into
	accountMembers (userId, accountId, accountMemberRole)
values
	(
		(
			select
				userId
			from
				users
			where
				email = 'motio2@mail.com'
		),
		(
			select
				accountId
			from
				account
		),
		'owner'
	);

--> statement-breakpoint
insert into
	accounts (userId)
values
	((select userId from users where email = 'u@u.com'));

--> statement-breakpoint
with
	account as materialized (
		select
			accountId
		from
			accounts
		where
			accountId = last_insert_rowid()
	)
insert into
	accountMembers (userId, accountId, accountMemberRole)
values
	(
		(
			select
				userId
			from
				users
			where
				email = 'u@u.com'
		),
		(
			select
				accountId
			from
				account
		),
		'owner'
	),
	(
		(
			select
				userId
			from
				users
			where
				email = 'u1@u.com'
		),
		(
			select
				accountId
			from
				account
		),
		'member'
	);

--> statement-breakpoint
insert into
	accounts (userId)
values
	((select userId from users where email = 'u1@u.com'));

--> statement-breakpoint
with
	account as materialized (
		select
			accountId
		from
			accounts
		where
			accountId = last_insert_rowid()
	)
insert into
	accountMembers (userId, accountId, accountMemberRole)
values
	(
		(
			select
				userId
			from
				users
			where
				email = 'u1@u.com'
		),
		(
			select
				accountId
			from
				account
		),
		'owner'
	);
