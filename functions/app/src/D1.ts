import { Effect, Layer } from 'effect'

export const make = ({ db }: { db: D1Database }) => ({
	prepare: (query: string) => db.prepare(query),
	batch: (statements: D1PreparedStatement[]) => Effect.tryPromise(() => db.batch(statements)),
	run: (statement: D1PreparedStatement) => Effect.tryPromise(() => statement.run()),
	first: (statement: D1PreparedStatement) => Effect.tryPromise(() => statement.first())
})

export class D1 extends Effect.Tag('D1')<D1, ReturnType<typeof make>>() {}

export const layer = ({ db }: { db: D1Database }): Layer.Layer<D1, never> => Layer.succeed(D1, make({ db }))
