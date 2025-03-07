import { Config, Effect, Layer } from 'effect'
import { dual } from 'effect/Function'

export class D1 extends Effect.Service<D1>()('D1', {
	accessors: true,
	effect: Effect.gen(function* () {
		const db = (yield* Config.string('D1')) as unknown as D1Database
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
	<E, R>(self: Effect.Effect<D1PreparedStatement, E, R>, ...values: unknown[]) => Effect.Effect<D1PreparedStatement, E, R>
>(
	(args) => Effect.isEffect(args[0]),
	(self, ...values) => Effect.map(self, (stmt) => stmt.bind(...values))
)

// class Repository extends Effect.Service<Repository>()("Repository", {
//  accessors: true,
//  effect: Effect.gen(function() {
//    const db = yield* Config.instanceOf(D1Database)("D1")
//    return {
//      getUsers: () =>
//        Effect.tryPromise(() => db.run(`select * from users`))
//    }
//  })
// })
