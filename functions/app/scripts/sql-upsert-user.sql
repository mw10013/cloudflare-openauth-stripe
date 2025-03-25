/* sql-formatter-disable */
-- .read functions/app/scripts/sql-upsert-user.sql

begin transaction;

.param set :email "email@example.com"

insert into users (email) values (:email) 
on conflict (email) do update set email = email 
returning *;

insert into accounts (userId) 
select userId from users where email = :email and userType = 'customer'
on conflict (userId) do nothing;

with c as (select u.userId, a.accountId
  from users u inner join accounts a on a.userId = u.userId
  where u.email = :email and u.userType = 'customer')
insert into accountMembers (userId, accountId)
select userId, accountId from c where true
on conflict (userId, accountId) do nothing;

insert into users (email) values (:email) 
on conflict (email) do update set email = email 
returning *;

insert into accounts (userId) 
select userId from users where email = :email and userType = 'customer'
on conflict (userId) do nothing;

with c as (select u.userId, a.accountId
  from users u inner join accounts a on a.userId = u.userId
  where u.email = :email and u.userType = 'customer')
insert into accountMembers (userId, accountId)
select userId, accountId from c where true
on conflict (userId, accountId) do nothing;

select * from users;
select * from accounts;
select * from accountMembers;

rollback;
