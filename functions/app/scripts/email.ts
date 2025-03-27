import * as Ses from '@aws-sdk/client-ses'

const client = new Ses.SESClient({
	credentials: {
		accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
		secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!
	},
	region: 'us-east-1',
	maxAttempts: 2
})

const sendEmailCommandInput: Ses.SendEmailCommandInput = {
	Destination: {
		ToAddresses: ['motio1@mail.com']
	},
	Message: {
		Body: {
			// Html: {
			//   Charset: 'UTF-8',
			//   Data: html
			// },
			Text: {
				Charset: 'UTF-8',
				Data: 'This is email.'
			}
		},
		Subject: {
			Charset: 'UTF-8',
			Data: 'This is subject'
		}
	},
	Source: 'motio@mail.com'
}
const command = new Ses.SendEmailCommand(sendEmailCommandInput)
console.log({ command })
const sendEmailCommandOutput = await client.send(command)
console.log({ sendEmailCommandOutput })
