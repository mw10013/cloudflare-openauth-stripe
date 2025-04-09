import { Schema } from 'effect'
import { DataFromResult } from './SchemaEx'

export const UserType = Schema.Literal('customer', 'staffer') // Must align with UserType table
export type UserType = Schema.Schema.Type<typeof UserType>

export const User = Schema.Struct({
  userId: Schema.Number,
  name: Schema.NullOr(Schema.String),
  email: Schema.String,
  userType: UserType,
  createdAt: Schema.DateFromString,
  updatedAt: Schema.DateFromString,
  deletedAt: Schema.NullOr(Schema.DateFromString)
})
export type User = Schema.Schema.Type<typeof User>

export const UserSubject = User.pick('userId', 'email', 'userType')

export const SessionUser = User.pick('userId', 'email', 'userType')
export type SessionUser = Schema.Schema.Type<typeof SessionUser>

export const SessionData = Schema.Struct({
  sessionUser: Schema.optional(SessionUser)
})
export type SessionData = Schema.Schema.Type<typeof SessionData>

export const Account = Schema.Struct({
  accountId: Schema.Number,
  userId: Schema.Number,
  stripeCustomerId: Schema.NullOr(Schema.String),
  stripeSubscriptionId: Schema.NullOr(Schema.String),
  stripeProductId: Schema.NullOr(Schema.String),
  planName: Schema.NullOr(Schema.String),
  subscriptionStatus: Schema.NullOr(Schema.String)
})
export type Account = Schema.Schema.Type<typeof Account>

export const AccountWithUser = Schema.Struct({
  ...Account.fields,
  user: User
})
export type AccountWithUser = Schema.Schema.Type<typeof AccountWithUser>

export const AccountMemberStatus = Schema.Literal('pending', 'active') // Must align with AccountMemberStatus table
export type AccountMemberStatus = Schema.Schema.Type<typeof UserType>

export const AccountMemberRole = Schema.Literal('admin', 'editor', 'viewer') // Must align with AccountMemberRole table
export type AccountMemberRole = Schema.Schema.Type<typeof UserType>

export const AccountMember = Schema.Struct({
  accountMemberId: Schema.Number,
  userId: Schema.Number,
  accountId: Schema.Number,
  status: AccountMemberStatus,
  role: AccountMemberRole
})
export type AccountMember = Schema.Schema.Type<typeof AccountMember>

export const AccountMemberWithUser = Schema.Struct({
  ...AccountMember.fields,
  user: User
})
export type AccountMemberWithUser = Schema.Schema.Type<typeof AccountMemberWithUser>

export const AccountMemberWithAccount = Schema.Struct({
  ...AccountMember.fields,
  account: AccountWithUser
})
export type AccountMemberWithAccount = Schema.Schema.Type<typeof AccountMemberWithAccount>

export const AccountWithAccountMembers = Schema.Struct({
  ...Account.fields,
  accountMembers: Schema.Array(AccountMemberWithUser)
})
export type AccountWithAccountMembers = Schema.Schema.Type<typeof AccountWithAccountMembers>

export const Customer = Schema.Struct({
  ...User.fields,
  account: AccountWithAccountMembers
})
export type Customer = Schema.Schema.Type<typeof Customer>
