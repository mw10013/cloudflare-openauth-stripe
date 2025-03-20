import { Config, ConfigError, Effect, Either, Option, Predicate, Schema } from 'effect'
import * as ConfigEx from './ConfigEx'
import { KV } from './KV'
import { TallyFromString } from './SchemaEx'

export class Poll extends Effect.Service<Poll>()('Poll', {
	accessors: true,
	dependencies: [KV.Default],
	effect: Effect.gen(function* () {
		const pollDo = yield* ConfigEx.object('POLL_DO').pipe(
			Config.mapOrFail((object) =>
				Predicate.hasProperty(object, 'idFromName') && typeof object.idFromName === 'function'
					? Either.right(object as Env['POLL_DO'])
					: Either.left(ConfigError.InvalidData([], `Expected a DurableObjectNamespace but received ${object}`))
			)
		)
		const id = pollDo.idFromName('poll')
		const stub = pollDo.get(id)
		const kv = yield* KV
		const key = yield* Config.nonEmptyString('KV_TALLY_KEY')
		return {
			getTally: () =>
				Effect.gen(function* () {
					const tallyOption = yield* kv.get(key).pipe(Effect.map((option) => Option.flatMap(option, Schema.decodeOption(TallyFromString))))
					const tally = yield* tallyOption.pipe(Effect.orElse(() => Effect.tryPromise(() => stub.getTally())))
					if (Option.isNone(tallyOption)) {
						yield* Schema.encode(TallyFromString)(tally).pipe(Effect.flatMap((value) => kv.put(key, value)))
					}
					return tally
				}),
			vote: (voterId: string, vote: 'tradition' | 'modern') =>
				Effect.gen(function* () {
					yield* Effect.log({ voterId, vote })
					yield* Effect.tryPromise(() => stub.vote(voterId, vote))
					yield* kv.delete(key)
				})
		}
	})
}) {}
