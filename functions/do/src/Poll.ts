import { Config, ConfigError, Effect, Either, Predicate } from 'effect'
import * as ConfigEx from './ConfigEx'

export class Poll extends Effect.Service<Poll>()('Poll', {
	accessors: true,
	dependencies: [],
	effect: Effect.gen(function* () {
		const doDo = yield* ConfigEx.object('DO').pipe(
			Config.mapOrFail((object) =>
				Predicate.hasProperty(object, 'idFromName') && typeof object.idFromName === 'function'
					? Either.right(object as Env['DO'])
					: Either.left(ConfigError.InvalidData([], `Expected a DurableObjectNamespace but received ${object}`))
			)
		)
		const id = doDo.idFromName('poll')
		const stub = doDo.get(id)
		return {
			getTally: () => Effect.tryPromise(() => stub.getTally()),
			vote: (voterId: string, vote: 'tradition' | 'modern') => Effect.tryPromise(() => stub.vote(voterId, vote))
		}
	})
}) {}
