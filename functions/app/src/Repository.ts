import { Effect, Layer, pipe, Schema } from 'effect'
import { D1 } from './D1'
import { Team, TeamResult, TeamsResult, User } from './schemas'

export const make = Effect.gen(function* () {
	const d1 = yield* D1 // Outside of functions so that D1 does not show up in R
	return {
		getTeams: () =>
			pipe(
				d1.prepare(
					`
select json_group_array(
json_object(
'teamId', teamId, 'name', name, 'stripeCustomerId', stripeCustomerId, 'stripeSubscriptionId', stripeSubscriptionId, 'stripeProductId', stripeProductId, 'planName', planName, 'subscriptionStatus', subscriptionStatus,
'teamMembers',
(
select
json_group_array(
json_object(
'teamMemberId', tm.teamMemberId, 'userId', tm.userId, 'teamId', tm.teamId, 'teamMemberRole', tm.teamMemberRole,
'user', (select json_object('userId', u.userId, 'name', u.name, 'email', u.email, 'role', u.role) from users u where u.userId = tm.userId))
)
from teamMembers tm where tm.teamId = t.teamId
)
)
) as data from teams t
`
				),
				d1.first,
				Effect.flatMap(Schema.decodeUnknown(TeamsResult))
			),
		getTeamForUser: ({ userId }: Pick<User, 'userId'>) =>
			pipe(
				d1
					.prepare(`select * from teams where teamId = (select teamId from teamMembers where userId = ? and teamMemberRole = "owner")`)
					.bind(userId),
				d1.first,
				Effect.flatMap(Schema.decodeUnknown(TeamResult))
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
			)
	}
})

export class Repository extends Effect.Tag('Repository')<Repository, Effect.Effect.Success<typeof make>>() {
	static Live = Layer.effect(this, make)
}
