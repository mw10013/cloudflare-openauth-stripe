import { Config, ConfigError, Effect, Either, Layer } from 'effect'
import { dual } from 'effect/Function'

export class D1 extends Effect.Service<D1>()('D1', {
	accessors: true,
	effect: Effect.gen(function* () {
		// const db = yield* Config.string('D1') as unknown as D1Database
		const db = yield* Config.string('D1').pipe(
			Config.mapOrFail((value) =>
				// (value as unknown) instanceof D1Database
				value !== null && typeof value === 'object' && 'prepare' in value && typeof (value as any).prepare === 'function'
					? Either.right(value as unknown as D1Database)
					: Either.left(ConfigError.InvalidData(['D1'], `Expected D1Database but got ${typeof value}`))
			)
		)
		return {
			prepare: (query: string) => db.prepare(query),
			batch: (statements: D1PreparedStatement[]) => Effect.tryPromise(() => db.batch(statements)),
			run: (statement: D1PreparedStatement) => Effect.tryPromise(() => statement.run()),
			first: (statement: D1PreparedStatement) => Effect.tryPromise(() => statement.first())
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
