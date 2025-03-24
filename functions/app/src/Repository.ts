import { Effect, Option, pipe, Schema } from 'effect'
import { D1 } from './D1'
import { Account, AccountsResult, User } from './schemas'

export class Repository extends Effect.Service<Repository>()('Repository', {
	accessors: true,
	effect: Effect.gen(function* () {
		const d1 = yield* D1
		return {
			getAccounts: () =>
				pipe(
					d1.prepare(
						`
	select json_group_array(json_object(
		'accountId', accountId, 'name', name, 'stripeCustomerId', stripeCustomerId, 'stripeSubscriptionId', stripeSubscriptionId, 'stripeProductId', stripeProductId, 'planName', planName, 'subscriptionStatus', subscriptionStatus,
		'accountMembers',
		(select json_group_array(json_object(
			'accountMemberId', tm.accountMemberId, 'userId', tm.userId, 'accountId', tm.accountId, 'accountMemberRole', tm.accountMemberRole,
			'user', (select json_object('userId', u.userId, 'name', u.name, 'email', u.email, 'role', u.role) from users u where u.userId = tm.userId)
			)) from accountMembers tm where tm.accountId = t.accountId)
		)) as data from accounts t`
					),
					d1.first,
					Effect.flatMap(Effect.fromNullable),
					Effect.flatMap(Schema.decodeUnknown(AccountsResult))
				),

			getRequiredAccountForUser: ({ userId }: Pick<User, 'userId'>) =>
				pipe(
					d1
						.prepare(
							`select * from accounts where accountId = (select accountId from accountMembers where userId = ? and accountMemberRole = "owner")`
						)
						.bind(userId),
					d1.first,
					Effect.flatMap(Option.fromNullable),
					Effect.flatMap(Schema.decodeUnknown(Account))
				),

			updateStripeCustomerId: ({ accountId, stripeCustomerId }: Pick<Account, 'accountId' | 'stripeCustomerId'>) =>
				pipe(d1.prepare('update accounts set stripeCustomerId = ? where accountId = ?').bind(stripeCustomerId, accountId), d1.run),

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
							'update accounts set stripeSubscriptionId = ?, stripeProductId = ?, planName = ?, subscriptionStatus = ? where stripeCustomerId = ?'
						)
						.bind(stripeSubscriptionId, stripeProductId, planName, subscriptionStatus, stripeCustomerId),
					d1.run
				),

			upsertUser: ({ email }: Pick<User, 'email'>) =>
				d1
					.batch([
						d1.prepare('insert into users (email) values (?) on conflict (email) do update set email = email returning *').bind(email),
						d1
							.prepare(
								`
	insert into accounts (name) 
	select 'Account' 
	where exists (select 1 from users u where u.email = ?1 and role = "user") and
	not exists (select 1 from accountMembers om where om.userId = (select u.userId from users u where u.email = ?1 and role = "user")
	)
	`
							)
							.bind(email),
						d1
							.prepare(
								`
	insert into accountMembers (userId, accountId, accountMemberRole)
	select (select userId from users where email = ?1), last_insert_rowid(), 'owner'
	where exists (select 1 from users u where u.email = ?1 and role = "user") and
	not exists (select 1 from accountMembers om where om.userId = (select u.userId from users u where u.email = ?1)
	)
	`
							)
							.bind(email)
					])
					.pipe(
						Effect.map((results) => results[0].results[0]),
						Effect.flatMap(Schema.decodeUnknown(User))
					)
		}
	}),
	dependencies: [D1.Default]
}) {}
