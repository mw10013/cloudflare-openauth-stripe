import { AwsClient } from 'aws4fetch'

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
		Destination: {
			ToAddresses: ['motio1@mail.com']
		},
		FromEmailAddress: 'motio@mail.com',
		Content: {
			Simple: {
				Subject: {
					Data: 'This is aws4fetch'
				},
				Body: {
					Text: {
						Data: 'This is aws4fetch email.'.replace(/<br\s*[\/]?>/gi, '\n')
					}
					// Html: {
					// 	Data:
					// 		'<body><div align="center" style="font-family:Calibri, Arial, Helvetica, sans-serif;"><table width="600" cellpadding="0" cellspacing="0" border="0" style="font-family:Calibri, Arial, Helvetica, sans-serif"><tr style="background-color:white;"><td><table width="600" cellpadding="0"><tr><td><h1>Fifty Pence Direct Debit</h1><p>' +
					// 		message +
					// 		'</p></td></tr></table></td></tr></table></div></body>'
					// }
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
