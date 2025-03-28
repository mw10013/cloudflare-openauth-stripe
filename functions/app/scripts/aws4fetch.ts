import { AwsClient } from 'aws4fetch'

// https://www.npmjs.com/package/@aws-sdk/client-sesv2
// https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/sesv2/
// https://docs.aws.amazon.com/ses/latest/APIReference-V2/Welcome.html
// https://aws.amazon.com/blogs/messaging-and-targeting/upgrade-your-email-tech-stack-with-amazon-sesv2-api/
// https://docs.aws.amazon.com/ses/latest/dg/Welcome.html
// https://docs.aws.amazon.com/ses/latest/APIReference/Welcome.html
// https://docs.aws.amazon.com/general/latest/gr/ses.html

const aws = new AwsClient({
	accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
	secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
	region: 'us-east-1',
	retries: 1
})

let resp = await aws.fetch('https://email.us-east-1.amazonaws.com/v2/email/outbound-emails', {
	method: 'POST',
	headers: {
		'content-type': 'application/json'
	},
	body: JSON.stringify({
		FromEmailAddress: 'motio@mail.com',
		Destination: {
			ToAddresses: ['motio1@mail.com']
		},
		Content: {
			Simple: {
				Subject: {
					Data: 'This is aws4fetch with ses v2'
				},
				Body: {
					Text: {
						Data: 'This is aws4fetch email.'.replace(/<br\s*[\/]?>/gi, '\n')
					}
				}
			}
		}
	})
})

const respText = await resp.json()
console.log(resp.status + ' ' + resp.statusText)
console.log(respText)
if (resp.status != 200 && resp.status != 201) {
	throw new Error('Error sending email: ' + resp.status + ' ' + resp.statusText + ' ' + respText)
}
