export default {
	async fetch(request, env, ctx): Promise<Response> {
		return new Response('Hello, world!')
	}
} satisfies ExportedHandler<Env>
