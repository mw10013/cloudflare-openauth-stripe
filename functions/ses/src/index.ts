import { readFile } from 'fs'
import { SendEmailCommand, SendEmailCommandInput, SESClient } from '@aws-sdk/client-ses'

export default {
	async fetch(request, env, ctx): Promise<Response> {
		const client = new SESClient({
			region: env.AWS_REGION,
			// https://docs.aws.amazon.com/general/latest/gr/ses.html
			// endpoint: `https://email.${AWS_REGION}.amazonaws.com`,
			// endpoint: `https://email-fips.${AWS_REGION}.amazonaws.com`,
			maxAttempts: 2,
			credentials: {
				accessKeyId: env.AWS_ACCESS_KEY_ID!,
				secretAccessKey: env.AWS_SECRET_ACCESS_KEY!
			}
		})
		const sendEmailCommandInput: SendEmailCommandInput = {
			Destination: {
				ToAddresses: ['motio1@mail.com']
			},
			Message: {
				Body: {
					Text: {
						Charset: 'UTF-8',
						Data: 'This is text'
					}
				},
				Subject: {
					Charset: 'UTF-8',
					Data: 'This is subject'
				}
			},
			Source: 'motio@mail.com'
		}
		const command = new SendEmailCommand(sendEmailCommandInput)
		const sendEmailCommandOutput = await client.send(command)
		console.log('sendEmailCommandOutput', sendEmailCommandOutput)
		// @ts-ignore
		// readFile()

		return new Response('Hello, world!')
	}
} satisfies ExportedHandler<Env>
