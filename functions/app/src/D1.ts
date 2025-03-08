import { Cause, Config, ConfigError, Console, Data, Effect, Either, Predicate, Schedule } from 'effect'
import { dual } from 'effect/Function'

class D1Error extends Data.TaggedError('D1Error')<{
	message: string
	cause: Error
}> {}

export class D1 extends Effect.Service<D1>()('D1', {
	accessors: true,
	effect: Effect.gen(function* () {
		const db = yield* Config.string('D1').pipe(
			Config.mapOrFail((value) =>
				value !== null && typeof value === 'object' && 'prepare' in value && typeof (value as any).prepare === 'function'
					? Either.right(value as unknown as D1Database)
					: Either.left(ConfigError.InvalidData([], `Expected a D1 database but received ${value}`))
			)
		)
		const retry = <A, E, R>(self: Effect.Effect<A, E, R>) =>
			Effect.mapError(self, (error) =>
				// https://developers.cloudflare.com/d1/observability/debug-d1/#error-list
				Cause.isUnknownException(error) && Predicate.isError(error.cause) && error.cause.message.startsWith('D1_')
					? new D1Error({ message: error.cause.message, cause: error.cause })
					: error
			).pipe(
				Effect.tapError((error) => Console.log(error)),
				Effect.retry({
					while: (error) => Predicate.isTagged(error, 'D1Error') && !['no such table'].some((pattern) => error.message.includes(pattern)),
					times: 2,
					schedule: Schedule.exponential('1 second')
				})
			)

		return {
			prepare: (query: string) => db.prepare(query),
			batch: (statements: D1PreparedStatement[]) => Effect.tryPromise(() => db.batch(statements)).pipe(retry),
			run: (statement: D1PreparedStatement) => Effect.tryPromise(() => statement.run()).pipe(retry),
			// run: (statement: D1PreparedStatement) => Effect.tryPromise({ try: () => statement.run(), catch: (error) => error }).pipe(retry),
			first: (statement: D1PreparedStatement) => Effect.tryPromise(() => statement.first()).pipe(retry)
		}
	})
}) {}

// export const make = ({ db }: { db: D1Database }) => ({
// 	prepare: (query: string) => db.prepare(query),
// 	batch: (statements: D1PreparedStatement[]) => Effect.tryPromise(() => db.batch(statements)),
// 	run: (statement: D1PreparedStatement) => Effect.tryPromise(() => statement.run()),
// 	first: (statement: D1PreparedStatement) => Effect.tryPromise(() => statement.first())
// })

// export class D1 extends Effect.Tag('D1')<D1, ReturnType<typeof make>>() {}

// export const layer = ({ db }: { db: D1Database }) => Layer.succeed(D1, make({ db }))

export const bind = dual<
	(...values: unknown[]) => <E, R>(self: Effect.Effect<D1PreparedStatement, E, R>) => Effect.Effect<D1PreparedStatement, E, R>,
	<E, R>(...args: [Effect.Effect<D1PreparedStatement, E, R>, ...unknown[]]) => Effect.Effect<D1PreparedStatement, E, R>
>(
	(args) => Effect.isEffect(args[0]),
	(self, ...values) => Effect.map(self, (stmt) => stmt.bind(...values))
)
