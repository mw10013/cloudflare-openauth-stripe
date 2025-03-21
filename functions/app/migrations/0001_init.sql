-- Migration number: 0001 	 2025-01-31T00:42:00.000Z
create table roles (roleId text primary key);

--> statement-breakpoint
insert into
	roles (roleId)
values
	('user'),
	('admin');

--> statement-breakpoint
create table teamMemberRoles (teamMemberRoleId text primary key);

--> statement-breakpoint
insert into
	teamMemberRoles (teamMemberRoleId)
values
	('owner'),
	('member');

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
	teamMemberRole text not null references teamMemberRoles (teamMemberRoleId),
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
	role text not null default 'user' references roles (roleId),
	createdAt text not null default (datetime('now')),
	updatedAt text not null default (datetime('now')),
	deletedAt text
);

--> statement-breakpoint
insert into
	users (name, email, role)
values
	('Admin (motio)', 'motio@mail.com', 'admin'),
	('Admin (a)', 'a@a.com', 'admin'),
	('Motio1 (owner)', 'motio1@mail.com', 'user'),
	('Motio2 (member)', 'motio2@mail.com', 'user'),
	('User (owner)', 'u@u.com', 'user'),
	('User1 (member)', 'u1@u.com', 'user');

--> statement-breakpoint
insert into
	teams (name)
values
	('M Team');

--> statement-breakpoint
with
	team as materialized (
		select
			teamId
		from
			teams
		where
			teamId = last_insert_rowid()
	)
insert into
	teamMembers (userId, teamId, teamMemberRole)
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
				teamId
			from
				team
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
				teamId
			from
				team
		),
		'member'
	);

--> statement-breakpoint
insert into
	teams (name)
values
	('M1 Team');

--> statement-breakpoint
with
	team as materialized (
		select
			teamId
		from
			teams
		where
			teamId = last_insert_rowid()
	)
insert into
	teamMembers (userId, teamId, teamMemberRole)
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
				teamId
			from
				team
		),
		'owner'
	);

--> statement-breakpoint
insert into
	teams (name)
values
	('U Team');

--> statement-breakpoint
with
	team as materialized (
		select
			teamId
		from
			teams
		where
			teamId = last_insert_rowid()
	)
insert into
	teamMembers (userId, teamId, teamMemberRole)
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
				teamId
			from
				team
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
				teamId
			from
				team
		),
		'member'
	);

--> statement-breakpoint
insert into
	teams (name)
values
	('U1 Team');

--> statement-breakpoint
with
	team as materialized (
		select
			teamId
		from
			teams
		where
			teamId = last_insert_rowid()
	)
insert into
	teamMembers (userId, teamId, teamMemberRole)
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
				teamId
			from
				team
		),
		'owner'
	);
