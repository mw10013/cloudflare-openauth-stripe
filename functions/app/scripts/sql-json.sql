-- .read functions/app/scripts/sql-json.sql
begin transaction;

pragma foreign_keys = on;

select json_object('userId', userId, 'email', email, 'name', name, 'role', role) as data
from users;

rollback;
