-- .read functions/app/scripts/sql-teams.sql

begin transaction;

delete from teams;

delete from teamMembers;

select json_group_array(
json_object(
	'teamId', teamId, 'name', name, 'stripeCustomerId', stripeCustomerId, 'stripeSubscriptionId', stripeSubscriptionId, 'stripeProductId', stripeProductId, 'planName', planName, 'subscriptionStatus', subscriptionStatus,
	'teamMembers',
	(
		select
			json_group_array(
				json_object(
					'teamMemberId', tm.teamMemberId, 'userId', tm.userId, 'teamId', tm.teamId, 'teamMemberRole', tm.teamMemberRole,
					'user', (select json_object('userId', u.userId, 'name', u.name, 'email', u.email, 'role', u.role) from users u where u.userId = tm.userId))
				)
		from teamMembers tm where tm.teamId = t.teamId
	)
)
) as data from teams t;

rollback;
