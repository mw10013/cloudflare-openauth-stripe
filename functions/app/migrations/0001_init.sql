-- Migration number: 0001 	 2025-01-31T00:42:00.000Z
create table UserType (userTypeId text primary key);

--> statement-breakpoint
insert into
	UserType (userTypeId)
values
	('customer'),
	('staffer');

--> statement-breakpoint
create table AccountMemberStatus (statusId text primary key);

--> statement-breakpoint
insert into
	AccountMemberStatus (statusId)
values
	('pending'),
	('rejected'),
	('active'),
	('revoked'),
	('left'),
	('deleted');

--> statement-breakpoint
create table AccountMember (
	accountMemberId integer primary key,
	userId integer not null references User (userId),
	accountId integer not null references Account (accountId),
	status text not null default 'pending',
	unique (userId, accountId)
);

--> statement-breakpoint
create index AccountMemberAccountIdIndex on AccountMember (accountId);

--> statement-breakpoint
create index AccountMemberStatusIndex on AccountMember (status);

--> statement-breakpoint
create table Account (
	accountId integer primary key,
	userId integer unique not null references User (userId),
	stripeCustomerId text unique,
	stripeSubscriptionId text unique,
	stripeProductId text,
	planName text,
	subscriptionStatus text,
	createdAt text not null default (datetime('now')),
	updatedAt text not null default (datetime('now'))
);

--> statement-breakpoint
create table User (
	userId integer primary key,
	name text not null default '',
	email text not null unique,
	userType text not null default 'customer' references UserType (userTypeId),
	createdAt text not null default (datetime('now')),
	updatedAt text not null default (datetime('now'))
);

--> statement-breakpoint
insert into
	User (name, email, userType)
values
	('Admin (motio)', 'motio@mail.com', 'staffer'),
	('Admin (a)', 'a@a.com', 'staffer');
