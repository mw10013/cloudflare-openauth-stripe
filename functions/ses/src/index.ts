import * as Ses2 from '@aws-sdk/client-sesv2';

// https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/sesv2/command/SendEmailCommand/
// https://www.npmjs.com/package/@aws-sdk/client-sesv2

export default {
	async fetch(request, env, ctx): Promise<Response> {
		const client = new Ses2.SESv2Client({
			credentials: {
				accessKeyId: env.AWS_ACCESS_KEY_ID!,
				secretAccessKey: env.AWS_SECRET_ACCESS_KEY!
			},
			region: env.AWS_REGION,
			maxAttempts: 2
		})
		const sendEmailCommandInput: Ses2.SendEmailCommandInput = {
			FromEmailAddress: 'motio@mail.com',
			Destination: {
				ToAddresses: ['motio1@mail.com']
			},
			Content: {
				Simple: {
					Subject: {
						Charset: 'UTF-8',
						Data: 'This is subject SESv2Client'
					},
					Body: {
						// Html: {
						//   Charset: 'UTF-8',
						//   Data: html
						// },
						Text: {
							Charset: 'UTF-8',
							Data: 'This is email2.'
						}
					}
				}
			}
		}
		const command = new Ses2.SendEmailCommand(sendEmailCommandInput)
		const sendEmailCommandOutput = await client.send(command)
		console.log('sendEmailCommandOutput', sendEmailCommandOutput)
		return new Response('Hello, world!')
	}
} satisfies ExportedHandler<Env>
