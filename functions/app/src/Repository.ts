import { Effect, Option, pipe, Schema } from 'effect'
import { D1 } from './D1'
import { Organization, OrganizationsResult, User } from './schemas'

export class Repository extends Effect.Service<Repository>()('Repository', {
	accessors: true,
	effect: Effect.gen(function* () {
		const d1 = yield* D1
		return {
			getOrganizations: () =>
				pipe(
					d1.prepare(
						`
	select json_group_array(json_object(
		'organizationId', organizationId, 'name', name, 'stripeCustomerId', stripeCustomerId, 'stripeSubscriptionId', stripeSubscriptionId, 'stripeProductId', stripeProductId, 'planName', planName, 'subscriptionStatus', subscriptionStatus,
		'organizationMembers',
		(select json_group_array(json_object(
			'organizationMemberId', tm.organizationMemberId, 'userId', tm.userId, 'organizationId', tm.organizationId, 'organizationMemberRole', tm.organizationMemberRole,
			'user', (select json_object('userId', u.userId, 'name', u.name, 'email', u.email, 'role', u.role) from users u where u.userId = tm.userId)
			)) from organizationMembers tm where tm.organizationId = t.organizationId)
		)) as data from organizations t`
					),
					d1.first,
					Effect.flatMap(Effect.fromNullable),
					Effect.flatMap(Schema.decodeUnknown(OrganizationsResult))
				),

			getRequiredOrganizationForUser: ({ userId }: Pick<User, 'userId'>) =>
				pipe(
					d1
						.prepare(`select * from organizations where organizationId = (select organizationId from organizationMembers where userId = ? and organizationMemberRole = "owner")`)
						.bind(userId),
					d1.first,
					Effect.flatMap(Option.fromNullable),
					Effect.flatMap(Schema.decodeUnknown(Organization))
				),

			updateStripeCustomerId: ({ organizationId, stripeCustomerId }: Pick<Organization, 'organizationId' | 'stripeCustomerId'>) =>
				pipe(d1.prepare('update organizations set stripeCustomerId = ? where organizationId = ?').bind(stripeCustomerId, organizationId), d1.run),

			updateStripeSubscription: ({
				stripeCustomerId,
				stripeSubscriptionId,
				stripeProductId,
				planName,
				subscriptionStatus
			}: Pick<Organization, 'stripeSubscriptionId' | 'stripeProductId' | 'planName' | 'subscriptionStatus'> & {
				stripeCustomerId: NonNullable<Organization['stripeCustomerId']>
			}) =>
				pipe(
					d1
						.prepare(
							'update organizations set stripeSubscriptionId = ?, stripeProductId = ?, planName = ?, subscriptionStatus = ? where stripeCustomerId = ?'
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
	insert into organizations (name) 
	select 'Organization' 
	where exists (select 1 from users u where u.email = ?1 and role = "user") and
	not exists (select 1 from organizationMembers tm where tm.userId = (select u.userId from users u where u.email = ?1 and role = "user")
	)
	`
							)
							.bind(email),
						d1
							.prepare(
								`
	insert into organizationMembers (userId, organizationId, organizationMemberRole)
	select (select userId from users where email = ?1), last_insert_rowid(), 'owner'
	where exists (select 1 from users u where u.email = ?1 and role = "user") and
	not exists (select 1 from organizationMembers tm where tm.userId = (select u.userId from users u where u.email = ?1)
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
