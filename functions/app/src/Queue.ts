import { Config, ConfigError, Console, Effect, Either, Layer, Logger, LogLevel, ManagedRuntime, Schema } from 'effect'
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
  const LogLevelLive = Config.logLevel('LOG_LEVEL').pipe(
    Config.withDefault(LogLevel.Info),
    Effect.map((level) => Logger.minimumLogLevel(level)),
    Layer.unwrapEffect
  )
  const ConfigLive = ConfigEx.fromObject(env)
  const runtime = Layer.mergeAll(
    Ses.Default,
    // Logger.replace(Logger.defaultLogger, env.ENVIRONMENT === 'local' ? Logger.defaultLogger : Logger.jsonLogger)
    ).pipe(Layer.provide(LogLevelLive), Layer.provide(ConfigLive), ManagedRuntime.make)
  return Effect.gen(function* () {
    yield* Effect.log(`Queue started with ${batch.messages.length} messages`)
    yield* Console.log(`Console: Queue started with ${batch.messages.length} messages`)
    for (const message of batch.messages) {
      const payload = yield* Schema.decodeUnknown(EmailPayload)(message.body)
      yield* Effect.log(`Processing message ${message.id}`, payload, message.body)
      yield* Console.log(`Console: Processing message ${message.id}`, payload, message.body)
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
            Effect.orElse(() => Effect.sync(() => message.retry()))
          )
          break
        }
        default:
          yield* Effect.log(`Unknown payload type ${payload.type}`)
      }
      // console.log('Received', payload)
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
