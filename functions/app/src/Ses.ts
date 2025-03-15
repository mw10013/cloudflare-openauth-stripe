import { SendEmailCommand, SendEmailCommandInput, SESClient } from '@aws-sdk/client-ses'
import { Config, Console, Effect, Redacted } from 'effect'

export class Ses extends Effect.Service<Ses>()('Ses', {
	accessors: true,
	effect: Effect.gen(function* () {
		const AWS_ACCESS_KEY_ID = yield* Config.redacted('AWS_ACCESS_KEY_ID')
		const AWS_SECRET_ACCESS_KEY = yield* Config.redacted('AWS_SECRET_ACCESS_KEY')
		const AWS_REGION = yield* Config.nonEmptyString('AWS_REGION')
		yield* Effect.log({
			AWS_ACCESS_KEY_ID: Redacted.value(AWS_ACCESS_KEY_ID),
			AWS_SECRET_ACCESS_KEY: Redacted.value(AWS_SECRET_ACCESS_KEY),
			AWS_REGION
		})
		const client = new SESClient({
			credentials: {
				accessKeyId: Redacted.value(AWS_ACCESS_KEY_ID),
				secretAccessKey: Redacted.value(AWS_SECRET_ACCESS_KEY)
			},
			region: AWS_REGION
		})

		return {
			sendEmail: ({ to, from, html, text, subject }: { to: string; from: string; html: string; text: string; subject: string }) =>
				Effect.gen(function* () {
					yield* Effect.log('Ses.sendEmail', { to, from, subject, text })
					// https://github.com/dev-xo/remix-saas/blob/main/app/modules/email/email.server.ts
					// https://stackoverflow.com/questions/76417825/getting-invalid-email-address-error-using-aws-js-sdk-v3-ses
					const sendEmailCommandInput: SendEmailCommandInput = {
						Destination: {
							ToAddresses: [to]
						},
						Message: {
							Body: {
								Html: {
									Charset: 'UTF-8',
									Data: html
								},
								Text: {
									Charset: 'UTF-8',
									Data: text
								}
							},
							Subject: {
								Charset: 'UTF-8',
								Data: subject
							}
						},
						Source: from
					}
					const command = new SendEmailCommand(sendEmailCommandInput)
					// const sendEmailCommandOutput = yield* Effect.tryPromise(() => client.send(command))
					// yield* Effect.log(`ses: sendEmail: sendEmailCommandOutput`, {
					// 	sendEmailCommandOutput
					// })
					// return sendEmailCommandOutput
				})
		}
	})
}) {}
