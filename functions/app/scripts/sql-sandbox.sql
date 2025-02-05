-- .read functions/app/scripts/sandbox.sql
begin transaction;

pragma foreign_keys = on;

insert into
	users (name, email, role)
values
	('A', 'a@a.com', 'owner');

insert into
	teams (name)
values
	('A Team');

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

select
	*
from
	users;

select
	*
from
	teams;

select
	*
from
	teamMembers;

rollback;
