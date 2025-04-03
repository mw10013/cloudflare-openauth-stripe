import { Effect } from 'effect'
import { Repository } from './Repository'
import { Account, User } from './schemas'

export const IdentityMgrLimits = Object.freeze({
	maxAccountMembers: 5
})

export class IdentityMgr extends Effect.Service<IdentityMgr>()('IdentityMgr', {
	accessors: true,
	dependencies: [Repository.Default],
	effect: Effect.gen(function* () {
		const repository = yield* Repository
		return {
			getAccountMembers: ({ accountId }: Pick<Account, 'accountId'>) => Repository.getAccountMembers({ accountId }),

			invite: ({ emails, accountId }: Pick<Account, 'accountId'> & { readonly emails: readonly User['email'][] }) =>
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
					return yield* repository.createAccountMembers({ emails, accountId })
				})
		}
	})
}) {}
