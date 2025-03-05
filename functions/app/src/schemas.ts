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

// export const DataFromResult = <A, I>(DataSchema: Schema.Schema<A, I>) =>
// 	Schema.NullOr(
// 		Schema.transform(
// 			Schema.Struct({
// 				data: Schema.String
// 			}),
// 			Schema.parseJson(DataSchema),
// 			{
// 				strict: true,
// 				decode: (result) => result.data,
// 				encode: (value) => ({ data: value })
// 			}
// 		)
// 	)

export const DataFromResult = <A, I>(DataSchema: Schema.Schema<A, I>) =>
	Schema.transform(
		Schema.Struct({
			data: Schema.String
		}),
		Schema.parseJson(DataSchema),
		{
			strict: true,
			decode: (result) => result.data,
			encode: (value) => ({ data: value })
		}
	)

export const TeamResult = Schema.NullOr(Team)
export type TeamResult = Schema.Schema.Type<typeof TeamResult>

export const TeamsResult = DataFromResult(Schema.Array(TeamWithTeamMembers))
export type TeamsResult = Schema.Schema.Type<typeof TeamsResult>

export const FormDataFromSelf = Schema.instanceOf(FormData).annotations({ identifier: 'FormDataFromSelf' })

// https://discord.com/channels/795981131316985866/847382157861060618/threads/1270826681505939517
// https://raw.githubusercontent.com/react-hook-form/resolvers/refs/heads/dev/effect-ts/src/effect-ts.ts
export const RecordFromFormData = Schema.transform(
  FormDataFromSelf,
  Schema.Record({ key: Schema.String, value: Schema.String }),
  {
    strict: false,
    decode: (formData) => Object.fromEntries(formData.entries()),
    encode: (data) => {
      const formData = new FormData()
      for (const [key, value] of Object.entries(data)) {
        formData.append(key, value)
      }
      return formData
    }	
  }
).annotations({ identifier: 'RecordFromFormData' })

export const FormDataSchema = <A, I extends Record<string, string>, R>(schema: Schema.Schema<A, I, R>) =>
  Schema.compose(RecordFromFormData, schema, { strict: false })

// export const FormSchema = FormDataSchema(Schema.Struct({ name: Schema.String, age: Schema.NumberFromString }))

