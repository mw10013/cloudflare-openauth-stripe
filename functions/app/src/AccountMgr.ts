import { Effect } from 'effect'
import { Repository } from './Repository'

export class AccountMgr extends Effect.Service<AccountMgr>()('AccountMgr', {
	accessors: true,
	dependencies: [Repository.Default],
	effect: Effect.gen(function* () {
		const repository = yield* Repository
		return {
			invite: (props: { readonly emails: readonly string[] }) =>
				Effect.gen(function* () {
					yield* Effect.log('AccountManager: invite', { emails: props.emails })
					return yield* repository.invite(props)
				})
		}
	})
}) {}
