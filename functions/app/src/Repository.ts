import { Effect, Layer, Schema } from 'effect'
import { D1 } from './D1'
import { Team, TeamResult, TeamsResult } from './schemas'

export const make = Effect.gen(function* () {
	const d1 = yield* D1 // Outside of functions so that D1 does not show up in R
	return {
		getTeams: () =>
			Effect.gen(function* () {
				const statement = d1.prepare(
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
				)
				return yield* d1.first(statement).pipe(Effect.flatMap(Schema.decodeUnknown(TeamsResult)))
			}),
		getTeamForUser: ({ userId }: { userId: number }) =>
			Effect.gen(function* () {
				const statement = d1
					.prepare(
						`
				select * from teams where teamId = (select teamId from teamMembers where userId = ? and teamMemberRole = "owner")
				`
					)
					.bind(userId)
				return yield* d1.first(statement).pipe(Effect.flatMap(Schema.decodeUnknown(TeamResult)))
			})
	}
})

export class Repository extends Effect.Tag('Repository')<Repository, Effect.Effect.Success<typeof make>>() {
	static Live = Layer.effect(this, make)
}

// getTeamForUser: async ({ userId }: { userId: number }) => {
//   const team = await db
//     .prepare('select * from teams where teamId = (select teamId from teamMembers where userId = ? and teamMemberRole = "owner")')
//     .bind(userId)
//     .first()
//   if (!team) throw new Error('Missing team.')
//   return Schema.decodeUnknownSync(Team)(team)
// },
// updateStripeCustomerId: async ({
//   teamId,
//   stripeCustomerId
// }: Pick<
//   {
//     [K in keyof Team]: NonNullable<Team[K]>
//   },
//   'teamId' | 'stripeCustomerId'
// >) => {
//   await db.prepare('update teams set stripeCustomerId = ? where teamId = ?').bind(stripeCustomerId, teamId).run()
// },
