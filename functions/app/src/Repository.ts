import { Context, Effect, Layer, ParseResult, Schema } from 'effect'
import { UnknownException } from 'effect/Cause'
import { D1 } from './D1'
import { Team, TeamResult, TeamsResult } from './schemas'

export class Repository extends Context.Tag('Repository')<
	Repository,
	{
		readonly getTeams: () => Effect.Effect<TeamsResult, UnknownException | ParseResult.ParseError>
		// readonly upsertUser: (props: { email: string }) => Effect.Effect<string, UnknownException>
		readonly getTeamForUser: (props: { userId: number }) => Effect.Effect<TeamResult, UnknownException | ParseResult.ParseError>
	}
>() {}

export const RepositoryLive = Layer.effect(
	Repository,
	Effect.gen(function* () {
		const d1 = yield* D1
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
			getTeamForUser: ({ userId }) =>
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
)

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
