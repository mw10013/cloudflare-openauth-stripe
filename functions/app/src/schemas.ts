import { ParseResult, Schema } from 'effect'

export const Role = Schema.Literal('user', 'admin') // Must align with roles table
export type Role = Schema.Schema.Type<typeof Role>

export const User = Schema.Struct({
	userId: Schema.Number,
	name: Schema.NullOr(Schema.String),
	email: Schema.String,
	role: Role
})
export type User = Schema.Schema.Type<typeof User>

export const TeamMemberRole = Schema.Literal('owner', 'member') // Must align with teamMemberRoles table
export type TeamMemberRole = Schema.Schema.Type<typeof TeamMemberRole>

export const UserSubject = User.pick('userId', 'email', 'role')

export const SessionUser = User.pick('userId', 'email', 'role')
export type SessionUser = Schema.Schema.Type<typeof SessionUser>

export const SessionData = Schema.Struct({
	sessionUser: Schema.optional(SessionUser)
})
export type SessionData = Schema.Schema.Type<typeof SessionData>

export const Team = Schema.Struct({
	teamId: Schema.Number,
	name: Schema.String,
	stripeCustomerId: Schema.NullOr(Schema.String),
	stripeSubscriptionId: Schema.NullOr(Schema.String),
	stripeProductId: Schema.NullOr(Schema.String),
	planName: Schema.NullOr(Schema.String),
	subscriptionStatus: Schema.NullOr(Schema.String)
})
export type Team = Schema.Schema.Type<typeof Team>

export const TeamMember = Schema.Struct({
	teamMemberId: Schema.Number,
	teamId: Schema.Number,
	userId: Schema.Number,
	teamMemberRole: TeamMemberRole
})
export type TeamMember = Schema.Schema.Type<typeof TeamMember>

export const TeamMemberWithUser = Schema.Struct({
	...TeamMember.fields,
	user: User
})
export type TeamMemberWithUser = Schema.Schema.Type<typeof TeamMemberWithUser>

export const TeamWithTeamMembers = Schema.Struct({
	...Team.fields,
	teamMembers: Schema.Array(TeamMemberWithUser)
})
export type TeamWithTeamMembers = Schema.Schema.Type<typeof TeamWithTeamMembers>

export const DataFromResult = Schema.transform(
	Schema.Struct({
		data: Schema.String
	}),
	Schema.parseJson(Schema.Array(TeamWithTeamMembers)),
	{
		strict: true,
		decode: (result) => result.data,
		encode: (value) => ({ data: value })
	}
)
export type DataFromResult = Schema.Schema.Type<typeof DataFromResult>

export const TeamsResult = Schema.NullOr(DataFromResult)
export type TeamsResult = Schema.Schema.Type<typeof TeamsResult>
