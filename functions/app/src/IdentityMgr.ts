import { Config, Effect } from 'effect'
import * as ConfigEx from './ConfigEx'
import { Account, AccountMember, User } from './Domain'
import * as Q from './Queue'
import { Repository } from './Repository'

export const IdentityMgrLimits = Object.freeze({
  maxAccountMembers: 5
})

export class IdentityMgr extends Effect.Service<IdentityMgr>()('IdentityMgr', {
  accessors: true,
  dependencies: [Repository.Default],
  effect: Effect.gen(function* () {
    const repository = yield* Repository
    return {
      provisionUser: ({ email }: Pick<User, 'email'>) => repository.upsertUser({ email }),

      getCustomers: () => repository.getCustomers(),

      getAccountForUser: ({ userId }: Pick<User, 'userId'>) => repository.getAccountForUser({ userId }),
      getAccountForMember: ({ accountId, userId }: Pick<Account, 'accountId'> & Pick<User, 'userId'>) =>
        repository.getAccountForMember({ accountId, userId }),
      setAccountStripeCustomerId: ({ userId, stripeCustomerId }: Pick<Account, 'userId' | 'stripeCustomerId'>) =>
        repository.updateAccountStripeCustomerId({ userId, stripeCustomerId }),
      setAccountStripeSubscription: ({
        stripeCustomerId,
        stripeSubscriptionId,
        stripeProductId,
        planName,
        subscriptionStatus
      }: Pick<Account, 'stripeSubscriptionId' | 'stripeProductId' | 'planName' | 'subscriptionStatus'> & {
        stripeCustomerId: NonNullable<Account['stripeCustomerId']>
      }) =>
        repository.updateAccountStripeSubscription({
          stripeCustomerId,
          stripeSubscriptionId,
          stripeProductId,
          planName,
          subscriptionStatus
        }),

      getAccounts: ({ userId }: Pick<User, 'userId'>) =>
        repository
          .getAccountMembersForUser({ userId, status: 'active' })
          .pipe(Effect.map((members) => members.map((member) => member.account))),
      getInvitations: ({ userId }: Pick<AccountMember, 'userId'>) => repository.getAccountMembersForUser({ userId, status: 'pending' }),
      acceptInvitation: ({ accountMemberId }: Pick<AccountMember, 'accountMemberId'>) =>
        repository.updateAccountMemberStatus({ accountMemberId, status: 'active' }),
      declineInvitation: ({ accountMemberId }: Pick<AccountMember, 'accountMemberId'>) =>
        repository.deleteAccountMember({ accountMemberId }),
      revokeAccountMembership: ({ accountMemberId }: Pick<AccountMember, 'accountMemberId'>) =>
        repository.deleteAccountMember({ accountMemberId, skipIfOwner: true }),

      getAccountMembers: ({ accountId }: Pick<Account, 'accountId'>) => repository.getAccountMembers({ accountId }),

      invite: ({
        emails,
        accountId,
        accountEmail
      }: Pick<Account, 'accountId'> & { readonly emails: readonly User['email'][]; readonly accountEmail: User['email'] }) =>
        Effect.gen(function* () {
          yield* Effect.log('AccountManager: invite', { emails })
          const accountMemberCount = yield* repository.getAccountMemberCount({ accountId })
          if (accountMemberCount + emails.length > IdentityMgrLimits.maxAccountMembers) {
            return yield* Effect.fail(
              new Error(`Account member count exceeds the maximum limit of ${IdentityMgrLimits.maxAccountMembers}.`)
            )
          }
          const invalidInviteEmails = yield* repository.identifyInvalidInviteEmails({ emails, accountId })
          if (invalidInviteEmails.staffers.length > 0 || invalidInviteEmails.pending.length > 0 || invalidInviteEmails.active.length > 0) {
            const details: string[] = []
            if (invalidInviteEmails.staffers.length > 0) {
              details.push(`Invalid: [${invalidInviteEmails.staffers.join(', ')}]`)
            }
            if (invalidInviteEmails.pending.length > 0) {
              details.push(`Already invited: [${invalidInviteEmails.pending.join(', ')}]`)
            }
            if (invalidInviteEmails.active.length > 0) {
              details.push(`Already member: [${invalidInviteEmails.active.join(', ')}]`)
            }
            return yield* Effect.fail(new Error(`Invalid invite emails: ${details.join(', ')}`))
          }
          yield* repository.createAccountMembers({ emails, accountId })
          const from = yield* Config.nonEmptyString('COMPANY_EMAIL')
          const payloads = emails.map((email) => ({
            type: 'email' as const,
            to: email,
            from,
            subject: 'Invite',
            html: `Hey ${email},<br><br>You are invited to the account of ${accountEmail}<br><br>Thanks, Team.`,
            text: `Hey ${email},<br><br>You are invited to the account of ${accountEmail}<br><br>Thanks, Team.`
          }))
          yield* Q.Producer.sendBatch(payloads)
        })
    }
  })
}) {}
