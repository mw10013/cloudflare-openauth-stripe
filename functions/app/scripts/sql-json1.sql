-- .read functions/app/scripts/sql-json1.sql

select json_object('organizationId', organizationId,'name', name,
	'organizationMembers',
	(select json_group_array(json_object(
		'organizationMemberId', om.organizationMemberId,
		'organizationMemberRole', om.organizationMemberRole,
		'user', (select json_object('userId', u.userId, 'email', u.email) from users u where u.userId = om.userId)))
		from organizationMembers om where om.organizationId = o.organizationId)) as data
from organizations o;
