import { Cause, Config, ConfigError, Console, Data, Effect, Either, Predicate, Schedule } from 'effect'
import { dual } from 'effect/Function'
import * as ConfigEx from './ConfigEx'

export class D1Error extends Data.TaggedError('D1Error')<{
	message: string
	cause: Error
}> {}

export class D1 extends Effect.Service<D1>()('D1', {
	accessors: true,
	effect: Effect.gen(function* () {
		const db = yield* ConfigEx.object('D1').pipe(
			Config.mapOrFail((object) =>
				'prepare' in object && typeof object.prepare === 'function' && 'batch' in object && typeof object.batch === 'function'
					? Either.right(object as D1Database)
					: Either.left(ConfigError.InvalidData([], `Expected a D1 database but received ${object}`))
			)
		)
		const tryPromise = <A>(evaluate: (signal: AbortSignal) => PromiseLike<A>) =>
			Effect.tryPromise(evaluate).pipe(
				Effect.mapError((error) =>
					// https://developers.cloudflare.com/d1/observability/debug-d1/#error-list
					Cause.isUnknownException(error) && Predicate.isError(error.cause) && error.cause.message.startsWith('D1_')
						? new D1Error({ message: error.cause.message, cause: error.cause })
						: error
				),
				Effect.tapError((error) => Console.log(error)),
				Effect.retry({
					// https://www.sqlite.org/rescode.html
					while: (error) =>
						Predicate.isTagged(error, 'D1Error') &&
						!['SQLITE_CONSTRAINT', 'SQLITE_ERROR', 'SQLITE_MISMATCH'].some((pattern) => error.message.includes(pattern)),
					times: 2,
					schedule: Schedule.exponential('1 second')
				})
			)
		return {
			prepare: (query: string) => db.prepare(query),
			batch: (statements: D1PreparedStatement[]) => tryPromise(() => db.batch(statements)),
			run: (statement: D1PreparedStatement) => tryPromise(() => statement.run()),
			first: (statement: D1PreparedStatement) => tryPromise(() => statement.first())
		}
	})
}) {}

export const bind = dual<
	(...values: unknown[]) => <E, R>(self: Effect.Effect<D1PreparedStatement, E, R>) => Effect.Effect<D1PreparedStatement, E, R>,
	<E, R>(...args: [Effect.Effect<D1PreparedStatement, E, R>, ...unknown[]]) => Effect.Effect<D1PreparedStatement, E, R>
>(
	(args) => Effect.isEffect(args[0]),
	(self, ...values) => Effect.map(self, (stmt) => stmt.bind(...values))
)

// export const make = ({ db }: { db: D1Database }) => ({
// 	prepare: (query: string) => db.prepare(query),
// 	batch: (statements: D1PreparedStatement[]) => Effect.tryPromise(() => db.batch(statements)),
// 	run: (statement: D1PreparedStatement) => Effect.tryPromise(() => statement.run()),
// 	first: (statement: D1PreparedStatement) => Effect.tryPromise(() => statement.first())
// })

// export class D1 extends Effect.Tag('D1')<D1, ReturnType<typeof make>>() {}

// export const layer = ({ db }: { db: D1Database }) => Layer.succeed(D1, make({ db }))
