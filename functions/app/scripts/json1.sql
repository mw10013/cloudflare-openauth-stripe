-- .read functions/app/scripts/json1.sql
begin transaction;

pragma foreign_keys = on;

select
	json_object(
		'teamId',
		teamId,
		'name',
		name,
		'teamMembers',
		(
			select
				json_group_array(
					json_object(
						'teamMemberId',
						tm.teamMemberId,
						'teamMemberRole',
						tm.teamMemberRole,
            'user',
            (select json_object('userId', u.userId, 'email', u.email) from users u where u.userId = tm.userId)
					)
				)
			from
				teamMembers tm
			where
				tm.teamId = t.teamId
		)
	) as data
from
	teams t;

rollback;
