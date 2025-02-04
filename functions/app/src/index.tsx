import type { FC, PropsWithChildren } from 'hono/jsx'
import { issuer } from '@openauthjs/openauth'
import { Client, createClient } from '@openauthjs/openauth/client'
import { CodeProvider } from '@openauthjs/openauth/provider/code'
import { CloudflareStorage } from '@openauthjs/openauth/storage/cloudflare'
import { createSubjects } from '@openauthjs/openauth/subject'
import { Layout as OpenAuthLayout } from '@openauthjs/openauth/ui/base'
import { CodeUI } from '@openauthjs/openauth/ui/code'
import { FormAlert } from '@openauthjs/openauth/ui/form'
import { createId } from '@paralleldrive/cuid2'
import { Hono } from 'hono'
import { deleteCookie, getSignedCookie, setSignedCookie } from 'hono/cookie'
import { jsxRenderer, useRequestContext } from 'hono/jsx-renderer'
import Stripe from 'stripe'
import { z } from 'zod'

const roleSchema = z.enum(['user', 'admin']) // Must align with roles table
export type Role = z.infer<typeof roleSchema>
export const asRole = (role: Role) => role

export type TeamMemberRole = 'owner' | 'member' // Must align with teamMemberRoles table
export const asTeamMemberRole = (role: TeamMemberRole) => role

type HonoEnv = {
	Bindings: Env
	Variables: {
		sessionData: SessionData
		dbService: ReturnType<typeof createDbService>
		stripe: Stripe
		client: Client
		redirectUri: string
	}
}

type SessionUser = {
	userId: number
	email: string
	role: Role
}

type SessionData = {
	sessionUser?: SessionUser
}

export const subjects = createSubjects({
	user: z.object({
		userId: z.number(),
		email: z.string(),
		role: roleSchema
	})
})

export function createDbService(db: Env['D1']) {
	return {
		getTeams: async () => await db.prepare('select * from teams').run(),
		createUser: async ({ email }: { email: string }) => {
			console.log({ log: 'createUser', email })
			const batchResults = await db.batch([
				db.prepare('insert into users (email) values (?) on conflict (email) do update set email = email returning *').bind(email),
				db
					.prepare(
						`
insert into teams (name) 
select 'Team' 
where not exists (
	select 1 
	from teamMembers 
	where email = ?
)
`
					)
					.bind(email),
				db
					.prepare(
						`
insert into teamMembers(userId, teamId, teamMemberRole)
select (select userId from users where email = ?), last_insert_rowid(), 'owner'
where not exists (
	select 1
	from teamMembers
	where email = ?)
`
					)
					.bind(email)
			])
			console.log({ batchResults })
		},
		getTeamForUser: async ({ userId }: { userId: number }) => {
			console.log({ log: 'getTeamForUser', userId })
			return await db
				.prepare('select * from teams where teamId = (select teamId from teamMembers where userId = ? and teamRole = "owner")')
				.bind(userId)
				.first()
		}
	}
}

export default {
	async fetch(request, env, ctx): Promise<Response> {
		const dbService = createDbService(env.D1)
		const openAuth = createOpenAuth({ env, dbService })
		const app = new Hono()
		app.route('/', openAuth) // Before frontend so we don't get its middleware
		app.route('/', createFrontend({ env, ctx, openAuth, dbService }))
		return app.fetch(request, env, ctx)
	}
} satisfies ExportedHandler<Env>

function createOpenAuth({ env, dbService }: { env: Env; dbService: ReturnType<typeof createDbService> }) {
	const { request, ...codeUi } = CodeUI({
		copy: {
			code_placeholder: 'Code (check Worker logs)'
		},
		sendCode: async (claims, code) => {
			console.log(claims.email, code)
			if (env.ENVIRONMENT === 'local') {
				await env.KV.put(`local:code`, code, {
					expirationTtl: 60
				})
			}
		}
	})
	return issuer({
		ttl: {
			access: 60 * 30,
			refresh: 60 * 30,
			reuse: 0 // https://github.com/openauthjs/openauth/issues/133#issuecomment-2614264698
		},
		storage: CloudflareStorage({
			namespace: env.KV
		}),
		subjects,
		providers: {
			code: CodeProvider({
				...codeUi,
				request: async (_req, state, _form, error): Promise<Response> => {
					if (state.type === 'code' && env.ENVIRONMENT === 'local') {
						const code = await env.KV.get('local:code')
						if (code) {
							const copy = {
								button_continue: 'Continue',
								code_invalid: 'Invalid code',
								code_sent: 'Code sent to ',
								code_resent: 'Code resent to ',
								code_didnt_get: "Didn't get code?",
								code_resend: 'Resend'
							}
							const jsx = (
								<OpenAuthLayout>
									<form data-component="form" class="form" method="post">
										{error?.type === 'invalid_code' && <FormAlert message={copy.code_invalid} />}
										{state.type === 'code' && (
											<FormAlert message={(state.resend ? copy.code_resent : copy.code_sent) + state.claims.email} color="success" />
										)}
										<input type="hidden" name="action" value="verify" />
										<input
											data-component="input"
											autofocus
											minLength={6}
											maxLength={6}
											type="text"
											name="code"
											required
											inputmode="numeric"
											autocomplete="one-time-code"
											value={code}
										/>
										<button data-component="button">{copy.button_continue}</button>
									</form>
									<form method="post">
										{Object.entries(state.claims).map(([key, value]) => (
											<input key={key} type="hidden" name={key} value={value} className="hidden" />
										))}
										<input type="hidden" name="action" value="request" />
										<div data-component="form-footer">
											<span>
												{copy.code_didnt_get} <button data-component="link">{copy.code_resend}</button>
											</span>
										</div>
									</form>
								</OpenAuthLayout>
							)
							return new Response(jsx.toString(), {
								headers: {
									'Content-Type': 'text/html'
								}
							})
						}
					}
					return request(_req, state, _form, error)
				}
			})
		},
		success: async (ctx, value) => {
			const email = value.claims.email
			const stmt = env.D1.prepare(
				`
				insert into users (email) values (?)
				on conflict (email) do update set email = email
				returning *
			`
			).bind(email)
			const user = await stmt.first<{ userId: number; email: string; role: Role }>()
			console.log({ user, email, userId: user?.userId, userIdType: typeof user?.userId })
			if (!user) throw new Error('Unable to create user. Try again.')

			return ctx.subject('user', {
				userId: user.userId,
				email,
				role: user.role
			})
		}
	})
}

function createFrontend({
	env,
	ctx,
	openAuth,
	dbService
}: {
	env: Env
	ctx: ExecutionContext
	openAuth: ReturnType<typeof createOpenAuth>
	dbService: ReturnType<typeof createDbService>
}) {
	const app = new Hono<HonoEnv>()
	app.use(async (c, next) => {
		const cookieSessionId = await getSignedCookie(c, c.env.COOKIE_SECRET, 'sessionId')
		const sessionId = cookieSessionId || `session:${createId()}`
		await setSignedCookie(c, 'sessionId', sessionId, c.env.COOKIE_SECRET, {
			secure: true,
			httpOnly: true,
			maxAge: 60 * 5,
			sameSite: 'Strict'
		})
		const kvSessionData = await env.KV.get<SessionData>(sessionId, { type: 'json' })
		const sessionData = kvSessionData || {}
		c.set('sessionData', sessionData)
		console.log({ sessionData })

		c.set('dbService', dbService)
		c.set('stripe', new Stripe(c.env.STRIPE_SECRET_KEY))

		const { origin } = new URL(c.req.url)
		const client = createClient({
			clientID: 'client',
			// issuer: c.env.OPENAUTH_ISSUER,
			// fetch: (input, init) => c.env.WORKER.fetch(input, init)
			issuer: origin,
			fetch: async (input, init) => openAuth.fetch(new Request(input, init), env, ctx)
		})
		c.set('client', client)
		c.set('redirectUri', `${origin}/callback`)
		await next()
		if (c.var.sessionData !== sessionData) {
			console.log({ changedSessionData: c.var.sessionData })
			await env.KV.put(sessionId, JSON.stringify(c.var.sessionData), { expirationTtl: 60 * 5 })
		}
	})
	app.use('/dashboard/*', async (c, next) => {
		if (!c.var.sessionData.sessionUser) {
			return c.redirect('/authenticate')
		} else if (c.var.sessionData.sessionUser.role !== 'user') {
			return c.text('Forbidden', 403)
		}
		await next()
	})
	app.use('/admin/*', async (c, next) => {
		if (!c.var.sessionData.sessionUser) {
			return c.redirect('/authenticate')
		} else if (c.var.sessionData.sessionUser.role !== 'admin') {
			return c.text('Forbidden', 403)
		}
		await next()
	})
	app.use(
		'/*',
		jsxRenderer(({ children }) => <Layout>{children}</Layout>)
	)

	app.get('/', (c) => c.render(<Home />))
	app.get('/authenticate', async (c) => {
		// /authorize is taken by openauth
		if (c.var.sessionData.sessionUser) {
			return c.redirect('/')
		}
		const { url } = await c.var.client.authorize(c.var.redirectUri, 'code')
		return c.redirect(url)
	})
	app.post('/signout', async (c) => {
		const sessionId = await getSignedCookie(c, c.env.COOKIE_SECRET, 'sessionId')
		if (sessionId) await env.KV.delete(sessionId)
		deleteCookie(c, 'sessionId')
		return c.redirect('/')
	})
	app.get('/callback', async (c) => {
		try {
			// http://localhost:8787/callback?error=server_error&error_description=D1_ERROR%3A+NOT+NULL+constraint+failed%3A+users.passwordHash%3A+SQLITE_CONSTRAINT
			if (c.req.query('error')) throw new Error(c.req.query('error_description') || c.req.query('error'))
			const code = c.req.query('code')
			if (!code) throw new Error('Missing code')
			const exchanged = await c.var.client.exchange(code, c.var.redirectUri)
			if (exchanged.err) throw exchanged.err
			const verified = await c.var.client.verify(subjects, exchanged.tokens.access, {
				refresh: exchanged.tokens.refresh,
				// fetch: (input, init) => c.env.WORKER.fetch(input, init)
				fetch: async (input, init) => openAuth.fetch(new Request(input, init), env, ctx)
			})
			if (verified.err) throw verified.err
			c.set('sessionData', {
				...c.var.sessionData,
				sessionUser: {
					userId: verified.subject.properties.userId,
					email: verified.subject.properties.email,
					role: verified.subject.properties.role
				}
			})
			return c.redirect(verified.subject.properties.role === 'admin' ? '/admin' : '/dashboard')
		} catch (e: any) {
			return new Response(e.toString())
		}
	})
	app.get('/pricing', (c) => c.render(<Pricing />))
	app.post('/pricing', async (c) => {
		const formData = await c.req.formData()
		const priceId = formData.get('priceId')
		if (typeof priceId === 'string' && priceId) {
		}
		return c.redirect('/pricing')
	})
	// app.post('/public', async (c) => {
	// 	const formData = await c.req.formData()
	// 	const value = formData.get('value')
	// 	if (typeof value === 'string' && value) {
	// 		// c.set('sessionData', { ...c.var.sessionData, foo: value })
	// 	}
	// 	return c.redirect('/public')
	// })
	app.get('/dashboard', (c) => c.render(<Dashboard />))
	app.get('/admin', (c) => c.render(<Admin />))
	return app
}

const Layout: FC<PropsWithChildren<{}>> = ({ children }) => {
	const ctx = useRequestContext<HonoEnv>()
	const ListItems = () => (
		<>
			<li>
				<a href="/dashboard">Dashboard</a>
			</li>
			<li>
				<a href="/admin">Admin</a>
			</li>
		</>
	)
	return (
		<html>
			<head>
				<meta charset="UTF-8" />
				<meta name="viewport" content="width=device-width, initial-scale=1.0" />
				<link href="/tailwind.css" rel="stylesheet" />
				<title>COS App</title>
			</head>
			<body>
				<div className="navbar bg-base-100 shadow-sm">
					<div className="navbar-start">
						<div className="dropdown">
							<div tabIndex={0} role="button" className="btn btn-ghost lg:hidden">
								<svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
									<path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6h16M4 12h8m-8 6h16" />
								</svg>
							</div>
							<ul tabIndex={0} class="menu menu-sm dropdown-content bg-base-100 rounded-box z-1 mt-3 w-52 p-2 shadow">
								<ListItems />
							</ul>
						</div>
						<a href="/" className="btn btn-ghost text-xl">
							Cloudflare-OpenAUTH-Stripe
						</a>
					</div>
					<div className="navbar-center hidden lg:flex">
						<ul className="menu menu-horizontal px-1">
							<ListItems />
						</ul>
					</div>
					<div className="navbar-end gap-2">
						<a href="/pricing" className="btn">
							Pricing
						</a>
						{ctx.var.sessionData.sessionUser ? (
							<form action="/signout" method="post">
								<button type="submit" className="btn">
									Sign Out
								</button>
							</form>
						) : (
							<a href="/authenticate" className="btn">
								Sign In / Up
							</a>
						)}
					</div>
				</div>
				<div className="p-6">{children}</div>
			</body>
		</html>
	)
}

const Home: FC = () => {
	const c = useRequestContext<HonoEnv>()
	return (
		<div className="flex flex-col gap-2">
			<div>
				<pre>{JSON.stringify({ sessionData: c.var.sessionData }, null, 2)}</pre>
			</div>
		</div>
	)
}

const Pricing: FC = async () => {
	const c = useRequestContext<HonoEnv>()
	const stripe = c.var.stripe
	const priceList = await stripe.prices.list({ lookup_keys: ['base', 'plus'], expand: ['data.product'] })
	const prices = priceList.data.sort((a, b) => (a.lookup_key && b.lookup_key ? a.lookup_key.localeCompare(b.lookup_key) : 0))
	return (
		<>
			<div className="mx-auto grid max-w-xl gap-8 md:grid-cols-2">
				{prices.map((price) => {
					if (!price.unit_amount) return null
					return (
						<div key={price.id} className="card bg-base-100 shadow-sm">
							<div className="card-body">
								<h2 className="card-title capitalize">{price.lookup_key}</h2>
								<p className="text-2xl font-bold">${price.unit_amount / 100}</p>
								<form action="/pricing" method="post" className="card-actions justify-end">
									<input type="hidden" name="priceId" value={price.id} />
									<button className="btn btn-soft">Get Started</button>
								</form>
							</div>
						</div>
					)
				})}
			</div>
			<pre>{JSON.stringify({ prices }, null, 2)}</pre>
		</>
	)
}

// const Public: FC = async () => {
// 	const c = useRequestContext<HonoEnv>()
// 	const stripe = c.var.stripe
// 	const products = await stripe.products.list({ expand: ['data.price'] })
// 	const prices = await stripe.prices.list({ lookup_keys: ['basic', 'pro'], expand: ['data.product'] })
// 	return (
// 		<div>
// 			Public
// 			<div className="card bg-base-100 w-96 shadow-sm">
// 				<form action="/public" method="post">
// 					<div className="card-body">
// 						<h2 className="card-title">Foo</h2>
// 						<fieldset className="fieldset">
// 							<legend className="fieldset-legend">Value</legend>
// 							<input type="text" name="value" className="input" />
// 						</fieldset>
// 						<div className="card-actions justify-end">
// 							<button type="submit" className="btn btn-primary">
// 								Set
// 							</button>
// 						</div>
// 					</div>
// 				</form>
// 			</div>
// 			<pre>{JSON.stringify({ sessionData: c.var.sessionData, prices, products }, null, 2)}</pre>
// 		</div>
// 	)
// }

const Dashboard: FC = async () => {
	const c = useRequestContext<HonoEnv>()
	if (!c.var.sessionData.sessionUser) throw new Error('Missing sessionUser')
	const team = await c.var.dbService.getTeamForUser(c.var.sessionData.sessionUser)

	return (
		<div>
			<h1 className="mb-6 text-lg font-medium lg:text-2xl">Dashboard</h1>
			<pre>{JSON.stringify({ team, sessionData: c.var.sessionData }, null, 2)}</pre>
		</div>
	)
}
const Admin: FC = async () => {
	const c = useRequestContext<HonoEnv>()
	const { results: teams } = await c.var.dbService.getTeams()
	return (
		<div>
			<h1 className="mb-6 text-lg font-medium lg:text-2xl">Admin</h1>
			<pre>{JSON.stringify({ teams, sessionData: c.var.sessionData }, null, 2)}</pre>
		</div>
	)
}
