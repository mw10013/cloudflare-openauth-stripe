import { AwsClient } from 'aws4fetch'
import { Config, Effect, Redacted } from 'effect'

// https://www.daniel-mitchell.com/blog/send-email-with-aws-ses-in-a-cloudflare-workers/
// https://www.ai.moda/en/blog/ses-emails-from-workers
// https://github.com/winstxnhdw/mail-worker

export class Ses extends Effect.Service<Ses>()('Ses', {
  accessors: true,
  effect: Effect.gen(function* () {
    const AWS_ACCESS_KEY_ID = yield* Config.redacted(Config.nonEmptyString('AWS_ACCESS_KEY_ID'))
    const AWS_SECRET_ACCESS_KEY = yield* Config.redacted(Config.nonEmptyString('AWS_SECRET_ACCESS_KEY'))
    const AWS_REGION = yield* Config.nonEmptyString('AWS_REGION')
    const aws = new AwsClient({
      accessKeyId: Redacted.value(AWS_ACCESS_KEY_ID),
      secretAccessKey: Redacted.value(AWS_SECRET_ACCESS_KEY),
      region: AWS_REGION,
      retries: 0
    })

    return {
      sendEmail: ({ to, from, html, text, subject }: { to: string; from: string; html: string; text: string; subject: string }) =>
        Effect.gen(function* () {
          yield* Effect.log({ message: `Ses: sendEmail: to: ${to}`, to, from, subject, text })

          // if (/@[a-z]\.com$/i.test(to)) {
          //   return yield* Effect.log(`Ses: sendEmail: skipping ${to}`)
          // }
          if (!['motio@mail.com', 'motio1@mail.com', 'motio2@mail.com'].includes(to)) {
            return yield* Effect.log(`Ses: sendEmail: skipping ${to}`)
          }

          const response = yield* Effect.tryPromise(() =>
            aws.fetch('https://email.us-east-1.amazonaws.com/v2/email/outbound-emails', {
              method: 'POST',
              headers: {
                'content-type': 'application/json'
              },
              body: JSON.stringify({
                FromEmailAddress: from,
                Destination: {
                  ToAddresses: [to]
                },
                Content: {
                  Simple: {
                    Subject: {
                      Data: subject
                    },
                    Body: {
                      Text: {
                        Data: text
                      }
                    }
                  }
                }
              })
            })
          )
          if (!response.ok) {
            return yield* Effect.tryPromise(() => response.text()).pipe(
              Effect.flatMap((text) => Effect.fail(new Error(`Error sending email: ${response.status} ${response.statusText} ${text}`)))
              // Effect.tapError((e) => Effect.logError(`Ses: sendEmail: error: ${e.message}`))
            )
          }
        })
    }
  })
}) {}
