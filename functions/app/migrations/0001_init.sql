-- Migration number: 0001 	 2025-01-31T00:42:00.000Z

create table activity_logs (
	id integer primary key autoincrement,
	team_id integer not null,
	user_id integer,
	action text not null,
	timestamp text default current_timestamp not null,
	ip_address text,
	foreign key (team_id) references teams (id),
	foreign key (user_id) references users (id)
);
--> statement-breakpoint
create table invitations (
	id integer primary key autoincrement,
	team_id integer not null,
	email text not null,
	role text not null,
	invited_by integer not null,
	invited_at text default current_timestamp not null,
	status text default 'pending' not null,
	foreign key (team_id) references teams (id),
	foreign key (invited_by) references users (id)
);
--> statement-breakpoint
create table team_members (
	id integer primary key autoincrement,
	user_id integer not null,
	team_id integer not null,
	role text not null,
	joined_at text default current_timestamp not null,
	foreign key (user_id) references users (id),
	foreign key (team_id) references teams (id)
);
--> statement-breakpoint
create table teams (
	id integer primary key autoincrement,
	name text not null,
	created_at text default current_timestamp not null,
	updated_at text default current_timestamp not null,
	stripe_customer_id text unique,
	stripe_subscription_id text unique,
	stripe_product_id text,
	plan_name text,
	subscription_status text
);
--> statement-breakpoint
create table users (
	id integer primary key autoincrement,
	name text,
	email text not null unique,
	password_hash text not null,
	role text default 'member' not null,
	created_at text default current_timestamp not null,
	updated_at text default current_timestamp not null,
	deleted_at text
);

