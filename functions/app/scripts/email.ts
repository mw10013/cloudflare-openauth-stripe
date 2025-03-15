// import { SendEmailCommand, SendEmailCommandInput, SESClient } from '@aws-sdk/client-ses'
import * as Ses from '@aws-sdk/client-ses'

// const client = new SESClient({
//   credentials: {
//     accessKeyId: Redacted.value(AWS_ACCESS_KEY_ID),
//     secretAccessKey: Redacted.value(AWS_SECRET_ACCESS_KEY)
//   },
//   region: AWS_REGION,
//   maxAttempts: 2
// })
console.log(process.env.AWS_ACCESS_KEY_ID)

const client = new Ses.SESClient({
	credentials: {
		// accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
		// secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!
		accessKeyId: process.env.CARAMBA_AWS_ACCESS_KEY_ID!,
		secretAccessKey: process.env.CARAMBA_AWS_SECRET_ACCESS_KEY!
	},
	region: 'us-east-1',
	maxAttempts: 2
})

const sendEmailCommandInput: Ses.SendEmailCommandInput = {
	Destination: {
		ToAddresses: ['motio@mail.com']
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
	Source: 'admin@carambaapp.com'
	// Source: 'hello@motio.so'
}
const command = new Ses.SendEmailCommand(sendEmailCommandInput)
console.log({ command })
const sendEmailCommandOutput = await client.send(command)
console.log({ sendEmailCommandOutput })
