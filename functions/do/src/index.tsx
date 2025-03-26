import type { FC, PropsWithChildren } from 'hono/jsx'
import { Cause, Chunk, Data, Effect, Layer, ManagedRuntime, Predicate, Schema } from 'effect'
import { dual } from 'effect/Function'
import { Handler, Hono, Context as HonoContext, Env as HonoEnv } from 'hono'
import { jsxRenderer, useRequestContext } from 'hono/jsx-renderer'
import * as ConfigEx from './ConfigEx'
import { Do } from './Do'
import { FormDataSchema } from './SchemaEx'

export { DoDurableObject } from './Do'

type AppEnv = {
	Bindings: Env
	Variables: {
		runtime: ReturnType<typeof makeRuntime>
	}
}

export const makeRuntime = (env: Env) => {
	const ConfigLive = ConfigEx.fromObject(env)
	return Layer.mergeAll(Do.Default).pipe(Layer.provide(ConfigLive), ManagedRuntime.make)
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
		app.get('/', (c) => c.render(<Home />))
		// app.get(
		// 	'/',
		// 	handler((c) => homeLoaderData().pipe(Effect.map((loaderData) => c.render(<Home loaderData={loaderData} />))))
		// )
		app.post('/', homePost)
		// app.get('/vote', (c) => c.render(<Vote />))
		// app.post('/vote', votePost)
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
		</>
	)
	return (
		<html>
			<head>
				<meta charset="UTF-8" />
				<meta name="viewport" content="width=device-width, initial-scale=1.0" />
				<link href={import.meta.env.MODE === 'development' ? '/src/tailwind.css' : '/tailwind.css'} rel="stylesheet"></link>
				<title>Do</title>
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
							Do v0.1
						</a>
					</div>
					<div className="navbar-center hidden lg:flex">
						<ul className="menu menu-horizontal px-1">
							<ListItems />
						</ul>
					</div>
					<div className="navbar-end gap-2"></div>
				</div>
				<div className="p-6">{children}</div>
			</body>
		</html>
	)
}

const Home: FC<{ actionData?: any }> = ({ actionData }) => (
	<div className="mt-2 flex flex-col items-center gap-2">
		<div className="card bg-base-100 w-96 shadow-sm">
			<form action="/" method="post">
				<div className="card-body">
					<h2 className="card-title text-center">Durable Object</h2>
					{actionData && <pre>{JSON.stringify(actionData, null, 2)}</pre>}
					<div className="card-actions justify-between">
						<button name="intent" value="ping" className="btn btn-outline">
							Ping
						</button>
						<button name="intent" value="ping_ping" className="btn btn-outline">
							Ping Ping
						</button>
					</div>
				</div>
			</form>
		</div>
	</div>
)

const homeLoaderData = () => Effect.succeed({})

const homePost = handler((c) =>
	Effect.gen(function* () {
		const HomeFormDataSchema = FormDataSchema(
			Schema.Struct({
				intent: Schema.Literal('ping', 'ping_ping')
			})
		)
		const formData = yield* Effect.tryPromise(() => c.req.formData()).pipe(Effect.flatMap(Schema.decode(HomeFormDataSchema)))
		let actionData
		switch (formData.intent) {
			case 'ping':
				actionData = yield* Do.ping()
				break
			case 'ping_ping':
				actionData = { ping: yield* Do.ping(), ping1: yield* Do.ping() }
				break
			default:
				return yield* Effect.fail(new Error('Invalid intent'))
		}
		return c.render(<Home actionData={actionData} />)
	})
)
