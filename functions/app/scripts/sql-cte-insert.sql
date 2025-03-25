/* sql-formatter-disable */
-- .read functions/app/scripts/sql-cte-insert.sql

begin transaction;

create table test (
id integer primary key,
value integer unique
);

with numbers as (select 1 as n)
insert into test (value)
select n from numbers where true
on conflict (value) do nothing;

select * from test;

rollback;
