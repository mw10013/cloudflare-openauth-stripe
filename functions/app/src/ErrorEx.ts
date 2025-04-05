import { Data, Effect } from 'effect'

// https://github.com/epicweb-dev/invariant/blob/main/README.md
export class InvariantError extends Data.TaggedError('InvariantError')<{ message: string }> {}
export class InvariantResponseError extends Data.TaggedError('InvariantResponseError')<{ message: string; response: Response }> {}

// invariant(typeof name === 'string', 'Name must be a string')

// export function invariant(
// 	condition: unknown,
// 	message: string | (() => string),
// ): asserts condition {
// 	if (!condition) {
// 		throw new InvariantError(
// 			typeof message === 'function' ? message() : message,
// 		)
// 	}`
// }

// export const invariant = (condition: unknown, message: string | (() => string)): asserts condition => {
//   if (!condition) {
//     throw new InvariantError({
//       message: typeof message === 'function' ? message() : message
//     })
//   }
// }

// export function invariantEffect<A, E, R>(
//   self: Effect.Effect<A, E, R>,
//   condition: (v: A) => boolean,
//   message: string | (() => string)
// ): Effect.Effect<A, E | InvariantError, R> {
//   return Effect.flatMap(self, (v) =>
//     condition(v) ? Effect.succeed(v) : Effect.fail(new InvariantError({ message: typeof message === 'function' ? message() : message }))
//   )
// }
