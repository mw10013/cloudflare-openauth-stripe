import { Config, ConfigError, Effect, Either, Predicate, Schedule } from 'effect'
import * as ConfigEx from './ConfigEx'

export class KV extends Effect.Service<KV>()('KV', {
	accessors: true,
	effect: Effect.gen(function* () {
		const kv = yield* ConfigEx.object('KV').pipe(
			Config.mapOrFail((object) =>
				Predicate.hasProperty(object, 'get') && typeof object.get === 'function' && 'put' in object && typeof object.put === 'function'
					? Either.right(object as KVNamespace)
					: Either.left(ConfigError.InvalidData([], `Expected a KVNamespace but received ${object}`))
			)
		)
		const tryPromise = <A>(evaluate: (signal: AbortSignal) => PromiseLike<A>) =>
			Effect.tryPromise(evaluate).pipe(
				Effect.tapError((error) => Effect.log(error)),
				Effect.retry({
					times: 2,
					schedule: Schedule.exponential('1 second')
				})
			)
		return {
			get: (key: string) => tryPromise(() => kv.get(key, 'json')),
			put: (key: string, value: string, options?: KVNamespacePutOptions) => tryPromise(() => kv.put(key, value, options)),
			delete: (key: string) => tryPromise(() => kv.delete(key))
		}
	})
}) {}
