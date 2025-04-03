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
			invite: ({ emails, accountId }: Pick<Account, 'accountId'> & { readonly emails: readonly User['email'][] }) =>
				Effect.gen(function* () {
					yield* Effect.log('AccountManager: invite', { emails })
					const accountMemberCount = yield* repository.getAccountMemberCount({ accountId })
					if (accountMemberCount + emails.length > IdentityMgrLimits.maxAccountMembers) {
						return yield* Effect.fail(new Error(`Account member count exceeds the maximum limit of ${IdentityMgrLimits.maxAccountMembers}.`))
					}
					return yield* repository.invite({ emails, accountId })
				})
		}
	})
}) {}
