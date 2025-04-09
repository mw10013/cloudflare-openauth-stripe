import { Effect, pipe, Schema } from 'effect'
import { D1 } from './D1'
import { Account, AccountMember, AccountMemberWithAccount, AccountMemberWithUser, AccountWithUser, Customer, User } from './Domain'
import { DataFromResult } from './SchemaEx'

/**
 * Repository provides data access methods for the application's domain entities.
 *
 * Naming Conventions:
 * - `get*`: SELECT operations that retrieve entities
 * - `update*`: UPDATE operations that modify existing entities
 * - `upsert*`: INSERT OR UPDATE operations for creating or updating entities
 * - `create*`: INSERT operations for creating new entities
 * - `delete*`/`softDelete*`: DELETE operations (either physical or logical)
 *
 * @example
 * ```ts
 * import { Repository } from './Repository'
 *
 * // Within an Effect context
 * const program = Effect.gen(function*() {
 *   const repo = yield* Repository
 *   const customers = yield* repo.getCustomers()
 *   // ...
 * })
 * ```
 */
export class Repository extends Effect.Service<Repository>()('Repository', {
  accessors: true,
  dependencies: [D1.Default],
  effect: Effect.gen(function* () {
    const d1 = yield* D1

    const upsertUserStatements = ({ email }: Pick<User, 'email'>) => [
      d1
        .prepare(
          `
insert into User (email, userType) values (?, 'customer') 
on conflict (email) do update set 
  deletedAt = case when userType = 'staffer' then deletedAt else null end,
  updatedAt = datetime('now')
returning *`
        )
        .bind(email),
      d1
        .prepare(
          `
insert into Account (userId) 
select userId from User where email = ?1 and userType = 'customer'
on conflict (userId) do nothing`
        )
        .bind(email),
      // https://www.sqlite.org/lang_insert.html
      // To avoid a parsing ambiguity, the SELECT statement should always contain a WHERE clause, even if that clause is simply "WHERE true", if the upsert-clause is present.
      d1
        .prepare(
          `
with c as (select u.userId, a.accountId
  from User u inner join Account a on a.userId = u.userId
  where u.email = ?1 and u.userType = 'customer')
insert into AccountMember (userId, accountId, status, role)
select userId, accountId, 'active', 'admin' from c where true
on conflict (userId, accountId) do nothing`
        )
        .bind(email)
    ]

    return {
      getCustomers: () =>
        pipe(
          d1.prepare(
            `
select json_group_array(json_object(
	'userId', u.userId, 
  'name', u.name, 
  'email', u.email, 
  'userType', u.userType, 
	'createdAt', u.createdAt, 
  'updatedAt', u.updatedAt, 
  'deletedAt', u.deletedAt,
	'account', json_object(
		'accountId', a.accountId, 
    'userId', a.userId, 
    'stripeCustomerId', a.stripeCustomerId, 
    'stripeSubscriptionId', a.stripeSubscriptionId, 
    'stripeProductId', a.stripeProductId, 
    'planName', a.planName, 
    'subscriptionStatus', a.subscriptionStatus,
		'accountMembers', (select json_group_array(json_object(
			'accountMemberId', am.accountMemberId, 
      'userId', am.userId, 
      'accountId', am.accountId, 
      'status', am.status, 
      'role', am.role,
			'user', json_object(
        'userId', u1.userId, 
        'name', u1.name, 
        'email', u1.email, 
        'userType', u1.userType, 
        'createdAt', u1.createdAt, 
        'updatedAt', u1.updatedAt, 
        'deletedAt', u1.deletedAt
      )
		)) from AccountMember am inner join User u1 on u1.userId = am.userId where am.accountId = a.accountId)
  )
)) as data from User u inner join Account a on a.userId = u.userId where userType = 'customer' order by u.email
				`
          ),
          d1.first,
          Effect.flatMap(Effect.fromNullable),
          Effect.flatMap(Schema.decodeUnknown(DataFromResult(Schema.Array(Customer))))
        ),

      getAccountForUser: ({ userId }: Pick<User, 'userId'>) =>
        pipe(
          d1.prepare(`select * from Account where userId = ?`).bind(userId),
          d1.first,
          Effect.flatMap(Effect.fromNullable),
          Effect.flatMap(Schema.decodeUnknown(Account))
        ),

      getAccountForMember: ({ accountId, userId }: Pick<Account, 'accountId'> & Pick<User, 'userId'>) =>
        pipe(
          d1
            .prepare(
              `
select json_object(
	'accountId', a.accountId, 
	'userId', a.userId, 
	'stripeCustomerId', a.stripeCustomerId, 
	'stripeSubscriptionId', a.stripeSubscriptionId, 
	'stripeProductId', a.stripeProductId, 
	'planName', a.planName, 
	'subscriptionStatus', a.subscriptionStatus,
	'user', json_object(
		'userId', u.userId, 
		'name', u.name, 
		'email', u.email, 
		'userType', u.userType, 
		'createdAt', u.createdAt, 
		'updatedAt', u.updatedAt, 
		'deletedAt', u.deletedAt
	)
) as data 
from Account a 
inner join AccountMember am on a.accountId = am.accountId
inner join User u on u.userId = a.userId
where a.accountId = ?1 and am.userId = ?2 and am.status = 'active'`
            )
            .bind(accountId, userId),
          d1.first,
          Effect.flatMap(Effect.fromNullable),
          Effect.flatMap(Schema.decodeUnknown(DataFromResult(AccountWithUser)))
        ),

      updateAccountStripeCustomerId: ({ userId, stripeCustomerId }: Pick<Account, 'userId' | 'stripeCustomerId'>) =>
        pipe(d1.prepare('update Account set stripeCustomerId = ? where userId = ?').bind(stripeCustomerId, userId), d1.run),

      updateAccountStripeSubscription: ({
        stripeCustomerId,
        stripeSubscriptionId,
        stripeProductId,
        planName,
        subscriptionStatus
      }: Pick<Account, 'stripeSubscriptionId' | 'stripeProductId' | 'planName' | 'subscriptionStatus'> & {
        stripeCustomerId: NonNullable<Account['stripeCustomerId']>
      }) =>
        pipe(
          d1
            .prepare(
              'update Account set stripeSubscriptionId = ?, stripeProductId = ?, planName = ?, subscriptionStatus = ? where stripeCustomerId = ?'
            )
            .bind(stripeSubscriptionId, stripeProductId, planName, subscriptionStatus, stripeCustomerId),
          d1.run
        ),

      upsertUser: ({ email }: Pick<User, 'email'>) =>
        d1.batch([...upsertUserStatements({ email })]).pipe(
          Effect.flatMap((results) => Effect.fromNullable(results[0].results[0])),
          Effect.flatMap(Schema.decodeUnknown(User))
        ),

      softDeleteUser: ({ userId }: Pick<User, 'userId'>) =>
        d1.batch([
          d1.prepare(`update User set deletedAt = datetime('now'), updatedAt = datetime('now') where userId = ?`).bind(userId),
          d1.prepare(`delete from AccountMember where userId = ?1`).bind(userId)
        ]),

      getAccountMembersForUser: ({ userId, status }: Pick<AccountMember, 'userId' | 'status'>) =>
        pipe(
          d1
            .prepare(
              `
select json_group_array(json_object(
	'accountMemberId', am.accountMemberId, 
  'userId', am.userId, 
  'accountId', am.accountId, 
  'status', am.status, 
  'role', am.role,
	'account', json_object(
		'accountId', a.accountId, 
    'userId', a.userId, 
    'stripeCustomerId', a.stripeCustomerId, 
    'stripeSubscriptionId', a.stripeSubscriptionId, 
    'stripeProductId', a.stripeProductId, 
    'planName', a.planName, 
    'subscriptionStatus', a.subscriptionStatus,
		'user', json_object(
			'userId', u.userId, 
      'name', u.name, 
      'email', u.email, 
      'userType', u.userType, 
      'createdAt', u.createdAt, 
      'updatedAt', u.updatedAt, 
      'deletedAt', u.deletedAt
		)
  )
)) as data from AccountMember am
inner join Account a on a.accountId = am.accountId
inner join User u on u.userId = a.userId 
where am.userId = ? and am.status = ?`
            )
            .bind(userId, status),
          d1.first,
          Effect.flatMap(Effect.fromNullable),
          Effect.flatMap(Schema.decodeUnknown(DataFromResult(Schema.Array(AccountMemberWithAccount))))
        ),

      getAccountMembers: ({ accountId }: Pick<Account, 'accountId'>) =>
        pipe(
          d1
            .prepare(
              `
select json_group_array(json_object(
	'accountMemberId', am.accountMemberId, 
  'userId', am.userId, 
  'accountId', am.accountId, 
  'status', am.status, 
  'role', am.role,
	'user', json_object(
    'userId', u.userId, 
    'name', u.name, 
    'email', u.email, 
    'userType', u.userType, 
    'createdAt', u.createdAt, 
    'updatedAt', u.updatedAt, 
    'deletedAt', u.deletedAt 
  )
)) as data from AccountMember am inner join User u on u.userId = am.userId where am.accountId = ?`
            )
            .bind(accountId),
          d1.first,
          Effect.flatMap(Effect.fromNullable),
          Effect.flatMap(Schema.decodeUnknown(DataFromResult(Schema.Array(AccountMemberWithUser))))
        ),

      getAccountMemberCount: ({ accountId }: Pick<Account, 'accountId'>) =>
        pipe(
          d1.prepare(`select count(*) as accountMemberCount from AccountMember where accountId = ?`).bind(accountId),
          d1.first<{ accountMemberCount: number }>,
          Effect.flatMap(Effect.fromNullable),
          Effect.map((result) => result.accountMemberCount)
        ),

      createAccountMembers: ({ emails, accountId }: Pick<Account, 'accountId'> & { readonly emails: readonly User['email'][] }) =>
        Effect.gen(function* () {
          yield* Effect.log('Repository: createAccountMembers', { emails, accountId })
          const createAccountMemberStatements = ({ email, accountId }: Pick<User, 'email'> & Pick<Account, 'accountId'>) => [
            ...upsertUserStatements({ email }),
            d1
              .prepare(
                `
insert into AccountMember (userId, accountId, status, role) 
values ((select userId from User where email = ?), ?, 'pending', 'editor') returning *							
							`
              )
              .bind(email, accountId)
          ]
          return yield* d1.batch([...emails.flatMap((email) => createAccountMemberStatements({ email, accountId }))])
        }),

      updateAccountMemberStatus: ({ accountMemberId, status }: Pick<AccountMember, 'accountMemberId' | 'status'>) =>
        pipe(
          d1
            .prepare(
              `
update AccountMember set status = ?
where accountMemberId = ?`
            )
            .bind(status, accountMemberId),
          d1.run
        ),

      deleteAccountMember: ({ accountMemberId, skipIfOwner }: Pick<AccountMember, 'accountMemberId'> & { skipIfOwner?: boolean }) =>
        skipIfOwner
          ? pipe(
              d1
                .prepare(
                  `
with t as (
	select accountMemberId
	from AccountMember am inner join Account a on a.accountId = am.accountId
	where am.accountMemberId = ? and a.userId <> am.userId)
delete from AccountMember
where accountMemberId in (select accountMemberId from t)`
                )
                .bind(accountMemberId),
              d1.run
            )
          : pipe(d1.prepare(`delete from AccountMember where accountMemberId = ?`).bind(accountMemberId), d1.run),

      /**
       * Identifies emails that cannot be invited to an account for various reasons.
       * Returns categorized lists of ineligible emails:
       * - staffers: emails that belong to staff members (who cannot be invited)
       * - pending: emails that already have a pending invitation
       * - active: emails that already have active membership
       */
      identifyInvalidInviteEmails: ({ emails, accountId }: Pick<Account, 'accountId'> & { readonly emails: readonly User['email'][] }) =>
        Effect.gen(function* () {
          const DataSchema = Schema.Struct({
            staffers: Schema.Array(Schema.String),
            pending: Schema.Array(Schema.String),
            active: Schema.Array(Schema.String)
          })
          const emailPlaceholders = emails.map(() => `(?)`).join(',')
          return yield* pipe(
            d1
              .prepare(
                `
with Email (email) as (values ${emailPlaceholders}),
IneligibleEmail as (
	select 
		e.email,
		case 
			when u.userType = 'staffer' then 'staffer'
			when am.status = 'pending' then 'pending'
			when am.status = 'active' then 'active'
		end as reason
	from Email e
		inner join User u on e.email = u.email
		left join AccountMember am on u.userId = am.userId and am.accountId = ?
	where u.userType = 'staffer' or am.userId is not null
)
select json_object(
	'staffers', (
		select json_group_array(email)
		from IneligibleEmail
		where reason = 'staffer'
	),
	'pending', (
		select json_group_array(email)
		from IneligibleEmail
		where reason = 'pending'
	),
	'active', (
		select json_group_array(email)
		from IneligibleEmail
		where reason = 'active'
	)
) as data`
              )
              .bind(...emails, accountId),
            d1.first,
            Effect.flatMap(Effect.fromNullable),
            Effect.flatMap(Schema.decodeUnknown(DataFromResult(DataSchema)))
          )
        })
    }
  })
}) {}
