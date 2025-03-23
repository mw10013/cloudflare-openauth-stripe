-- .read functions/app/scripts/sql-organizations.sql

select o.organizationId, o.name, u.userId, u.email from organizations o
  inner join organizationMembers om on o.organizationId = om.organizationId and om.organizationMemberRole = 'owner'
  inner join users u on om.userId = u.userId;
