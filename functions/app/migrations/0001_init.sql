-- Migration number: 0001 	 2025-01-31T00:42:00.000Z
create table roles (roleId text primary key);

--> statement-breakpoint
insert into
	roles (roleId)
values
	('user'),
	('admin');

--> statement-breakpoint
create table organizationMemberRoles (organizationMemberRoleId text primary key);

--> statement-breakpoint
insert into
	organizationMemberRoles (organizationMemberRoleId)
values
	('owner'),
	('member');

--> statement-breakpoint
create table invitations (
	invitationId integer primary key,
	organizationId integer not null references organizations (organizationId),
	email text not null,
	role text not null,
	invitedBy integer not null references users (userId),
	invitedAt text not null default (datetime('now')),
	status text not null default 'pending'
);

--> statement-breakpoint
create table organizationMembers (
	organizationMemberId integer primary key,
	userId integer not null references users (userId),
	organizationId integer not null references organizations (organizationId),
	organizationMemberRole text not null references organizationMemberRoles (organizationMemberRoleId),
	joinedAt text not null default (datetime('now'))
);

--> statement-breakpoint
create table organizations (
	organizationId integer primary key,
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
insert into organizations (name) values ('M organization');

--> statement-breakpoint
with
	organization as materialized (
		select
			organizationId
		from
			organizations
		where
			organizationId = last_insert_rowid()
	)
insert into
	organizationMembers (userId, organizationId, organizationMemberRole)
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
				organizationId
			from
				organization
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
				organizationId
			from
				organization
		),
		'member'
	);

--> statement-breakpoint
insert into
	organizations (name)
values
	('M1 organization');

--> statement-breakpoint
with
	organization as materialized (
		select
			organizationId
		from
			organizations
		where
			organizationId = last_insert_rowid()
	)
insert into
	organizationMembers (userId, organizationId, organizationMemberRole)
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
				organizationId
			from
				organization
		),
		'owner'
	);

--> statement-breakpoint
insert into
	organizations (name)
values
	('U organization');

--> statement-breakpoint
with
	organization as materialized (
		select
			organizationId
		from
			organizations
		where
			organizationId = last_insert_rowid()
	)
insert into
	organizationMembers (userId, organizationId, organizationMemberRole)
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
				organizationId
			from
				organization
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
				organizationId
			from
				organization
		),
		'member'
	);

--> statement-breakpoint
insert into
	organizations (name)
values
	('U1 organization');

--> statement-breakpoint
with
	organization as materialized (
		select
			organizationId
		from
			organizations
		where
			organizationId = last_insert_rowid()
	)
insert into
	organizationMembers (userId, organizationId, organizationMemberRole)
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
				organizationId
			from
				organization
		),
		'owner'
	);
