import { Config, Effect, Option, Schema } from 'effect'
import { KV } from './KV'
import { Tally } from './SchemaEx'

export class Poll extends Effect.Service<Poll>()('Poll', {
	accessors: true,
	dependencies: [KV.Default],
	effect: Effect.gen(function* () {
		const kv = yield* KV
		const key = yield* Config.nonEmptyString('KV_TALLY_KEY')
		return {
			getTally: () =>
				Effect.gen(function* () {
					const tallyOption = yield* kv.get(key).pipe(Effect.tap((tallyOption) => Effect.log({ tallyOption })))
					const tally = yield* tallyOption.pipe(
						Effect.flatMap(Schema.decodeUnknown(Schema.parseJson(Tally))),
						Effect.orElse(() => Effect.succeed({ traditionCount: 4, modernCount: 5 }))
					)
					if (Option.isNone(tallyOption)) {
						yield* Schema.encode(Schema.parseJson(Tally))(tally).pipe(
							Effect.tap((value) => Effect.log({ value })),
							Effect.flatMap((value) => kv.put(key, value))
						)
					}
					return tally
				}),
			vote: (voterId: string, vote: 'tradition' | 'modern') =>
				Effect.gen(function* () {
					yield* Effect.log({ voterId, vote })
					yield* kv.delete(key)
				})
		}
	})
}) {}
