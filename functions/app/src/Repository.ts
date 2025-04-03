import { Effect, pipe, Schema } from 'effect'
import { D1 } from './D1'
import { Account, AccountsResult, AccountsWithUserResult, DataFromResult, User } from './schemas'

export class Repository extends Effect.Service<Repository>()('Repository', {
	accessors: true,
	effect: Effect.gen(function* () {
		const d1 = yield* D1

		const upsertUserStatements = ({ email }: Pick<User, 'email'>) => [
			d1
				.prepare(
					`
insert into User (email) values (?) 
on conflict (email) do update set deletedAt = null, updatedAt = datetime('now') returning *`
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
insert into AccountMember (userId, accountId, status)
select userId, accountId, 'active' from c where true
on conflict (userId, accountId) do nothing`
				)
				.bind(email)
		]

		return {
			getAccounts: () =>
				pipe(
					d1.prepare(
						`
	select json_group_array(json_object(
		'accountId', accountId, 'userId', userId, 'stripeCustomerId', stripeCustomerId, 'stripeSubscriptionId', stripeSubscriptionId, 'stripeProductId', stripeProductId, 'planName', planName, 'subscriptionStatus', subscriptionStatus,
		'accountMembers',
		(select json_group_array(json_object(
			'accountMemberId', am.accountMemberId, 'userId', am.userId, 'accountId', am.accountId, 'status', am.status,
			'user', (select json_object('userId', u.userId, 'name', u.name, 'email', u.email, 'userType', u.userType, 
				'createdAt', u.createdAt, 'updatedAt', u.updatedAt, 'deletedAt', u.deletedAt) from User u where u.userId = am.userId)
			)) from AccountMember am where am.accountId = a.accountId)
		)) as data from Account a`
					),
					d1.first,
					Effect.flatMap(Effect.fromNullable),
					Effect.flatMap(Schema.decodeUnknown(AccountsResult))
				),

			getRequiredAccountForUser: ({ userId }: Pick<User, 'userId'>) =>
				pipe(
					d1.prepare(`select * from Account where userId = ?`).bind(userId),
					d1.first,
					Effect.flatMap(Effect.fromNullable),
					Effect.flatMap(Schema.decodeUnknown(Account))
				),

			updateStripeCustomerId: ({ userId, stripeCustomerId }: Pick<Account, 'userId' | 'stripeCustomerId'>) =>
				pipe(d1.prepare('update Account set stripeCustomerId = ? where userId = ?').bind(stripeCustomerId, userId), d1.run),

			updateStripeSubscription: ({
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

			getAccountsForUser: ({ userId }: Pick<User, 'userId'>) =>
				pipe(
					d1
						.prepare(
							`
select json_group_array(json_object(
	'accountId', a.accountId, 'userId', a.userId, 'stripeCustomerId', a.stripeCustomerId, 'stripeSubscriptionId', a.stripeSubscriptionId, 'stripeProductId', a.stripeProductId, 'planName', a.planName, 'subscriptionStatus', a.subscriptionStatus,
	'user', (select json_object('userId', u.userId, 'name', u.name, 'email', u.email, 'userType', u.userType,
	'createdAt', u.createdAt, 'updatedAt', u.updatedAt, 'deletedAt', u.deletedAt) as user from User u where u.userId = a.userId)
	)) as data 
from Account a inner join AccountMember am on am.accountId = a.accountId
where am.userId = ?1 and am.status = 'active'`
						)
						.bind(userId),
					d1.first,
					Effect.flatMap(Effect.fromNullable),
					Effect.flatMap(Schema.decodeUnknown(AccountsWithUserResult))
				),

			getAccountMemberCount: ({ accountId }: Pick<Account, 'accountId'>) =>
				pipe(
					d1.prepare(`select count(*) as accountMemberCount from AccountMember where accountId = ?`).bind(accountId),
					d1.first<{ accountMemberCount: number }>,
					Effect.flatMap(Effect.fromNullable),
					Effect.map((result) => result.accountMemberCount)
				),

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
  where u.userType = 'staffer' or am.status is not null
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
) as data
						`
							)
							.bind(...emails, accountId),
						d1.first<{ data: { staffers: string[]; pending: string[]; active: string[] } }>,
						Effect.flatMap(Effect.fromNullable),
						Effect.flatMap(Schema.decodeUnknown(DataFromResult(DataSchema)))
					)
				}),

			getAccountMembers: ({ accountId }: Pick<Account, 'accountId'>) =>
				pipe(d1.prepare(`select * from AccountMember where accountId = ?`).bind(accountId), d1.run),

			createAccountMembers: ({ emails, accountId }: Pick<Account, 'accountId'> & { readonly emails: readonly User['email'][] }) =>
				Effect.gen(function* () {
					yield* Effect.log('Repository: createAccountMembers', { emails, accountId })
					const createAccountMemberStatements = ({ email, accountId }: Pick<User, 'email'> & Pick<Account, 'accountId'>) => [
						...upsertUserStatements({ email }),
						d1
							.prepare(
								`
insert into AccountMember (userId, accountId) values ((select userId from User where email = ?), ?)							
							`
							)
							.bind(email, accountId)
					]
					d1.batch([...emails.flatMap((email) => createAccountMemberStatements({ email, accountId }))])
				})
		}
	}),
	dependencies: [D1.Default]
}) {}
