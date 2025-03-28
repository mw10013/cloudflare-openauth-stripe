import { readFile } from 'fs'

export default {
	async fetch(request, env, ctx): Promise<Response> {
		readFile()
		return new Response('Hello, world!')
	}
} satisfies ExportedHandler<Env>
