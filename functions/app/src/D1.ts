import { Context, Effect, Layer } from 'effect'
import { UnknownException } from 'effect/Cause'

export interface D1Service {
	readonly prepare: (query: string) => D1PreparedStatement
	readonly batch: (statements: D1PreparedStatement[]) => Effect.Effect<D1Result[], UnknownException>
	readonly run: (statement: D1PreparedStatement) => Effect.Effect<D1Result, UnknownException>
	readonly first: (statement: D1PreparedStatement) => Effect.Effect<Record<string, unknown> | null, UnknownException>
}

export class D1 extends Context.Tag('D1')<D1, D1Service>() {}

export const make = ({ db }: { db: D1Database }): D1Service => ({
	prepare: (query) => db.prepare(query),
	batch: (statements) => Effect.tryPromise(() => db.batch(statements)),
	run: (statement) => Effect.tryPromise(() => statement.run()),
	first: (statement) => Effect.tryPromise(() => statement.first())
})

export const layer = ({ db }: { db: D1Database }): Layer.Layer<D1, never> => Layer.succeed(D1, make({ db }))
