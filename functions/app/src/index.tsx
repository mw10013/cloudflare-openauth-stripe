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
import { Context, Effect, Layer, ManagedRuntime, Schema } from 'effect'
import { UnknownException } from 'effect/Cause'
import { Hono, Context as HonoContext } from 'hono'
import { deleteCookie, getSignedCookie, setSignedCookie } from 'hono/cookie'
import { jsxRenderer, useRequestContext } from 'hono/jsx-renderer'
import Stripe from 'stripe'
import { z } from 'zod'
import * as D from './D1'

export const Role = Schema.Literal('user', 'admin') // Must align with roles table
export type Role = Schema.Schema.Type<typeof Role>

export const TeamMemberRole = Schema.Literal('owner', 'member') // Must align with teamMemberRoles table
export type TeamMemberRole = Schema.Schema.Type<typeof TeamMemberRole>

export const User = Schema.Struct({
	userId: Schema.Number,
	name: Schema.NullOr(Schema.String),
	email: Schema.String,
	role: Role
})
export type User = Schema.Schema.Type<typeof User>

export const Team = Schema.Struct({
	teamId: Schema.Number,
	name: Schema.String,
	stripeCustomerId: Schema.NullOr(Schema.String),
	stripeSubscriptionId: Schema.NullOr(Schema.String),
	stripeProductId: Schema.NullOr(Schema.String),
	planName: Schema.NullOr(Schema.String),
	subscriptionStatus: Schema.NullOr(Schema.String)
})
export type Team = Schema.Schema.Type<typeof Team>

export const TeamMember = Schema.Struct({
	teamMemberId: Schema.Number,
	teamId: Schema.Number,
	userId: Schema.Number,
	teamMemberRole: TeamMemberRole
})
export type TeamMember = Schema.Schema.Type<typeof TeamMember>

export const TeamMemberWithUser = Schema.Struct({
	...TeamMember.fields,
	user: User
})
export type TeamMemberWithUser = Schema.Schema.Type<typeof TeamMemberWithUser>

export const TeamWithTeamMembers = Schema.Struct({
	...Team.fields,
	teamMembers: Schema.Array(TeamMemberWithUser)
})
export type TeamWithTeamMembers = Schema.Schema.Type<typeof TeamWithTeamMembers>

type HonoEnv = {
	Bindings: Env
	Variables: {
		runtime: ReturnType<typeof createRuntime>
		sessionData: SessionData
		dbService: ReturnType<typeof createDbService>
		stripe: Stripe
		client: Client
		redirectUri: string
	}
}

export const SessionUser = Schema.Struct({
	userId: Schema.Number,
	email: Schema.String,
	role: Role
})
export type SessionUser = Schema.Schema.Type<typeof SessionUser>

export const SessionData = Schema.Struct({
	sessionUser: Schema.optional(SessionUser)
})
export type SessionData = Schema.Schema.Type<typeof SessionData>

export const subjects = createSubjects({
	user: z.object({
		userId: z.number(),
		email: z.string(),
		role: z.enum(['user', 'admin'])
	})
})

export const TeamsResult = Schema.NullishOr(Schema.parseJson(Schema.Array(TeamWithTeamMembers)))
export type TeamsResult = Schema.Schema.Type<typeof TeamsResult>

export function createDbService(db: Env['D1']) {
	return {
		getTeams: async () =>
			await db
				.prepare(
					`
select json_group_array(
	json_object(
		'teamId', teamId, 'name', name, 'stripeCustomerId', stripeCustomerId, 'stripeSubscriptionId', stripeSubscriptionId, 'stripeProductId', stripeProductId, 'planName', planName, 'subscriptionStatus', subscriptionStatus,
		'teamMembers',
		(
			select
				json_group_array(
					json_object(
						'teamMemberId', tm.teamMemberId, 'userId', tm.userId, 'teamId', tm.teamId, 'teamMemberRole', tm.teamMemberRole,
						'user', (select json_object('userId', u.userId, 'name', u.name, 'email', u.email, 'role', u.role) from users u where u.userId = tm.userId))
					)
			from teamMembers tm where tm.teamId = t.teamId
		)
	)
) as data from teams t
`
				)
				.first<{ data: string }>()
				.then((v) => Schema.decodeSync(TeamsResult)(v?.data)),
		upsertUser: async ({ email }: { email: string }) => {
			const [
				{
					results: [user]
				}
			] = await db.batch([
				db.prepare('insert into users (email) values (?) on conflict (email) do update set email = email returning *').bind(email),
				db
					.prepare(
						`
insert into teams (name) 
select 'Team' 
where exists (select 1 from users u where u.email = ?1 and role = "user") and
not exists (select 1 from teamMembers tm where tm.userId = (select u.userId from users u where u.email = ?1 and role = "user")
)
`
					)
					.bind(email),
				db
					.prepare(
						`
insert into teamMembers (userId, teamId, teamMemberRole)
select (select userId from users where email = ?1), last_insert_rowid(), 'owner'
where exists (select 1 from users u where u.email = ?1 and role = "user") and
not exists (select 1 from teamMembers tm where tm.userId = (select u.userId from users u where u.email = ?1)
)
`
					)
					.bind(email)
			])
			return Schema.decodeUnknownSync(User)(user)
		},
		getTeamForUser: async ({ userId }: { userId: number }) => {
			const team = await db
				.prepare('select * from teams where teamId = (select teamId from teamMembers where userId = ? and teamMemberRole = "owner")')
				.bind(userId)
				.first()
			if (!team) throw new Error('Missing team.')
			return Schema.decodeUnknownSync(Team)(team)
		},
		updateStripeCustomerId: async ({
			teamId,
			stripeCustomerId
		}: Pick<
			{
				[K in keyof Team]: NonNullable<Team[K]>
			},
			'teamId' | 'stripeCustomerId'
		>) => {
			await db.prepare('update teams set stripeCustomerId = ? where teamId = ?').bind(stripeCustomerId, teamId).run()
		},
		updateStripeSubscription: async ({
			stripeCustomerId,
			stripeSubscriptionId,
			stripeProductId,
			planName,
			subscriptionStatus
		}: Pick<
			{
				[K in keyof Team]: NonNullable<Team[K]>
			},
			'stripeCustomerId' | 'stripeSubscriptionId' | 'stripeProductId' | 'planName' | 'subscriptionStatus'
		>) => {
			await db
				.prepare(
					'update teams set stripeSubscriptionId = ?, stripeProductId = ?, planName = ?, subscriptionStatus = ? where stripeCustomerId = ?'
				)
				.bind(stripeSubscriptionId, stripeProductId, planName, subscriptionStatus, stripeCustomerId)
				.run()
		}
	}
}

export default {
	async fetch(request, env, ctx): Promise<Response> {
		const runtime = createRuntime({ env })
		const dbService = createDbService(env.D1)
		const stripe = new Stripe(env.STRIPE_SECRET_KEY)
		const openAuth = createOpenAuth({ env, dbService })
		const app = new Hono()
		app.route('/', openAuth)
		app.route('/', createApi({ env, dbService, stripe }))
		app.route('/', createFrontend({ env, ctx, openAuth, dbService, stripe, runtime })) // Last to isolate middleware
		const response = await app.fetch(request, env, ctx)
		ctx.waitUntil(runtime.dispose())
		return response
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
			const user = await dbService.upsertUser({ email })
			return ctx.subject('user', {
				userId: user.userId,
				email,
				role: user.role
			})
		}
	})
}

function createApi({ env, dbService, stripe }: { env: Env; dbService: ReturnType<typeof createDbService>; stripe: Stripe }) {
	const app = new Hono<HonoEnv>()
	app.get('/api/stripe/checkout', async (c) => {
		const sessionId = c.req.query('sessionId')
		if (!sessionId) return c.redirect('/pricing')

		const session = await stripe.checkout.sessions.retrieve(sessionId, {
			expand: ['customer']
		})
		const customer = session.customer
		if (!customer || typeof customer === 'string') {
			throw new Error('Invalid customer data from Stripe.')
		}
		await syncStripeData({
			customerId: customer.id,
			stripe,
			dbService
		})
		return c.redirect('/dashboard')
	})
	app.post('/api/stripe/webhook', async (c) => {
		const signature = c.req.header('stripe-signature')
		// console.log({ log: 'stripe webhook', signature, STRIPE_WEBHOOK_SECRET: env.STRIPE_WEBHOOK_SECRET })
		if (!signature) return c.text('', 400)
		try {
			const body = await c.req.text()
			const event = await stripe.webhooks.constructEventAsync(body, signature, env.STRIPE_WEBHOOK_SECRET)
			const allowedEvents: Stripe.Event.Type[] = [
				'checkout.session.completed',
				'customer.subscription.created',
				'customer.subscription.updated',
				'customer.subscription.deleted',
				'customer.subscription.paused',
				'customer.subscription.resumed',
				'customer.subscription.pending_update_applied',
				'customer.subscription.pending_update_expired',
				'customer.subscription.trial_will_end',
				'invoice.paid',
				'invoice.payment_failed',
				'invoice.payment_action_required',
				'invoice.upcoming',
				'invoice.marked_uncollectible',
				'invoice.payment_succeeded',
				'payment_intent.succeeded',
				'payment_intent.payment_failed',
				'payment_intent.canceled'
			]
			console.log({ log: 'stripe webhook', eventType: event.type, allow: allowedEvents.includes(event.type) })
			if (!allowedEvents.includes(event.type)) return c.text('', 200)

			// All the events I track have a customerId
			const { customer: customerId } = event?.data?.object as {
				customer: string // Sadly TypeScript does not know this
			}

			// This helps make it typesafe and also lets me know if my assumption is wrong
			if (typeof customerId !== 'string') {
				throw new Error(`[STRIPE HOOK][CANCER] ID isn't string.\nEvent type: ${event.type}`)
			}

			await syncStripeData({
				customerId,
				stripe,
				dbService
			})
			return c.text('', 200)
		} catch (err) {
			const errorMessage = `Stripe webhook failed: ${err instanceof Error ? err.message : 'Internal server error'}`
			console.log(errorMessage)
			return c.text(errorMessage, 400)
		}
	})
	return app
}

function createFrontend({
	env,
	ctx,
	runtime,
	openAuth,
	dbService,
	stripe
}: {
	env: Env
	ctx: ExecutionContext
	runtime: ReturnType<typeof createRuntime>
	openAuth: ReturnType<typeof createOpenAuth>
	dbService: ReturnType<typeof createDbService>
	stripe: Stripe
}) {
	const app = new Hono<HonoEnv>()
	app.use(async (c, next) => {
		const cookieSessionId = await getSignedCookie(c, c.env.COOKIE_SECRET, 'sessionId')
		const sessionId = cookieSessionId || `session:${createId()}`
		await setSignedCookie(c, 'sessionId', sessionId, c.env.COOKIE_SECRET, {
			secure: true,
			httpOnly: true,
			maxAge: 60 * 60,
			sameSite: 'Lax'
		})
		const kvSessionData = (await env.KV.get(sessionId, { type: 'json' })) || {}
		const sessionData = Schema.decodeUnknownSync(SessionData)(kvSessionData)
		c.set('sessionData', sessionData)
		console.log({ sessionData })

		c.set('runtime', runtime)
		c.set('dbService', dbService)
		c.set('stripe', stripe)

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
			await env.KV.put(sessionId, JSON.stringify(c.var.sessionData), { expirationTtl: 60 * 60 })
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
	app.post('/pricing', pricingPost)
	app.get('/dashboard', (c) => c.render(<Dashboard />))
	app.post('/dashboard', dashboardPost)
	app.get('/admin', (c) => c.render(<Admin />))
	app.post('/admin', adminPost)
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

const pricingPost = async (c: HonoContext<HonoEnv>) => {
	const sessionUser = c.var.sessionData.sessionUser
	if (!sessionUser) return c.redirect('/authenticate')
	if (sessionUser.role !== 'user') throw new Error('Only users can subscribe')
	// https://github.com/t3dotgg/stripe-recommendations?tab=readme-ov-file#checkout-flow
	const ensureStripeCustomerId = async (team: Team) => {
		if (team.stripeCustomerId) return [team.stripeCustomerId, team.stripeSubscriptionId] as const
		const customer = await c.var.stripe.customers.create({
			email: sessionUser.email,
			metadata: {
				userId: sessionUser.userId // DO NOT FORGET THIS
			}
		})
		await c.var.dbService.updateStripeCustomerId({
			teamId: team.teamId,
			stripeCustomerId: customer.id
		})
		return [customer.id, null] as const
	}
	const formData = await c.req.formData()
	const priceId = formData.get('priceId')
	if (!(typeof priceId === 'string' && priceId)) throw new Error('Missing priceId.')
	const team = await c.var.dbService.getTeamForUser(sessionUser)
	const [stripeCustomerId, stripeSubscriptionId] = await ensureStripeCustomerId(team)
	if (stripeSubscriptionId) {
		const configurations = await c.var.stripe.billingPortal.configurations.list()
		if (configurations.data.length === 0) throw new Error('Missing billing portal configuration')
		const session = await c.var.stripe.billingPortal.sessions.create({
			customer: stripeCustomerId,
			return_url: `${new URL(c.req.url).origin}/dashboard`,
			configuration: configurations.data[0].id
		})
		return c.redirect(session.url)
	} else {
		const { origin } = new URL(c.req.url)
		const session = await c.var.stripe.checkout.sessions.create({
			payment_method_types: ['card'],
			line_items: [
				{
					price: priceId,
					quantity: 1
				}
			],
			mode: 'subscription',
			success_url: `${origin}/api/stripe/checkout?sessionId={CHECKOUT_SESSION_ID}`,
			cancel_url: `${origin}/pricing`,
			customer: stripeCustomerId,
			client_reference_id: sessionUser.userId.toString(),
			allow_promotion_codes: true,
			subscription_data: {
				trial_period_days: 14
			}
		})
		if (!session.url) throw new Error('Missing session.url')
		return c.redirect(session.url)
	}
}

const Dashboard: FC = async () => {
	const c = useRequestContext<HonoEnv>()
	if (!c.var.sessionData.sessionUser) throw new Error('Missing sessionUser')
	const team = await c.var.dbService.getTeamForUser(c.var.sessionData.sessionUser)

	return (
		<div className="flex flex-col gap-2">
			<h1 className="text-lg font-medium lg:text-2xl">Dashboard</h1>
			<div className="card bg-base-100 w-96 shadow-sm">
				<div className="card-body">
					<h2 className="card-title">Team Subscription</h2>
					<p className="font-medium">Current Plan: {team.planName || 'Free'}</p>
					<div className="card-actions justify-end">
						<form action="/dashboard" method="post">
							<button className="btn btn-outline">Manage Subscription</button>
						</form>
					</div>
				</div>
			</div>
			<pre>{JSON.stringify({ team, sessionData: c.var.sessionData }, null, 2)}</pre>
		</div>
	)
}

const dashboardPost = async (c: HonoContext<HonoEnv>) => {
	if (!c.var.sessionData.sessionUser) throw new Error('Missing sessionUser')
	const team = await c.var.dbService.getTeamForUser(c.var.sessionData.sessionUser)
	if (!team.stripeCustomerId || !team.stripeProductId) {
		return c.redirect('/pricing')
	}
	const stripe = c.var.stripe
	const configurations = await stripe.billingPortal.configurations.list()
	if (configurations.data.length === 0) throw new Error('Missing billing portal configuration')
	const session = await stripe.billingPortal.sessions.create({
		customer: team.stripeCustomerId,
		return_url: `${new URL(c.req.url).origin}/dashboard`,
		configuration: configurations.data[0].id
	})
	return c.redirect(session.url)
}

async function syncStripeData({
	customerId,
	stripe,
	dbService
}: {
	customerId: string
	stripe: Stripe
	dbService: ReturnType<typeof createDbService>
}) {
	console.log({ log: 'syncStripeData', customerId })
	const subscriptions = await stripe.subscriptions.list({
		customer: customerId,
		limit: 1,
		status: 'all',
		expand: ['data.items', 'data.items.data.price']
	})
	if (subscriptions.data.length === 0) {
		console.log(`syncStripeData: No subscriptions found for customer ${customerId}`)
		return
	}

	// If a user can have multiple subscriptions, that's your problem
	const subscription = subscriptions.data[0]
	const subscriptionItem = subscription.items.data[0]
	if (typeof subscriptionItem.price.product !== 'string') throw new Error('Invalid product')
	if (typeof subscriptionItem.price.lookup_key !== 'string') throw new Error('Invalid lookup_key')
	await dbService.updateStripeSubscription({
		stripeCustomerId: customerId,
		stripeSubscriptionId: subscription.id,
		stripeProductId: subscriptionItem.price.product,
		planName: subscriptionItem.price.lookup_key,
		subscriptionStatus: subscription.status
	})
}

const Admin: FC<{ actionData?: any }> = async ({ actionData }) => {
	return (
		<div className="flex flex-col gap-2">
			<h1 className="text-lg font-medium lg:text-2xl">Admin</h1>
			<div className="flex gap-2">
				<form action="/admin" method="post">
					<button name="intent" value="effect" className="btn btn-outline">
						Effect
					</button>
				</form>
				<form action="/admin" method="post">
					<button name="intent" value="effect_1" className="btn btn-outline">
						Effect 1
					</button>
				</form>
				<form action="/admin" method="post">
					<button name="intent" value="effect_2" className="btn btn-outline">
						Effect 2
					</button>
				</form>
				<form action="/admin" method="post">
					<button name="intent" value="teams" className="btn btn-outline">
						Teams
					</button>
				</form>
				<form action="/admin" method="post">
					<button name="intent" value="billing_portal_configurations" className="btn btn-outline">
						Billing Portal Configs
					</button>
				</form>
				<div className="card bg-base-100 w-96 shadow-sm">
					<form action="/admin" method="post">
						<div className="card-body">
							<h2 className="card-title">Customer Subscription</h2>
							<fieldset className="fieldset">
								<legend className="fieldset-legend">Customer Id</legend>
								<input type="text" name="customerId" className="input" />
							</fieldset>
							<div className="card-actions justify-end">
								<button name="intent" value="customer_subscription" className="btn btn-primary">
									Submit
								</button>
							</div>
						</div>
					</form>
				</div>
				<div className="card bg-base-100 w-96 shadow-sm">
					<form action="/admin" method="post">
						<div className="card-body">
							<h2 className="card-title">Create User</h2>
							<fieldset className="fieldset">
								<legend className="fieldset-legend">Email</legend>
								<input type="email" name="email" className="input" />
							</fieldset>
							<div className="card-actions justify-end">
								<button type="submit" name="intent" value="create_user" className="btn btn-primary">
									Submit
								</button>
							</div>
						</div>
					</form>
				</div>
			</div>
			<pre>{JSON.stringify({ actionData }, null, 2)}</pre>
		</div>
	)
}

const adminPost = async (c: HonoContext<HonoEnv>) => {
	const formData = await c.req.formData()
	const intent = formData.get('intent')
	let actionData = {}
	switch (intent) {
		case 'effect':
			{
				const program = Effect.gen(function* () {
					const d1 = yield* D.D1
					const stmt = d1.prepare('select * from users where userId = ?').bind(1)
					return yield* d1.first(stmt)
				})
				actionData = { data: await c.var.runtime.runPromise(program) }
			}
			break

		case 'effect_1':
			{
				const program = Effect.gen(function* () {
					const d1 = yield* D.D1
					const stmt = d1.prepare('select * from users')
					return yield* d1.run(stmt)
				})
				actionData = { result: await c.var.runtime.runPromise(program) }
			}
			break
		case 'effect_2':
			{
				const program = Effect.gen(function* () {
					const d1 = yield* D.D1
					return yield* d1.batch([
						d1.prepare('select * from users where userId = ?').bind(1),
						d1.prepare('select * from users where userId = ?').bind(2)
					])
				})
				actionData = { result: await c.var.runtime.runPromise(program) }
			}
			break
		case 'teams':
			actionData = { teams: await c.var.dbService.getTeams() }
			break
		case 'billing_portal_configurations':
			actionData = { configurations: await c.var.stripe.billingPortal.configurations.list() }
			break
		case 'customer_subscription':
			{
				const customerId = formData.get('customerId')
				if (!(typeof customerId === 'string' && customerId)) throw new Error('Invalid customerId')
				const subscriptions = await c.var.stripe.subscriptions.list({
					customer: customerId,
					limit: 1,
					status: 'all',
					expand: ['data.items', 'data.items.data.price']
				})
				if (subscriptions.data.length === 0) throw new Error('No subscriptions found')
				actionData = {
					subscription: subscriptions.data[0]
				}
			}
			break
		case 'create_user':
			{
				const email = formData.get('email')
				if (!(typeof email === 'string' && email)) throw new Error('Invalid email')
				await c.var.dbService.upsertUser({ email })
			}
			break
		default:
			throw new Error('Invalid intent')
	}
	return c.render(<Admin actionData={{ intent, ...actionData }} />)
}


// class Repository extends Context.Tag('Repository')<
// 	Repository,
// 	{
// 		readonly getTeams: Effect.Effect<TeamsResult, UnknownException>
// 		// readonly upsertUser: (props: { email: string }) => Effect.Effect<string, UnknownException>
// 	}
// >() {}

function createRuntime({ env }: { env: Env }) {
	// ).pipe(Layer.provide(CloudflareEnvLive))
	// const RepositoryLive = Layer.effect(
	// 	Repository,
	// 	Effect.gen(function* () {
	// 		const d1 = yield* D1
	// 		return {
	// 			getTeams: Effect.tryPromise(() =>
	// 				d1
	// 					.prepare(
	// 						`
	// select json_group_array(
	// json_object(
	// 	'teamId', teamId, 'name', name, 'stripeCustomerId', stripeCustomerId, 'stripeSubscriptionId', stripeSubscriptionId, 'stripeProductId', stripeProductId, 'planName', planName, 'subscriptionStatus', subscriptionStatus,
	// 	'teamMembers',
	// 	(
	// 		select
	// 			json_group_array(
	// 				json_object(
	// 					'teamMemberId', tm.teamMemberId, 'userId', tm.userId, 'teamId', tm.teamId, 'teamMemberRole', tm.teamMemberRole,
	// 					'user', (select json_object('userId', u.userId, 'name', u.name, 'email', u.email, 'role', u.role) from users u where u.userId = tm.userId))
	// 				)
	// 		from teamMembers tm where tm.teamId = t.teamId
	// 	)
	// )
	// ) as data from teams t
	// `
	// 					)
	// 					.first<{ data: string }>()
	// 					.then((v) => Schema.decodeSync(TeamsResult)(v?.data))
	// 			)
	// 		}
	// 	})
	// )

	// const Live = RepositoryLive.pipe(Layer.provide(D1Live), Layer.provideMerge(D1Live))
	const Live = D.layer({ db: env.D1 })
	return ManagedRuntime.make(Live)
}
