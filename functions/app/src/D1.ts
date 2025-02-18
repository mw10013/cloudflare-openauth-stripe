import { Context, Effect, Layer } from 'effect'
import { UnknownException } from 'effect/Cause'

export interface D1Service {
	readonly prepare: (query: string) => D1PreparedStatement
	readonly batch: (statements: D1PreparedStatement[]) => Effect.Effect<D1Result[], UnknownException>
}

export class D1 extends Context.Tag('D1')<D1, D1Service>() {}

export const make = ({ db }: { db: D1Database }): D1Service => ({
	prepare: (query) => db.prepare(query),
	batch: (statements) => Effect.tryPromise(() => db.batch(statements))
})

export const layer = ({ db }: { db: D1Database }): Layer.Layer<D1, never> => Layer.succeed(D1, make({ db }))

export const run = (stmt: D1PreparedStatement) => Effect.tryPromise(() => stmt.run())
export const first = (stmt: D1PreparedStatement) => Effect.tryPromise(() => stmt.first())
