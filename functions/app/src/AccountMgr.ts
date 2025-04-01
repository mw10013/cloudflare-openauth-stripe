import { Effect } from 'effect'
import { Repository } from './Repository'
import { Account, User } from './schemas'

export const AccountLimits = Object.freeze({
	maxMembers: 5
})

export class AccountMgr extends Effect.Service<AccountMgr>()('AccountMgr', {
	accessors: true,
	dependencies: [Repository.Default],
	effect: Effect.gen(function* () {
		const repository = yield* Repository
		return {
			invite: ({ emails, accountId }: Pick<Account, 'accountId'> & { readonly emails: readonly User['email'][] }) =>
				Effect.gen(function* () {
					yield* Effect.log('AccountManager: invite', { emails })
					const accountMemberCount = yield* repository.getAccountMemberCount({ accountId })
					// if (accountMemberCount + emails.length > AccountLimits.maxMembers) {
					// 	return yield* Effect.fail(new Error(`Account member count exceeds the maximum limit of ${MAX_ACCOUNT_MEMBER_COUNT}.`))
					// }
					// return yield* repository.invite({ emails, accountId })
					return accountMemberCount
				})
		}
	})
}) {}
