import { Data } from "effect";

// https://github.com/epicweb-dev/invariant/blob/main/README.md
export class InvariantError extends Data.TaggedError('InvariantError')<{ message: string }> {}
export class InvariantResponseError extends Data.TaggedError('InvariantResponseError')<{ message: string; response: Response }> {}

