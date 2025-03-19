import type { FC, PropsWithChildren } from 'hono/jsx'
import {
	Cause,
	Chunk,
	Config,
	Console,
	Data,
	Effect,
	Layer,
	Logger,
	LogLevel,
	ManagedRuntime,
	pipe,
	Predicate,
	Record,
	Schema
} from 'effect'
import { dual } from 'effect/Function'
import { Handler, Hono, Context as HonoContext, Env as HonoEnv } from 'hono'
import { jsxRenderer, useRequestContext } from 'hono/jsx-renderer'
import * as ConfigEx from './ConfigEx'
import { Poll } from './Poll'
import { FormDataSchema } from './schemas'

type AppEnv = {
	Bindings: Env
	Variables: {
		runtime: ReturnType<typeof makeRuntime>
	}
}

export const makeRuntime = (env: Env) => {
	const ConfigLive = ConfigEx.fromObject(env)
	return Layer.mergeAll(
		Poll.Default
		// Logger.pretty doesn't seem to work well.
	).pipe(Layer.provide(ConfigLive), ManagedRuntime.make)
}

// https://github.com/epicweb-dev/invariant/blob/main/README.md
class InvariantError extends Data.TaggedError('InvariantError')<{ message: string }> {}
class InvariantResponseError extends Data.TaggedError('InvariantResponseError')<{ message: string; response: Response }> {}

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
		const app = new Hono<AppEnv>()
		app.use(async (c, next) => {
			c.set('runtime', runtime)
			await next()
		})
		app.use(
			'/*',
			jsxRenderer(({ children }) => <Layout>{children}</Layout>)
		)
		app.get(
			'/',
			handler((c) => homeLoaderData(c).pipe(Effect.map((loaderData) => c.render(<Home loaderData={loaderData} />))))
		)
		// app.get(
		// 	'/dashboard',
		// 	handler((c) => dashboardLoaderData(c).pipe(Effect.map((loaderData) => c.render(<Dashboard loaderData={loaderData} />))))
		// )
		// app.post('/dashboard', dashboardPost)
		// app.get('/admin', (c) => c.render(<Admin />))
		// app.post('/admin', adminPost)
		const response = await app.fetch(request, env, ctx)
		ctx.waitUntil(runtime.dispose())
		return response
	}
} satisfies ExportedHandler<Env>

const Layout: FC<PropsWithChildren<{}>> = ({ children }) => {
	const ctx = useRequestContext<AppEnv>()
	const ListItems = () => (
		<>
			<li>
				<a href="/">Home</a>
			</li>
			<li>
				<a href="/vote">Vote</a>
			</li>
		</>
	)
	return (
		<html>
			<head>
				<meta charset="UTF-8" />
				<meta name="viewport" content="width=device-width, initial-scale=1.0" />
				<link href={import.meta.env.MODE === 'development' ? '/src/tailwind.css' : '/tailwind.css'} rel="stylesheet"></link>
				<title>Config Object POC</title>
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
							Config Object POC
						</a>
					</div>
					<div className="navbar-center hidden lg:flex">
						<ul className="menu menu-horizontal px-1">
							<ListItems />
						</ul>
					</div>
					<div className="navbar-end gap-2">ip</div>
				</div>
				<div className="p-6">{children}</div>
			</body>
		</html>
	)
}

const Home: FC<{ loaderData: Effect.Effect.Success<ReturnType<typeof homeLoaderData>> }> = ({ loaderData }) => (
	<div className="items-center flex flex-col gap-2">
		{/* <h1 className="text-lg font-medium lg:text-2xl">Poll</h1> */}
		<div className="card bg-base-100 w-96 shadow-sm mt-2">
			<div className="card-body">
				<h2 className="card-title">Tally</h2>
				<p className="font-medium">Tradition: {loaderData.traditionCount}</p>{' '}
				<p className="font-medium">Modern: {loaderData.modernCount}</p>
			</div>
		</div>
		<pre>{JSON.stringify({ loaderData }, null, 2)}</pre>
	</div>
)

const homeLoaderData = (c: HonoContext<AppEnv>) => Effect.succeed({ traditionCount: 7, modernCount: 77 })

// const Dashboard: FC<{ loaderData: Effect.Effect.Success<ReturnType<typeof dashboardLoaderData>> }> = async ({ loaderData }) => {
// 	return (
// 		<div className="flex flex-col gap-2">
// 			<h1 className="text-lg font-medium lg:text-2xl">Dashboard</h1>
// 			<div className="card bg-base-100 w-96 shadow-sm">
// 				<div className="card-body">
// 					<h2 className="card-title">Team Subscription</h2>
// 					<p className="font-medium">Current Plan: {loaderData.team.planName || 'Free'}</p>
// 					<div className="card-actions justify-end">
// 						<form action="/dashboard" method="post">
// 							<button className="btn btn-outline">Manage Subscription</button>
// 						</form>
// 					</div>
// 				</div>
// 			</div>
// 			<pre>{JSON.stringify({ loaderData }, null, 2)}</pre>
// 		</div>
// 	)
// }

// const dashboardLoaderData = (c: HonoContext<AppEnv>) =>
// 	Effect.fromNullable(c.var.sessionData.sessionUser).pipe(
// 		Effect.flatMap((user) => Repository.getRequiredTeamForUser(user)),
// 		Effect.map((team) => ({ team, sessionData: c.var.sessionData }))
// 	)

// const dashboardPost = handler((c) =>
// 	Effect.gen(function* () {
// 		const team = yield* Effect.fromNullable(c.var.sessionData.sessionUser).pipe(
// 			Effect.flatMap((user) => Repository.getRequiredTeamForUser(user))
// 		)
// 		if (!team.stripeCustomerId || !team.stripeProductId) {
// 			return c.redirect('/pricing')
// 		}
// 		return yield* Stripe.createBillingPortalSession({
// 			customer: team.stripeCustomerId,
// 			return_url: `${new URL(c.req.url).origin}/dashboard`
// 		}).pipe(Effect.map((session) => c.redirect(session.url)))
// 	})
// )

// const Admin: FC<{ actionData?: any }> = async ({ actionData }) => {
// 	return (
// 		<div className="flex flex-col gap-2">
// 			<h1 className="text-lg font-medium lg:text-2xl">Admin</h1>
// 			<div className="flex gap-2">
// 				<form action="/admin" method="post">
// 					<button name="intent" value="effect" className="btn btn-outline">
// 						Effect
// 					</button>
// 				</form>
// 				<form action="/admin" method="post">
// 					<button name="intent" value="effect_1" className="btn btn-outline">
// 						Effect 1
// 					</button>
// 				</form>
// 				<form action="/admin" method="post">
// 					<button name="intent" value="effect_2" className="btn btn-outline">
// 						Effect 2
// 					</button>
// 				</form>
// 				<form action="/admin" method="post">
// 					<button name="intent" value="teams" className="btn btn-outline">
// 						Teams
// 					</button>
// 				</form>
// 				<div className="card bg-base-100 w-96 shadow-sm">
// 					<form action="/admin" method="post">
// 						<div className="card-body">
// 							<h2 className="card-title">Sync Stripe Data</h2>
// 							<fieldset className="fieldset">
// 								<legend className="fieldset-legend">Customer Id</legend>
// 								<input type="text" name="customerId" className="input" />
// 							</fieldset>
// 							<div className="card-actions justify-end">
// 								<button name="intent" value="sync_stripe_data" className="btn btn-primary">
// 									Submit
// 								</button>
// 							</div>
// 						</div>
// 					</form>
// 				</div>
// 				<div className="card bg-base-100 w-96 shadow-sm">
// 					<form action="/admin" method="post">
// 						<div className="card-body">
// 							<h2 className="card-title">Customer Subscription</h2>
// 							<fieldset className="fieldset">
// 								<legend className="fieldset-legend">Customer Id</legend>
// 								<input type="text" name="customerId" className="input" />
// 							</fieldset>
// 							<div className="card-actions justify-end">
// 								<button name="intent" value="customer_subscription" className="btn btn-primary">
// 									Submit
// 								</button>
// 							</div>
// 						</div>
// 					</form>
// 				</div>
// 				<div className="card bg-base-100 w-96 shadow-sm">
// 					<form action="/admin" method="post">
// 						<div className="card-body">
// 							<h2 className="card-title">Create User</h2>
// 							<fieldset className="fieldset">
// 								<legend className="fieldset-legend">Email</legend>
// 								<input type="email" name="email" className="input" />
// 							</fieldset>
// 							<div className="card-actions justify-end">
// 								<button type="submit" name="intent" value="create_user" className="btn btn-primary">
// 									Submit
// 								</button>
// 							</div>
// 						</div>
// 					</form>
// 				</div>
// 			</div>
// 			<pre>{JSON.stringify({ actionData }, null, 2)}</pre>
// 		</div>
// 	)
// }

// const adminPost = handler((c) =>
// 	Effect.gen(function* () {
// 		const AdminFormDataSchema = FormDataSchema(
// 			Schema.Union(
// 				Schema.Struct({
// 					intent: Schema.Literal('effect')
// 				}),
// 				Schema.Struct({
// 					intent: Schema.Literal('effect_1')
// 				}),
// 				Schema.Struct({
// 					intent: Schema.Literal('effect_2')
// 				}),
// 				Schema.Struct({
// 					intent: Schema.Literal('teams')
// 				}),
// 				Schema.Struct({
// 					intent: Schema.Literal('sync_stripe_data'),
// 					customerId: Schema.NonEmptyString
// 				}),
// 				Schema.Struct({
// 					intent: Schema.Literal('customer_subscription'),
// 					customerId: Schema.NonEmptyString
// 				}),
// 				Schema.Struct({
// 					intent: Schema.Literal('create_user'),
// 					email: Schema.NonEmptyString
// 				})
// 			)
// 		)
// 		const formData = yield* Effect.tryPromise(() => c.req.formData()).pipe(Effect.flatMap(Schema.decode(AdminFormDataSchema)))
// 		let actionData = {}
// 		switch (formData.intent) {
// 			case 'effect':
// 				actionData = { data: yield* D1.prepare('insert into users (name, email) values ("joe", "u@u.com")').pipe(Effect.flatMap(D1.run)) }
// 				break
// 			case 'effect_1':
// 				yield* Effect.log('Effect 1', 'msg2', 'msg3')
// 				yield* Effect.logDebug('Effect 1 debug')
// 				actionData = { result: yield* D1.prepare('select * from users').pipe(Effect.andThen(D1.run)) }
// 				break
// 			case 'effect_2':
// 				{
// 					const stmt = yield* D1.prepare('select * from users where userId = ?')
// 					actionData = {
// 						result: yield* D1.batch([
// 							stmt.bind(1),
// 							stmt.bind(2),
// 							yield* D1.prepare('select userId, email from users where userId = ?').pipe(D1Ns.bind(3))
// 						])
// 					}
// 				}
// 				break
// 			case 'teams':
// 				actionData = { teams: yield* Repository.getTeams() }
// 				break
// 			case 'sync_stripe_data':
// 				{
// 					yield* Stripe.syncStripData(formData.customerId)
// 					actionData = {
// 						message: 'Stripe data synced.'
// 					}
// 				}
// 				break
// 			case 'customer_subscription':
// 				{
// 					const subscription = yield* Stripe.getSubscriptionForCustomer(formData.customerId)
// 					actionData = {
// 						subscription
// 					}
// 				}
// 				break
// 			case 'create_user':
// 				{
// 					actionData = { user: yield* Repository.upsertUser({ email: formData.email }) }
// 				}
// 				break
// 			default:
// 				throw new Error('Invalid intent')
// 		}
// 		return c.render(<Admin actionData={{ intent: formData.intent, ...actionData }} />)
// 	})
// )
