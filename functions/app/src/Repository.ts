import { Context, Effect, Layer, ParseResult, Schema } from 'effect'
import { UnknownException } from 'effect/Cause'
import { D1 } from './D1'
import { TeamsResult } from './schemas'

export class Repository extends Context.Tag('Repository')<
	Repository,
	{
		readonly getTeams: () => Effect.Effect<TeamsResult, UnknownException | ParseResult.ParseError>
		// readonly upsertUser: (props: { email: string }) => Effect.Effect<string, UnknownException>
		// readonly getTeamForUser: (props: { userId: number }) => Effect.Effect<Team, UnknownException>
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
				})
		}
	})

	// readonly getTeams: () => Effect.gen(function* () {
	//   const statement = d1
	//       .prepare(
	//         `
	// select json_group_array(
	// json_object(
	// 'teamId', teamId, 'name', name, 'stripeCustomerId', stripeCustomerId, 'stripeSubscriptionId', stripeSubscriptionId, 'stripeProductId', stripeProductId, 'planName', planName, 'subscriptionStatus', subscriptionStatus,
	// 'teamMembers',
	// (
	// select
	// json_group_array(
	// json_object(
	// 'teamMemberId', tm.teamMemberId, 'userId', tm.userId, 'teamId', tm.teamId, 'teamMemberRole', tm.teamMemberRole,
	// 'user', (select json_object('userId', u.userId, 'name', u.name, 'email', u.email, 'role', u.role) from users u where u.userId = tm.userId))
	// )
	// from teamMembers tm where tm.teamId = t.teamId
	// )
	// )
	// ) as data from teams t
	// `
	//       )
	//       return yield* d1.first(statement).pipe(Schema.decodeUnknown(TeamsResult))
	//     })
	// }
	// })

	// Effect.tryPromise(() =>

	//   const result = yield* d1.first(statement)
	//   return yield* d1.first(statement).pipe(Schema.decodeUnknown(TeamsResult))
	// .first()
	// .then((v) => Schema.decodeUnknownSync(TeamsResult)(v))
)

// getTeamForUser: ({ userId }) =>
// 	Effect.gen(function* () {
// 		const statement = d1
// 			.prepare('select * from teams where teamId = (select teamId from teamMembers where userId = ? and teamMemberRole = "owner")')
// 			.bind(userId)
// 		const team = yield* d1.first(statement)
// 		if (!team) throw new Error('Missing team.')
// 		return Schema.decodeUnknownSync(Team)(team)
// 	})
