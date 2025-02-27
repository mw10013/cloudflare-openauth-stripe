import { Effect, Layer, Option, pipe, Schema } from 'effect'
import { D1 } from './D1'
import { Team, TeamResult, TeamsResult, User } from './schemas'

export const make = Effect.gen(function* () {
	const d1 = yield* D1 // Outside of functions so that D1 does not show up in R
	return {
		getTeams: () =>
			pipe(
				d1.prepare(
					`
select json_group_array(json_object(
	'teamId', teamId, 'name', name, 'stripeCustomerId', stripeCustomerId, 'stripeSubscriptionId', stripeSubscriptionId, 'stripeProductId', stripeProductId, 'planName', planName, 'subscriptionStatus', subscriptionStatus,
	'teamMembers',
	(select json_group_array(json_object(
		'teamMemberId', tm.teamMemberId, 'userId', tm.userId, 'teamId', tm.teamId, 'teamMemberRole', tm.teamMemberRole,
		'user', (select json_object('userId', u.userId, 'name', u.name, 'email', u.email, 'role', u.role) from users u where u.userId = tm.userId)
		)) from teamMembers tm where tm.teamId = t.teamId)
	)) as data from teams t`
				),
				d1.first,
				Effect.andThen(Effect.fromNullable),
				Effect.flatMap(Schema.decodeUnknown(TeamsResult))
			),
		getTeamForUser2: ({ userId }: Pick<User, 'userId'>) =>
			pipe(
				d1
					.prepare(`select * from teams where teamId = (select teamId from teamMembers where userId = ? and teamMemberRole = "owner")`)
					.bind(userId),
				d1.first,
				Effect.andThen(Effect.fromNullable),
				Effect.flatMap(Schema.decodeUnknown(TeamResult))
			),
		getTeamForUser: ({ userId }: Pick<User, 'userId'>) =>
			pipe(
				d1
					.prepare(`select * from teams where teamId = (select teamId from teamMembers where userId = ? and teamMemberRole = "owner")`)
					.bind(userId),
				d1.first,
				Effect.map(Option.fromNullable),
				Effect.flatMap(
					Option.match({
						onNone: () => Effect.succeed(Option.none()),
						onSome: (v) => Schema.decodeUnknown(Team)(v).pipe(Effect.map(Option.some))
					})
				)
			),
		updateStripeCustomerId: ({ teamId, stripeCustomerId }: Pick<Team, 'teamId' | 'stripeCustomerId'>) =>
			pipe(d1.prepare('update teams set stripeCustomerId = ? where teamId = ?').bind(stripeCustomerId, teamId), d1.run),
		updateStripeSubscription: ({
			stripeCustomerId,
			stripeSubscriptionId,
			stripeProductId,
			planName,
			subscriptionStatus
		}: Pick<
			{
				[K in keyof Team]: NonNullable<Team[K]>
			},
			'stripeCustomerId' | 'stripeSubscriptionId' | 'stripeProductId' | 'planName' | 'subscriptionStatus'
		>) =>
			pipe(
				d1
					.prepare(
						'update teams set stripeSubscriptionId = ?, stripeProductId = ?, planName = ?, subscriptionStatus = ? where stripeCustomerId = ?'
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
insert into teams (name) 
select 'Team' 
where exists (select 1 from users u where u.email = ?1 and role = "user") and
not exists (select 1 from teamMembers tm where tm.userId = (select u.userId from users u where u.email = ?1 and role = "user")
)
`
						)
						.bind(email),
					d1
						.prepare(
							`
insert into teamMembers (userId, teamId, teamMemberRole)
select (select userId from users where email = ?1), last_insert_rowid(), 'owner'
where exists (select 1 from users u where u.email = ?1 and role = "user") and
not exists (select 1 from teamMembers tm where tm.userId = (select u.userId from users u where u.email = ?1)
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
})

export class Repository extends Effect.Tag('Repository')<Repository, Effect.Effect.Success<typeof make>>() {
	static Live = Layer.effect(this, make)
}
