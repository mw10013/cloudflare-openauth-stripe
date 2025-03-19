import { Effect } from 'effect'

export class Poll extends Effect.Service<Poll>()('Poll', {
	accessors: true,
	effect: Effect.gen(function* () {
		return {
			getTally: () => Effect.succeed({ traditionCount: 7, modernCount: 77 })
		}
	})
}) {}
