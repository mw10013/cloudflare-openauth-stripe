import { Context, Effect, Layer } from 'effect'
import { UnknownException } from 'effect/Cause'

export interface D1Service {
	readonly prepare: (query: string) => D1PreparedStatement;
	readonly batch: (statements: D1PreparedStatement[]) => Effect.Effect<D1Result[], UnknownException>
}

// export const D1 = Context.GenericTag<D1>('D1')
export class D1 extends Context.Tag('D1')<D1, D1Service>() {}

export const make = ({ db }: { db: D1Database }): D1Service => ({
	prepare: (query) => db.prepare(query),
	batch: (statements) => Effect.tryPromise(() => db.batch(statements))
})

export const layer = ({ db }: { db: D1Database }): Layer.Layer<D1, never> => Layer.succeed(D1, make({ db }))

export const run = (stmt: D1PreparedStatement) => Effect.tryPromise(() => stmt.run())
export const first = (stmt: D1PreparedStatement) => Effect.tryPromise(() => stmt.first())

// export const layer = (
//   config: D1ClientConfig
// ): Layer.Layer<D1Client | Client.SqlClient, ConfigError> =>
//   Layer.scopedContext(
//     Effect.map(make(config), (client) =>
//       Context.make(D1Client, client).pipe(
//         Context.add(Client.SqlClient, client)
//       ))
//   ).pipe(Layer.provide(Reactivity.layer))

// export interface D1ClientConfig {
//   readonly db: D1Database
//   readonly prepareCacheSize?: number | undefined
//   readonly prepareCacheTTL?: Duration.DurationInput | undefined
//   readonly spanAttributes?: Record<string, unknown> | undefined

//   readonly transformResultNames?: ((str: string) => string) | undefined
//   readonly transformQueryNames?: ((str: string) => string) | undefined
// }

// /**
//  * @category constructor
//  * @since 1.0.0
//  */
// export const make = (
//   options: D1ClientConfig
// ): Effect.Effect<D1Client, never, Scope.Scope | Reactivity.Reactivity> =>
//   Effect.gen(function*() {
//     const compiler = Statement.makeCompilerSqlite(options.transformQueryNames)
//     const transformRows = options.transformResultNames ?
//       Statement.defaultTransforms(options.transformResultNames).array :
//       undefined

//     const makeConnection = Effect.gen(function*() {
//       const db = options.db

//       const prepareCache = yield* Cache.make({
//         capacity: options.prepareCacheSize ?? 200,
//         timeToLive: options.prepareCacheTTL ?? Duration.minutes(10),
//         lookup: (sql: string) =>
//           Effect.try({
//             try: () => db.prepare(sql),
//             catch: (cause) => new SqlError({ cause, message: `Failed to prepare statement` })
//           })
//       })

//       const runStatement = (
//         statement: D1PreparedStatement,
//         params: ReadonlyArray<Statement.Primitive> = []
//       ): Effect.Effect<ReadonlyArray<any>, SqlError, never> =>
//         Effect.tryPromise({
//           try: async () => {
//             const response = await statement.bind(...params).all()
//             if (response.error) {
//               throw response.error
//             }
//             return response.results || []
//           },
//           catch: (cause) => new SqlError({ cause, message: `Failed to execute statement` })
//         })

//       const runRaw = (
//         sql: string,
//         params: ReadonlyArray<Statement.Primitive> = []
//       ) => runStatement(db.prepare(sql), params)

//       const runCached = (
//         sql: string,
//         params: ReadonlyArray<Statement.Primitive> = []
//       ) => Effect.flatMap(prepareCache.get(sql), (s) => runStatement(s, params))

//       const runUncached = (
//         sql: string,
//         params: ReadonlyArray<Statement.Primitive> = []
//       ) => runRaw(sql, params)

//       const runValues = (
//         sql: string,
//         params: ReadonlyArray<Statement.Primitive>
//       ) =>
//         Effect.flatMap(
//           prepareCache.get(sql),
//           (statement) =>
//             Effect.tryPromise({
//               try: () => {
//                 return statement.bind(...params).raw() as Promise<
//                   ReadonlyArray<
//                     ReadonlyArray<Statement.Primitive>
//                   >
//                 >
//               },
//               catch: (cause) => new SqlError({ cause, message: `Failed to execute statement` })
//             })
//         )

//       return identity<Connection>({
//         execute(sql, params, transformRows) {
//           return transformRows
//             ? Effect.map(runCached(sql, params), transformRows)
//             : runCached(sql, params)
//         },
//         executeRaw(sql, params) {
//           return runRaw(sql, params)
//         },
//         executeValues(sql, params) {
//           return runValues(sql, params)
//         },
//         executeUnprepared(sql, params, transformRows) {
//           return transformRows
//             ? Effect.map(runUncached(sql, params), transformRows)
//             : runUncached(sql, params)
//         },
//         executeStream(_sql, _params) {
//           return Effect.dieMessage("executeStream not implemented")
//         }
//       })
//     })

//     const connection = yield* makeConnection
//     const acquirer = Effect.succeed(connection)
//     const transactionAcquirer = Effect.dieMessage("transactions are not supported in D1")

//     return Object.assign(
//       (yield* Client.make({
//         acquirer,
//         compiler,
//         transactionAcquirer,
//         spanAttributes: [
//           ...(options.spanAttributes ? Object.entries(options.spanAttributes) : []),
//           [Otel.SEMATTRS_DB_SYSTEM, Otel.DBSYSTEMVALUES_SQLITE]
//         ],
//         transformRows
//       })) as D1Client,
//       {
//         [TypeId]: TypeId as TypeId,
//         config: options
//       }
//     )
//   })
