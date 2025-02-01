import { issuer } from '@openauthjs/openauth'
import { CodeProvider } from '@openauthjs/openauth/provider/code'
import { PasswordProvider } from '@openauthjs/openauth/provider/password'
import { CloudflareStorage } from '@openauthjs/openauth/storage/cloudflare'
import { CodeUI } from '@openauthjs/openauth/ui/code'
import { PasswordUI } from '@openauthjs/openauth/ui/password'
import { subjects } from '@repo/shared/subjects'

export default {
	async fetch(request: Request, env: Env, ctx: ExecutionContext) {
		return issuer({
			ttl: {
				access: 60 * 30,
				refresh: 60 * 30
			},
			storage: CloudflareStorage({
				namespace: env.KV
			}),
			subjects,
			providers: {
				code: CodeProvider(
					CodeUI({
						copy: {
							code_placeholder: 'Code (check Worker logs)'
						},
						sendCode: async (claims, code) => console.log(claims.email, code)
					})
				)
			},
			success: async (ctx, value) => {
				const email = value.claims.email
				const stmt = env.D1.prepare(
					`
					insert into users (email) values (?)
					on conflict (email) do nothing
					returning *
				`
				).bind(email)
				const user = await stmt.first<{ userId: number; email: string }>()
				console.log({ user })
				if (!user) throw new Error('Unable to create user. Try again.')

				return ctx.subject('user', {
					// userId: user.userId,
					email
				})
			}
		}).fetch(request, env, ctx)
	}
} satisfies ExportedHandler<Env>
