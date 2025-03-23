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
import { DurableObject } from 'cloudflare:workers'
import { Cause, Chunk, Config, Console, Data, Effect, Layer, Logger, LogLevel, ManagedRuntime, Predicate, Schema } from 'effect'
import { dual } from 'effect/Function'
import { Handler, Hono, Context as HonoContext, Env as HonoEnv } from 'hono'
import { deleteCookie, getSignedCookie, setSignedCookie } from 'hono/cookie'
import { jsxRenderer, useRequestContext } from 'hono/jsx-renderer'
import * as ConfigEx from './ConfigEx'
import * as D1Ns from './D1'
import { D1 } from './D1'
import { InvariantError, InvariantResponseError } from './ErrorEx'
import { Repository } from './Repository'
import { FormDataSchema, SessionData, UserSubject } from './schemas'
import { Ses } from './Ses'
import { Stripe } from './Stripe'

type AppEnv = {
	Bindings: Env
	Variables: {
		runtime: ReturnType<typeof makeRuntime>
		sessionData: SessionData
		client: Client
		redirectUri: string
	}
}

export const subjects = createSubjects({
	user: Schema.standardSchemaV1(UserSubject)
})

export const makeRuntime = (env: Env) => {
	const LogLevelLive = Config.logLevel('LOG_LEVEL').pipe(
		Config.withDefault(LogLevel.Info),
		Effect.map((level) => Logger.minimumLogLevel(level)),
		Layer.unwrapEffect
	)
	const ConfigLive = ConfigEx.fromObject(env)
	return Layer.mergeAll(
		Stripe.Default,
		Repository.Default,
		D1.Default,
		Ses.Default,
		// Logger.pretty doesn't seem to work well.
		Logger.replace(Logger.defaultLogger, env.ENVIRONMENT === 'local' ? Logger.defaultLogger : Logger.jsonLogger)
	).pipe(Layer.provide(LogLevelLive), Layer.provide(ConfigLive), ManagedRuntime.make)
}

export const orErrorResponse: {
	<A, E, R, Env extends HonoEnv>(c: HonoContext<Env>): (self: Effect.Effect<A, E, R>) => Effect.Effect<A, never, R>
	<A, E, R, Env extends HonoEnv>(self: Effect.Effect<A, E, R>, c: HonoContext<Env>): Effect.Effect<A, never, R>
} = dual(2, <a, E, R, Env extends HonoEnv>(self: Effect.Effect<a, E, R>, c: HonoContext<Env>) =>
	Effect.catchAll(self, (error) => {
		if (error instanceof InvariantResponseError) {
			return Effect.succeed(error.response)
		}
		return Effect.fail(error)
	}).pipe(
		Effect.catchAllCause((cause) => {
			const failures = Cause.failures(cause)
			const defects = Cause.defects(cause)

			const failuresHtml = Chunk.isEmpty(failures)
				? ''
				: `<div class="failures">
			<h2>Failures</h2>
			<ul>
				${Chunk.join(
					Chunk.map(
						failures,
						(error) =>
							`<li>${
								typeof error === 'object' && error !== null && 'message' in error
									? String(error.message).replace(/</g, '&lt;').replace(/>/g, '&gt;') +
										('cause' in error && error.cause
											? `<br>Cause: ${
													typeof error.cause === 'object' && error.cause !== null && 'message' in error.cause
														? String(error.cause.message).replace(/</g, '&lt;').replace(/>/g, '&gt;')
														: String(error.cause).replace(/</g, '&lt;').replace(/>/g, '&gt;')
												}`
											: '')
									: String(error).replace(/</g, '&lt;').replace(/>/g, '&gt;')
							}</li>`
					),
					''
				)}
			</ul>
		</div>`

			const defectsHtml = Chunk.isEmpty(defects)
				? ''
				: `<div class="defects">
			<h2>Defects</h2>
			<ul>
				${Chunk.join(
					Chunk.map(defects, (defect) => `<li>${String(defect).replace(/</g, '&lt;').replace(/>/g, '&gt;')}</li>`),
					''
				)}
			</ul>
		</div>`

			const html = `
		<!DOCTYPE html>
		<html>
		<head>
			<title>Error Occurred</title>
			<style>
				body { font-family: system-ui, -apple-system, sans-serif; line-height: 1.6; max-width: 800px; margin: 0 auto; padding: 20px; }
				h1 { color: #e53e3e; }
				.failures { background: #fff5f5; border-left: 4px solid #fc8181; padding: 1rem; margin: 1rem 0; }
				.defects { background: #fff5f5; border-left: 4px solid #f56565; padding: 1rem; margin: 1rem 0; }
				pre { background: #f7fafc; padding: 1rem; overflow-x: auto; }
			</style>
		</head>
		<body>
			<h1>An Error Occurred</h1>
			${failuresHtml}
			${defectsHtml}
			<div>
				<h2>Full Error Details</h2>
				<pre>${Cause.pretty(cause).replace(/</g, '&lt;').replace(/>/g, '&gt;')}</pre>
			</div>
		</body>
		</html>
	`
			return Effect.succeed(c.html(html))
		})
	)
)

export const handler =
	<A, E>(
		h: (
			...args: Parameters<Handler<AppEnv>>
		) => Effect.Effect<A | Promise<A>, E, ManagedRuntime.ManagedRuntime.Context<Parameters<Handler<AppEnv>>[0]['var']['runtime']>>
	) =>
	(...args: Parameters<Handler<AppEnv>>) =>
		h(...args).pipe(
			Effect.flatMap((response) => (Predicate.isPromise(response) ? Effect.tryPromise(() => response) : Effect.succeed(response))),
			orErrorResponse(args[0]),
			args[0].var.runtime.runPromise
		)

export default {
	async fetch(request, env, ctx): Promise<Response> {
		const runtime = makeRuntime(env)
		const openAuth = createOpenAuth({ env, runtime })
		const app = new Hono()
		app.route('/', openAuth)
		app.route('/', createApi({ runtime }))
		app.route('/', createFrontend({ env, ctx, runtime, openAuth })) // Last to isolate middleware
		const response = await app.fetch(request, env, ctx)
		ctx.waitUntil(runtime.dispose())
		return response
	}
} satisfies ExportedHandler<Env>

function createOpenAuth({ env, runtime }: { env: Env; runtime: AppEnv['Variables']['runtime'] }) {
	const { request, ...codeUi } = CodeUI({
		copy: {
			code_placeholder: 'Code (check Worker logs)'
		},
		sendCode: (claims, code) =>
			Effect.gen(function* () {
				yield* Console.log(`Console: sendCode: ${claims.email} ${code}`)
				yield* Effect.log(`sendCode: ${claims.email} ${code}`)
				if (env.ENVIRONMENT === 'local') {
					yield* Effect.tryPromise(() => env.KV.put(`local:code`, code, { expirationTtl: 60 }))
				}
				// Body MUST contain email to help identify complaints.
				// yield* Ses.sendEmail({
				// 	to: claims.email,
				// 	from: yield* Config.nonEmptyString('COMPANY_EMAIL'),
				// 	subject: 'Your Login Verification Code',
				// 	html: `Hey ${claims.email},<br><br>Please enter the following code to complete your login: ${code}.<br><br>If the code does not work, please request a new verification code.<br><br>Thanks, Team.`,
				// 	text: `Hey ${claims.email} - Please enter the following code to complete your login: ${code}. If the code does not work, please request a new verification code. Thanks, Team.`
				// })
			}).pipe(runtime.runPromise)
	})
	return issuer({
		ttl: {
			access: 60 * 30,
			refresh: 60 * 30,
			reuse: 0 // https://github.com/openauthjs/openauth/issues/133#issuecomment-2614264698
		},
		storage: CloudflareStorage({
			// @ts-expect-error TS2322: This error is expected due to type mismatch with KVNamespace
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
		success: (ctx, value) =>
			Repository.upsertUser({ email: value.claims.email }).pipe(
				Effect.flatMap((user) =>
					Effect.tryPromise(() =>
						ctx.subject('user', {
							userId: user.userId,
							email: user.email,
							role: user.role
						})
					)
				),
				runtime.runPromise
			)
	})
}

function createApi({ runtime }: { runtime: AppEnv['Variables']['runtime'] }) {
	const app = new Hono<AppEnv>()
	app.use(async (c, next) => {
		c.set('runtime', runtime)
		await next()
	})

	app.get(
		'/api/stripe/checkout',
		handler((c) =>
			Effect.gen(function* () {
				const sessionId = c.req.query('sessionId')
				if (!sessionId) return c.redirect('/pricing')
				yield* Stripe.finalizeCheckoutSession(sessionId)
				return c.redirect('/dashboard')
			})
		)
	)
	app.post(
		'/api/stripe/webhook',
		handler((c) => Stripe.handleWebhook(c.req.raw))
	)
	return app
}

function createFrontend({
	env,
	ctx,
	runtime,
	openAuth
}: {
	env: Env
	ctx: ExecutionContext
	runtime: AppEnv['Variables']['runtime']
	openAuth: ReturnType<typeof createOpenAuth>
}) {
	const app = new Hono<AppEnv>()

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
	app.get(
		'/pricing',
		handler((c) => pricingLoaderData(c).pipe(Effect.map((loaderData) => c.render(<Pricing loaderData={loaderData} />))))
	)
	app.post('/pricing', pricingPost)
	app.get(
		'/dashboard',
		handler((c) => dashboardLoaderData(c).pipe(Effect.map((loaderData) => c.render(<Dashboard loaderData={loaderData} />))))
	)
	app.post('/dashboard', dashboardPost)
	app.get('/admin', (c) => c.render(<Admin />))
	app.post('/admin', adminPost)
	return app
}

const Layout: FC<PropsWithChildren<{}>> = ({ children }) => {
	const ctx = useRequestContext<AppEnv>()
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
				<link href={import.meta.env.MODE === 'development' ? '/src/tailwind.css' : '/tailwind.css'} rel="stylesheet"></link>
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
							Cloudflare-OpenAUTH-Stripe v0.3
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
	const c = useRequestContext<AppEnv>()
	return (
		<div className="flex flex-col gap-2">
			<div>
				<pre>{JSON.stringify({ sessionData: c.var.sessionData }, null, 2)}</pre>
			</div>
		</div>
	)
}

const Pricing: FC<{ loaderData: Effect.Effect.Success<ReturnType<typeof pricingLoaderData>> }> = async ({ loaderData }) => {
	return (
		<>
			<div className="mx-auto grid max-w-xl gap-8 md:grid-cols-2">
				{loaderData.prices.map((price) => {
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
			<pre>{JSON.stringify({ loaderData }, null, 2)}</pre>
		</>
	)
}

const pricingLoaderData = (c: HonoContext<AppEnv>) => Stripe.getPrices().pipe(Effect.map((prices) => ({ prices })))

const pricingPost = handler((c) =>
	Effect.gen(function* () {
		// https://github.com/t3dotgg/stripe-recommendations?tab=readme-ov-file#checkout-flow
		const sessionUser = yield* Effect.fromNullable(c.var.sessionData.sessionUser).pipe(
			Effect.mapError(
				() =>
					new InvariantResponseError({
						message: 'Missing session user',
						response: c.redirect('/authenticate')
					})
			),
			Effect.filterOrFail(
				(sessionUser): sessionUser is typeof sessionUser & { role: 'user' } => sessionUser.role === 'user',
				() => new InvariantError({ message: 'Only users can subscribe' })
			)
		)
		const priceId = yield* Effect.tryPromise(() => c.req.formData()).pipe(
			Effect.flatMap(
				Schema.decode(FormDataSchema(Schema.Struct({ priceId: Schema.NonEmptyString }).annotations({ identifier: 'Price ID' })))
			),
			Effect.map((formData) => formData.priceId)
		)
		const { stripeCustomerId, stripeSubscriptionId } = yield* Stripe.ensureStripeCustomerId({
			userId: sessionUser.userId,
			email: sessionUser.email
		})
		const { origin } = new URL(c.req.url)
		return yield* stripeSubscriptionId
			? Stripe.createBillingPortalSession({
					customer: stripeCustomerId,
					return_url: `${origin}/dashboard`
				}).pipe(Effect.map((session) => c.redirect(session.url)))
			: Stripe.createCheckoutSession({
					customer: stripeCustomerId,
					success_url: `${origin}/api/stripe/checkout?sessionId={CHECKOUT_SESSION_ID}`,
					cancel_url: `${origin}/pricing`,
					client_reference_id: sessionUser.userId.toString(),
					price: priceId
				}).pipe(
					Effect.flatMap((session) =>
						typeof session.url === 'string' ? Effect.succeed(c.redirect(session.url)) : Effect.fail(new Error('Missing session url'))
					)
				)
	})
)

const Dashboard: FC<{ loaderData: Effect.Effect.Success<ReturnType<typeof dashboardLoaderData>> }> = async ({ loaderData }) => {
	return (
		<div className="flex flex-col gap-2">
			<h1 className="text-lg font-medium lg:text-2xl">Dashboard</h1>
			<div className="card bg-base-100 w-96 shadow-sm">
				<div className="card-body">
					<h2 className="card-title">Team Subscription</h2>
					<p className="font-medium">Current Plan: {loaderData.team.planName || 'Free'}</p>
					<div className="card-actions justify-end">
						<form action="/dashboard" method="post">
							<button className="btn btn-outline">Manage Subscription</button>
						</form>
					</div>
				</div>
			</div>
			<pre>{JSON.stringify({ loaderData }, null, 2)}</pre>
		</div>
	)
}

const dashboardLoaderData = (c: HonoContext<AppEnv>) =>
	Effect.fromNullable(c.var.sessionData.sessionUser).pipe(
		Effect.flatMap((user) => Repository.getRequiredTeamForUser(user)),
		Effect.map((team) => ({ team, sessionData: c.var.sessionData }))
	)

const dashboardPost = handler((c) =>
	Effect.gen(function* () {
		const team = yield* Effect.fromNullable(c.var.sessionData.sessionUser).pipe(
			Effect.flatMap((user) => Repository.getRequiredTeamForUser(user))
		)
		if (!team.stripeCustomerId || !team.stripeProductId) {
			return c.redirect('/pricing')
		}
		return yield* Stripe.createBillingPortalSession({
			customer: team.stripeCustomerId,
			return_url: `${new URL(c.req.url).origin}/dashboard`
		}).pipe(Effect.map((session) => c.redirect(session.url)))
	})
)

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
				<div className="card bg-base-100 w-96 shadow-sm">
					<form action="/admin" method="post">
						<div className="card-body">
							<h2 className="card-title">Sync Stripe Data</h2>
							<fieldset className="fieldset">
								<legend className="fieldset-legend">Customer Id</legend>
								<input type="text" name="customerId" className="input" />
							</fieldset>
							<div className="card-actions justify-end">
								<button name="intent" value="sync_stripe_data" className="btn btn-primary">
									Submit
								</button>
							</div>
						</div>
					</form>
				</div>
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

const adminPost = handler((c) =>
	Effect.gen(function* () {
		const AdminFormDataSchema = FormDataSchema(
			Schema.Union(
				Schema.Struct({
					intent: Schema.Literal('effect')
				}),
				Schema.Struct({
					intent: Schema.Literal('effect_1')
				}),
				Schema.Struct({
					intent: Schema.Literal('effect_2')
				}),
				Schema.Struct({
					intent: Schema.Literal('teams')
				}),
				Schema.Struct({
					intent: Schema.Literal('sync_stripe_data'),
					customerId: Schema.NonEmptyString
				}),
				Schema.Struct({
					intent: Schema.Literal('customer_subscription'),
					customerId: Schema.NonEmptyString
				}),
				Schema.Struct({
					intent: Schema.Literal('create_user'),
					email: Schema.NonEmptyString
				})
			)
		)
		const formData = yield* Effect.tryPromise(() => c.req.formData()).pipe(Effect.flatMap(Schema.decode(AdminFormDataSchema)))
		let actionData = {}
		switch (formData.intent) {
			case 'effect':
				actionData = { data: yield* D1.prepare('insert into users (name, email) values ("joe", "u@u.com")').pipe(Effect.flatMap(D1.run)) }
				break
			case 'effect_1':
				actionData = { foo: yield* Stripe.foo(), result: yield* D1.prepare('select * from users').pipe(Effect.andThen(D1.run)) }
				break
			case 'effect_2':
				{
					const stmt = yield* D1.prepare('select * from users where userId = ?')
					actionData = {
						result: yield* D1.batch([
							stmt.bind(1),
							stmt.bind(2),
							yield* D1.prepare('select userId, email from users where userId = ?').pipe(D1Ns.bind(3))
						])
					}
				}
				break
			case 'teams':
				actionData = { teams: yield* Repository.getTeams() }
				break
			case 'sync_stripe_data':
				{
					yield* Stripe.syncStripeData(formData.customerId)
					actionData = {
						message: 'Stripe data synced.'
					}
				}
				break
			case 'customer_subscription':
				{
					const subscription = yield* Stripe.getSubscriptionForCustomer(formData.customerId)
					actionData = {
						subscription
					}
				}
				break
			case 'create_user':
				{
					actionData = { user: yield* Repository.upsertUser({ email: formData.email }) }
				}
				break
			default:
				throw new Error('Invalid intent')
		}
		return c.render(<Admin actionData={{ intent: formData.intent, ...actionData }} />)
	})
)

export class StripeDurableObject extends DurableObject<Env> {
	sql: SqlStorage

	constructor(ctx: DurableObjectState, env: Env) {
		super(ctx, env)
		this.sql = ctx.storage.sql
		this.sql.exec(`create table if not exists events(
			customerId text primary key,
			createdAt integer default (unixepoch()))`)
	}
	async foo() {
		return 'bar'
	}
	// 	async getTally() {
	// 		const tallyUnknown = this.sql
	// 			.exec(
	// 				`
	// select
	// 	count(case when vote = 'tradition' then 1 end) as traditionCount,
	// 	count(case when vote = 'modern' then 1 end) as modernCount
	// from votes`
	// 			)
	// 			.one()
	// 		return Schema.decodeUnknownSync(Tally)(tallyUnknown)
	// 	}
	// 	async vote(voterId: string, vote: 'tradition' | 'modern') {
	// 		// 'UNIQUE constraint failed: votes.voterId: SQLITE_CONSTRAINT'
	// 		this.sql.exec(
	// 			`insert into votes (voterId, vote) values (?, ?)
	// 			on conflict (voterId) do update set vote = excluded.vote`,
	// 			voterId,
	// 			vote
	// 		)
	// 	}
}
