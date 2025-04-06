import { Config, ConfigError, Effect, Either, Schema } from 'effect'
import * as ConfigEx from './ConfigEx'

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
    // env.Q.send({ type: 'email', to: 'motio1@mail.com', from: 'motio@mail.com', subject: 'this is subject', html: 'test', text: 'this is body' })

    return {
      send(payload: Payload) {
        q.send(payload)
      }
    }
  })
}) {}
