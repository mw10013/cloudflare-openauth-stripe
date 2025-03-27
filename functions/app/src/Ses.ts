import { SendEmailCommand, SendEmailCommandInput, SESClient } from '@aws-sdk/client-ses'
import { Config, Effect, Redacted } from 'effect'

// https://www.daniel-mitchell.com/blog/send-email-with-aws-ses-in-a-cloudflare-workers/
// https://www.ai.moda/en/blog/ses-emails-from-workers
// https://github.com/winstxnhdw/mail-worker
// https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/ses/
// https://docs.aws.amazon.com/sdk-for-javascript/v3/developer-guide/ses-examples-sending-email.html
// https://github.com/aws/aws-sdk-js-v3/issues/4765
// langapp: "@aws-sdk/client-ses": "^3.699.0",
// langapp locked: version: 3.721.0

export class Ses extends Effect.Service<Ses>()('Ses', {
	accessors: true,
	effect: Effect.gen(function* () {
		const AWS_ACCESS_KEY_ID = yield* Config.redacted(Config.nonEmptyString('AWS_ACCESS_KEY_ID'))
		const AWS_SECRET_ACCESS_KEY = yield* Config.redacted(Config.nonEmptyString('AWS_SECRET_ACCESS_KEY'))
		const AWS_REGION = yield* Config.nonEmptyString('AWS_REGION')
		// yield* Effect.log({
		// 	AWS_ACCESS_KEY_ID: Redacted.value(AWS_ACCESS_KEY_ID),
		// 	AWS_SECRET_ACCESS_KEY: Redacted.value(AWS_SECRET_ACCESS_KEY),
		// 	AWS_REGION
		// })
		const client = new SESClient({
			credentials: {
				accessKeyId: Redacted.value(AWS_ACCESS_KEY_ID),
				secretAccessKey: Redacted.value(AWS_SECRET_ACCESS_KEY)
			},
			region: AWS_REGION,
			maxAttempts: 2
		})

		// const credentials: AwsCredentialIdentity = {
		// const credentials = {
		// 	accessKeyId: Redacted.value(AWS_ACCESS_KEY_ID),
		// 	secretAccessKey: Redacted.value(AWS_SECRET_ACCESS_KEY)
		// }

		// const client = new SESClient({
		// 	credentials,
		// 	region: AWS_REGION,
		// 	credentialDefaultProvider: () =>async () => credentials
		// })

		return {
			sendEmail: ({ to, from, html, text, subject }: { to: string; from: string; html: string; text: string; subject: string }) =>
				Effect.gen(function* () {
					yield* Effect.log('Ses.sendEmail', { to, from, subject, text, client })
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
					yield* Effect.log(`Ses.sendEmail: command`, { command })
					const sendEmailCommandOutput = yield* Effect.tryPromise(() => client.send(command))
					yield* Effect.log(`Ses.sendEmail: sendEmailCommandOutput`, {
						sendEmailCommandOutput
					})
					return sendEmailCommandOutput
				})
		}
	})
}) {}
