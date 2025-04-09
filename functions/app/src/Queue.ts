import { Config, ConfigError, Effect, Either, Layer, Logger, LogLevel, ManagedRuntime, Schema } from 'effect'
import * as CloudflareEx from './CloudflareEx'
import * as ConfigEx from './ConfigEx'
import { Ses } from './Ses'

export const EmailPayload = Schema.Struct({
  type: Schema.Literal('email'),
  to: Schema.String,
  from: Schema.String,
  html: Schema.String,
  text: Schema.String,
  subject: Schema.String
})
export type EmailPayload = Schema.Schema.Type<typeof EmailPayload>

export const Payload = Schema.Union(EmailPayload)
export type Payload = Schema.Schema.Type<typeof Payload>

export const queue = (batch: MessageBatch, env: Env, ctx: ExecutionContext): Promise<void> => {
  const runtime = Layer.mergeAll(Ses.Default).pipe(CloudflareEx.provideLoggerAndConfig, ManagedRuntime.make)
  return Effect.gen(function* () {
    for (const message of batch.messages) {
      const payload = yield* Schema.decodeUnknown(EmailPayload)(message.body)
      yield* Effect.log({ message: `Queue: processing message: ${message.id}`, payload })
      switch (payload.type) {
        case 'email': {
          yield* Ses.sendEmail({
            to: payload.to,
            from: payload.from,
            subject: payload.subject,
            html: payload.html,
            text: payload.text
          }).pipe(
            Effect.map(() => message.ack()),
            Effect.tapError((e) => Effect.logError({ message: `Queue: error processing message: ${message.id}: ${e.message}`, payload })),
            Effect.orElse(() => Effect.sync(() => message.retry()))
          )
          break
        }
        default:
          yield* Effect.log(`Unknown payload type ${payload.type}`)
      }
    }
  }).pipe(runtime.runPromise)
}

export class Producer extends Effect.Service<Producer>()('Producer', {
  accessors: true,
  effect: Effect.gen(function* () {
    const q = yield* ConfigEx.object('Q').pipe(
      Config.mapOrFail((object) =>
        'send' in object && typeof object.send === 'function' && 'sendBatch' in object && typeof object.sendBatch === 'function'
          ? Either.right(object as Queue)
          : Either.left(ConfigError.InvalidData([], `Expected a Queue but received ${object}`))
      )
    )
    return {
      send: (payload: Payload) => Effect.tryPromise(() => q.send(payload)),
      sendBatch: (payloads: Payload[]) => Effect.tryPromise(() => q.sendBatch(payloads.map((payload) => ({ body: payload }))))
    }
  })
}) {}
