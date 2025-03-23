import { Schema } from 'effect'

export const Role = Schema.Literal('user', 'admin') // Must align with roles table
export type Role = Schema.Schema.Type<typeof Role>

export const User = Schema.Struct({
	userId: Schema.Number,
	name: Schema.NullOr(Schema.String),
	email: Schema.String,
	role: Role
})
export type User = Schema.Schema.Type<typeof User>

export const OrganizationMemberRole = Schema.Literal('owner', 'member') // Must align with OrganizationMemberRoles table
export type OrganizationMemberRole = Schema.Schema.Type<typeof OrganizationMemberRole>

export const UserSubject = User.pick('userId', 'email', 'role')

export const SessionUser = User.pick('userId', 'email', 'role')
export type SessionUser = Schema.Schema.Type<typeof SessionUser>

export const SessionData = Schema.Struct({
	sessionUser: Schema.optional(SessionUser)
})
export type SessionData = Schema.Schema.Type<typeof SessionData>

export const Organization = Schema.Struct({
	organizationId: Schema.Number,
	name: Schema.String,
	stripeCustomerId: Schema.NullOr(Schema.String),
	stripeSubscriptionId: Schema.NullOr(Schema.String),
	stripeProductId: Schema.NullOr(Schema.String),
	planName: Schema.NullOr(Schema.String),
	subscriptionStatus: Schema.NullOr(Schema.String)
})
export type Organization = Schema.Schema.Type<typeof Organization>

export const OrganizationMember = Schema.Struct({
	organizationMemberId: Schema.Number,
	organizationId: Schema.Number,
	userId: Schema.Number,
	organizationMemberRole: OrganizationMemberRole
})
export type OrganizationMember = Schema.Schema.Type<typeof OrganizationMember>

export const OrganizationMemberWithUser = Schema.Struct({
	...OrganizationMember.fields,
	user: User
})
export type OrganizationMemberWithUser = Schema.Schema.Type<typeof OrganizationMemberWithUser>

export const OrganizationWithOrganizationMembers = Schema.Struct({
	...Organization.fields,
	organizationMembers: Schema.Array(OrganizationMemberWithUser)
})
export type OrganizationWithOrganizationMembers = Schema.Schema.Type<typeof OrganizationWithOrganizationMembers>

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

export const OrganizationResult = Schema.NullOr(Organization)
export type OrganizationResult = Schema.Schema.Type<typeof OrganizationResult>

export const OrganizationsResult = DataFromResult(Schema.Array(OrganizationWithOrganizationMembers))
export type OrganizationsResult = Schema.Schema.Type<typeof OrganizationsResult>

export const FormDataFromSelf = Schema.instanceOf(FormData).annotations({ identifier: 'FormDataFromSelf' })

// https://discord.com/channels/795981131316985866/847382157861060618/threads/1270826681505939517
// https://raw.githubusercontent.com/react-hook-form/resolvers/refs/heads/dev/effect-ts/src/effect-ts.ts
export const RecordFromFormData = Schema.transform(FormDataFromSelf, Schema.Record({ key: Schema.String, value: Schema.String }), {
	strict: false,
	decode: (formData) => Object.fromEntries(formData.entries()),
	encode: (data) => {
		const formData = new FormData()
		for (const [key, value] of Object.entries(data)) {
			formData.append(key, value)
		}
		return formData
	}
}).annotations({ identifier: 'RecordFromFormData' })

export const FormDataSchema = <A, I extends Record<string, string>, R>(schema: Schema.Schema<A, I, R>) =>
	Schema.compose(RecordFromFormData, schema, { strict: false })

// export const FormSchema = FormDataSchema(Schema.Struct({ name: Schema.String, age: Schema.NumberFromString }))
