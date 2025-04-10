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
import { Cause, Chunk, Config, Console, Effect, Layer, Logger, LogLevel, ManagedRuntime, Predicate, Schema } from 'effect'
import { dual } from 'effect/Function'
import { Handler, Hono, Context as HonoContext, Env as HonoEnv, MiddlewareHandler } from 'hono'
import { deleteCookie, getSignedCookie, setSignedCookie } from 'hono/cookie'
import { jsxRenderer, useRequestContext } from 'hono/jsx-renderer'
import { PanelLeftOpen as panelLeftOpenIconNode, User as userIconNode } from 'lucide'
import * as CloudflareEx from './CloudflareEx'
import { Account, AccountWithUser, SessionData, UserSubject } from './Domain'
import { InvariantError, InvariantResponseError } from './ErrorEx'
import { IdentityMgr } from './IdentityMgr'
import * as Q from './Queue'
import { FormDataSchema } from './SchemaEx'
import { Stripe } from './Stripe'

export { StripeDurableObject } from './Stripe'

type AppEnv = {
  Bindings: Env
  Variables: {
    runtime: ReturnType<typeof makeRuntime>
    sessionData: SessionData
    client: Client
    redirectUri: string
    account?: AccountWithUser
  }
}

export const subjects = createSubjects({
  user: Schema.standardSchemaV1(UserSubject)
})

export const makeRuntime = (env: Env) => {
  return Layer.mergeAll(IdentityMgr.Default, Stripe.Default, Q.Producer.Default).pipe(
    CloudflareEx.provideLoggerAndConfig,
    ManagedRuntime.make
  )
}

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

export const middleware =
  <A, E>(
    mw: (
      ...args: Parameters<MiddlewareHandler<AppEnv>>
    ) => Effect.Effect<
      Awaited<ReturnType<MiddlewareHandler>>,
      E,
      ManagedRuntime.ManagedRuntime.Context<Parameters<Handler<AppEnv>>[0]['var']['runtime']>
    >
  ) =>
  (...args: Parameters<MiddlewareHandler<AppEnv>>) =>
    mw(...args).pipe(args[0].var.runtime.runPromise)

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
  },
  queue: Q.queue
} satisfies ExportedHandler<Env>

function createOpenAuth({ env, runtime }: { env: Env; runtime: AppEnv['Variables']['runtime'] }) {
  const { request, ...codeUi } = CodeUI({
    copy: {
      code_placeholder: 'Code (check Worker logs)'
    },
    sendCode: (claims, code) =>
      Effect.gen(function* () {
        yield* Effect.log(`sendCode: ${claims.email} ${code}`)
        if (env.ENVIRONMENT === 'local') {
          yield* Effect.tryPromise(() => env.KV.put(`local:code`, code, { expirationTtl: 60 }))
        }
        // Body MUST contain email to help identify complaints.
        yield* Q.Producer.send({
          type: 'email',
          to: claims.email,
          from: yield* Config.nonEmptyString('COMPANY_EMAIL'),
          subject: 'Your Login Verification Code',
          html: `Hey ${claims.email},<br><br>Please enter the following code to complete your login: ${code}.<br><br>If the code does not work, please request a new verification code.<br><br>Thanks, Team.`,
          text: `Hey ${claims.email} - Please enter the following code to complete your login: ${code}. If the code does not work, please request a new verification code. Thanks, Team.`
        })
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
      IdentityMgr.provisionUser({ email: value.claims.email }).pipe(
        Effect.flatMap((user) =>
          Effect.tryPromise(() =>
            ctx.subject('user', {
              userId: user.userId,
              email: user.email,
              userType: user.userType
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
        return c.redirect('/app/billing')
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
      await env.KV.put(sessionId, JSON.stringify(c.var.sessionData), { expirationTtl: 60 * 60 })
    }
  })
  app.use(
    '/app/*',
    middleware((c, next) =>
      Effect.gen(function* () {
        if (!c.var.sessionData.sessionUser) {
          return c.redirect('/authenticate')
        } else if (c.var.sessionData.sessionUser.userType !== 'customer') {
          return c.text('Forbidden', 403)
        }
        const render = c.render
        c.render = (content) => {
          return render(<AppLayout>{content}</AppLayout>)
        }
        yield* Effect.tryPromise(() => next())
      })
    )
  )

  app.use(
    'app/:accountId/*',
    middleware((c, next) =>
      Effect.gen(function* () {
        const AccountIdFromPath = Schema.compose(Schema.NumberFromString, Account.fields.accountId)
        const accountId = yield* Schema.decodeUnknown(AccountIdFromPath)(c.req.param('accountId'))
        const account = yield* Effect.fromNullable(c.var.sessionData.sessionUser).pipe(
          Effect.flatMap((sessionUser) =>
            IdentityMgr.getAccountForMember({
              accountId,
              userId: sessionUser.userId
            })
          ),
          Effect.tapError((e) => Effect.log(`middleware accountId error:`, e)),
          Effect.orElseSucceed(() => null)
        )
        if (!account) {
          return c.redirect('/app')
        }
        c.set('account', account)
        yield* Effect.tryPromise(() => next())
      })
    )
  )

  app.use(
    '/admin/*',
    middleware((c, next) =>
      Effect.gen(function* () {
        if (!c.var.sessionData.sessionUser) {
          return c.redirect('/authenticate')
        } else if (c.var.sessionData.sessionUser.userType !== 'staffer') {
          return c.text('Forbidden', 403)
        }
        yield* Effect.tryPromise(() => next())
      })
    )
  )
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
          userType: verified.subject.properties.userType
        }
      })
      return c.redirect(verified.subject.properties.userType === 'staffer' ? '/admin' : '/app')
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
    '/app',
    handler((c) => appLoaderData(c).pipe(Effect.map((loaderData) => c.render(<App loaderData={loaderData} />))))
  )
  app.post('/app', appPost)
  app.get('/app/:accountId', (c) => c.render(<AccountHome />))
  app.get(
    '/app/:accountId/members',
    handler((c) => membersLoaderData(c).pipe(Effect.map((loaderData) => c.render(<Members loaderData={loaderData} />))))
  )
  app.post('/app/:accountId/members', membersPost)
  app.get(
    '/app/:accountId/billing',
    handler((c) => billingLoaderData(c).pipe(Effect.map((loaderData) => c.render(<Billing loaderData={loaderData} />))))
  )
  app.post('/app/:accountId/billing', billingPost)
  app.get('/admin', (c) => c.render(<Admin />))
  app.post('/admin', adminPost)
  app.get('/seed', seedGet)
  return app
}

/*
<svg
	data-v-14c8c335=""
	xmlns="http://www.w3.org/2000/svg"
	width="24"
	height="24"
	viewBox="0 0 24 24"
	fill="none"
	stroke="currentColor"
	stroke-width="2"
	stroke-linecap="round"
	stroke-linejoin="round"
	class="lucide lucide-user-icon lucide-user lucide-icon customizable"
>
	<path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"></path>
	<circle cx="12" cy="7" r="4"></circle>
</svg>
*/

// https://github.com/lucide-icons/lucide/blob/main/packages/lucide-react/src/Icon.ts
function Icon({ iconNode, className }: { iconNode: typeof userIconNode; className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
      className={className}
    >
      {iconNode.map(([Tag, attrs]) => (
        <Tag {...attrs} />
      ))}
    </svg>
  )
}

const Layout: FC<PropsWithChildren<{}>> = ({ children }) => {
  const c = useRequestContext<AppEnv>()
  return (
    <html>
      <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <link href={import.meta.env.MODE === 'development' ? '/src/tailwind.css' : '/tailwind.css'} rel="stylesheet"></link>
        <title>COS</title>
      </head>
      <body>
        <div className="navbar bg-base-100 shadow-sm">
          <div className="navbar-start">
            <a href="/" className="btn btn-ghost text-xl">
              COS v0.6
            </a>
          </div>
          <div className="navbar-end gap-2">
            <a href="/pricing" className="btn">
              Pricing
            </a>
            {c.var.sessionData.sessionUser ? (
              <div className="dropdown dropdown-end">
                <div tabIndex={0} role="button" className="btn btn-ghost btn-circle">
                  <div className="grid w-10 place-items-center rounded-full">
                    <Icon iconNode={userIconNode} />
                  </div>
                </div>
                <ul tabIndex={0} className="menu menu-sm dropdown-content bg-base-100 rounded-box z-1 mt-3 w-52 p-2 shadow">
                  <li>{c.var.sessionData.sessionUser.email}</li>
                  <li>
                    <form action="/signout" method="post">
                      <button type="submit" className="">
                        Sign Out
                      </button>
                    </form>
                  </li>
                </ul>
              </div>
            ) : (
              <a href="/authenticate" className="btn">
                Sign In / Up
              </a>
            )}
          </div>
        </div>
        <div>{children}</div>
      </body>
    </html>
  )
}

const Home: FC = () => {
  const c = useRequestContext<AppEnv>()
  return (
    <div className="hero bg-base-200 min-h-screen">
      <div className="hero-content text-center">
        <div className="max-w-md">
          <h1 className="text-5xl font-bold">Cloudflare OpenAUTH Stripe</h1>
          <p className="py-6"></p>
          {!c.var.sessionData.sessionUser ? (
            <a href="/authenticate" className="btn btn-primary">
              Sign In / Up
            </a>
          ) : c.var.sessionData.sessionUser.userType === 'staffer' ? (
            <a href="/admin" className="btn btn-primary">
              Enter
            </a>
          ) : (
            <a href="/app" className="btn btn-primary">
              Enter
            </a>
          )}
        </div>
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
        (sessionUser): sessionUser is typeof sessionUser & { userType: 'customer' } => sessionUser.userType === 'customer',
        () => new InvariantError({ message: 'Only customers can subscribe' })
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
          return_url: `${origin}/app/billing`
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

const AppLayout: FC<PropsWithChildren<{}>> = ({ children }) => {
  const c = useRequestContext<AppEnv>()
  c.var.account
  return (
    <div className="drawer lg:drawer-open">
      <input id="drawer" type="checkbox" className="drawer-toggle" />
      <div className="drawer-content flex flex-col gap-2 p-6">
        <label htmlFor="drawer" className="drawer-button lg:hidden">
          <Icon iconNode={panelLeftOpenIconNode} />
        </label>
        {children}
      </div>
      <div className="drawer-side">
        <label htmlFor="drawer" aria-label="close sidebar" className="drawer-overlay"></label>
        <ul className="menu bg-base-200 text-base-content min-h-full w-80 p-4">
          <li>
            <a href="/app">Accounts</a>
          </li>
          {c.var.account ? (
            <>
              <li>
                <a href={`/app/${c.var.account.accountId}`} className="capitalize">
                  {c.var.account.user.email} Home
                </a>
              </li>
              <li>
                <details open>
                  <summary>Manage Account</summary>
                  <ul>
                    <li>
                      <a href={`/app/${c.var.account.accountId}/members`}>Members</a>
                    </li>
                    <li>
                      <a href={`/app/${c.var.account.accountId}/billing`}>Billing</a>
                    </li>
                  </ul>
                </details>
              </li>
            </>
          ) : null}
        </ul>
      </div>
    </div>
  )
}

const App: FC<{ loaderData: Effect.Effect.Success<ReturnType<typeof appLoaderData>> }> = async ({ loaderData }) => {
  const c = useRequestContext<AppEnv>()
  return (
    <>
      <h1 className="text-lg font-medium lg:text-2xl">Accounts</h1>
      <ul className="list bg-base-100 rounded-box shadow-md">
        <li className="p-4 pb-2 text-xs tracking-wide opacity-60">Invitations</li>
        {loaderData.invitations.map((m) => (
          <li key={m.accountMemberId} className="list-row">
            <div className="list-col-grow">
              <a href={`/app/${m.accountId}`}>{m.account.user.email}</a>
            </div>
            <div className="flex gap-2">
              <form action="/app" method="post">
                <input type="hidden" name="accountMemberId" value={m.accountMemberId} />
                <button name="intent" value="accept" className="btn btn-sm btn-outline">
                  Accept
                </button>
              </form>
              <form action="/app" method="post">
                <input type="hidden" name="accountMemberId" value={m.accountMemberId} />
                <button name="intent" value="decline" className="btn btn-sm btn-outline btn-error">
                  Decline
                </button>
              </form>
            </div>
          </li>
        ))}
      </ul>

      <ul className="list bg-base-100 rounded-box shadow-md">
        <li className="p-4 pb-2 text-xs tracking-wide opacity-60">Accounts</li>
        {loaderData.accounts.map((a) => (
          <li key={a.accountId} className="list-row">
            <div className="list-col-grow">
              <a href={`/app/${a.accountId}`}>{a.user.email}</a>
            </div>
          </li>
        ))}
      </ul>
    </>
  )
}

const appLoaderData = (c: HonoContext<AppEnv>) =>
  Effect.gen(function* () {
    const sessionUser = yield* Effect.fromNullable(c.var.sessionData.sessionUser)
    return {
      invitations: yield* IdentityMgr.getInvitations(sessionUser),
      accounts: yield* IdentityMgr.getAccounts(sessionUser)
    }
  })

const appPost = handler((c) =>
  Effect.gen(function* () {
    const AppFormDataSchema = FormDataSchema(
      Schema.Struct({
        accountMemberId: Schema.NumberFromString,
        intent: Schema.Literal('accept', 'decline')
      })
    )
    const formData = yield* Effect.tryPromise(() => c.req.formData()).pipe(Effect.flatMap(Schema.decode(AppFormDataSchema)))
    switch (formData.intent) {
      case 'accept':
        yield* IdentityMgr.acceptInvitation({ accountMemberId: formData.accountMemberId })
        break
      case 'decline':
        yield* IdentityMgr.declineInvitation({ accountMemberId: formData.accountMemberId })
        break
      default:
        return yield* Effect.fail(new Error('Invalid intent'))
    }
    return c.redirect('/app')
  })
)

const AccountHome: FC = () => {
  return (
    <>
      <h1 className="text-lg font-medium lg:text-2xl">Home</h1>
    </>
  )
}

export type PermissionAction = "read" | "manage" | "delete";
export type PermissionConfig = Record<string, ReadonlyArray<PermissionAction>>;

export type InferPermissions<T extends PermissionConfig> = {
  [K in keyof T]: T[K][number] extends PermissionAction ? `${K & string}:${T[K][number]}` : never;
}[keyof T];

export const makePermissions = <T extends PermissionConfig>(
  config: T,
): Array<InferPermissions<T>> => {
  return Object.entries(config).flatMap(([domain, actions]) =>
    actions.map((action) => `${domain}:${action}` as InferPermissions<T>),
  );
};

const Permissions = makePermissions({
  members: ["read", "manage", "delete"],
} as const);

export const Permission = Schema.Literal(...Permissions).annotations({
  identifier: "Permission",
});
export type Permission = typeof Permission.Type;

const Members: FC<{ loaderData: Effect.Effect.Success<ReturnType<typeof membersLoaderData>>; actionData?: any }> = async ({
  loaderData,
  actionData
}) => {
  const c = useRequestContext<AppEnv>()
  return (
    <>
      <h1 className="text-lg font-medium lg:text-2xl">Manage Account</h1>
      <div className="card bg-base-100 w-full shadow-sm">
        <div className="card-body">
          <h2 className="card-title">Members</h2>
          <p className="font-medium">Add new account members, edit or revoke permissions and access, and resend verifications emails.</p>
          <div className="card-body">
            <form action={`/app/${c.var.account?.accountId}/members`} method="post">
              <h2 className="card-title">Invite members to join your account.</h2>
              <fieldset className="fieldset">
                <legend className="fieldset-legend">Emails</legend>
                <input type="text" name="emails" className="input w-full" placeholder="Separate multiple email addresses with commas" />
              </fieldset>
              <div className="card-actions justify-end">
                <button name="intent" value="invite" className="btn btn-primary">
                  Invite
                </button>
              </div>
            </form>
            <h2 className="card-title">Members</h2>
            <ul className="list bg-base-100 rounded-box shadow-md">
              <li className="p-4 pb-2 text-xs tracking-wide opacity-60">Most played songs this week</li>
              {loaderData.members.map((m) => (
                <li className="list-row">
                  <div className="list-col-grow">{m.user.email}</div>
                  <form action={`/app/${c.var.account?.accountId}/members`} method="post">
                    <input type="hidden" name="accountMemberId" value={m.accountMemberId} />{' '}
                    <button name="intent" value="revoke" className="btn btn-sm btn-outline">
                      Revoke
                    </button>
                  </form>
                </li>
              ))}
            </ul>
          </div>
        </div>
        <pre>{JSON.stringify({ loaderData, actionData }, null, 2)}</pre>
      </div>
    </>
  )
}

const membersLoaderData = (c: HonoContext<AppEnv>) =>
  Effect.fromNullable(c.var.account).pipe(
    Effect.flatMap((account) => IdentityMgr.getAccountMembers({ accountId: account.accountId })),
    Effect.map((members) => ({ members }))
  )

const membersPost = handler((c) =>
  Effect.gen(function* () {
    const MembersFormDataSchema = FormDataSchema(
      Schema.Union(
        Schema.Struct({
          intent: Schema.Literal('invite'),
          emails: Schema.transform(Schema.compose(Schema.NonEmptyString, Schema.split(',')), Schema.Array(Schema.String), {
            strict: false,
            decode: (emails) => [...new Set(emails.map((email) => email.trim()))],
            encode: (emails) => emails
          })
        }),
        Schema.Struct({
          intent: Schema.Literal('revoke'),
          accountMemberId: Schema.NumberFromString
        })
      )
    )
    const formData = yield* Effect.tryPromise(() => c.req.formData()).pipe(Effect.flatMap(Schema.decode(MembersFormDataSchema)))
    let actionData = {}
    switch (formData.intent) {
      case 'invite':
        actionData = {
          formData,
          invite: yield* IdentityMgr.invite({
            emails: formData.emails,
            ...(yield* Effect.fromNullable(c.var.account).pipe(
              Effect.map((account) => ({ accountId: account.accountId, accountEmail: account.user.email }))
            ))
          })
        }
        break
      case 'revoke':
        yield* IdentityMgr.revokeAccountMembership({ accountMemberId: formData.accountMemberId })
        actionData = {
          message: `Account membership revoked: accountMemberId: ${formData.accountMemberId}`,
          formData
        }
        break
      default:
        return yield* Effect.fail(new Error('Invalid intent'))
    }
    const loaderData = yield* membersLoaderData(c)
    return c.render(<Members loaderData={loaderData} actionData={actionData} />)
  })
)

const Billing: FC<{ loaderData: Effect.Effect.Success<ReturnType<typeof billingLoaderData>> }> = async ({ loaderData }) => {
  const c = useRequestContext<AppEnv>()
  return (
    <>
      <h1 className="text-lg font-medium lg:text-2xl">Billing</h1>
      <div className="card bg-base-100 w-96 shadow-sm">
        <div className="card-body">
          <h2 className="card-title">Account Subscription</h2>
          <p className="font-medium">Current Plan: {loaderData.account.planName || 'Free'}</p>
          <div className="card-actions justify-end">
            <form action={`/app/${c.var.account?.accountId}/billing`} method="post">
              <button className="btn btn-outline">Manage Subscription</button>
            </form>
          </div>
        </div>
      </div>
      <pre>{JSON.stringify({ loaderData }, null, 2)}</pre>
    </>
  )
}

const billingLoaderData = (c: HonoContext<AppEnv>) =>
  Effect.fromNullable(c.var.sessionData.sessionUser).pipe(
    Effect.flatMap((user) => IdentityMgr.getAccountForUser(user)),
    Effect.map((account) => ({ account, sessionData: c.var.sessionData }))
  )

const billingPost = handler((c) =>
  Effect.gen(function* () {
    const account = yield* Effect.fromNullable(c.var.sessionData.sessionUser).pipe(
      Effect.flatMap((user) => IdentityMgr.getAccountForUser(user))
    )
    if (!account.stripeCustomerId || !account.stripeProductId) {
      return c.redirect('/pricing')
    }
    return yield* Stripe.createBillingPortalSession({
      customer: account.stripeCustomerId,
      return_url: `${new URL(c.req.url).origin}/app/${c.var.account?.accountId}/billing`
    }).pipe(Effect.map((session) => c.redirect(session.url)))
  })
)

const Admin: FC<{ actionData?: any }> = async ({ actionData }) => {
  return (
    <div className="flex flex-col gap-2 p-6">
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
          <button name="intent" value="customers" className="btn btn-outline">
            Customers
          </button>
        </form>
        <form action="/admin" method="post">
          <button name="intent" value="seed" className="btn btn-outline">
            Seed
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
          intent: Schema.Literal('effect', 'effect_1', 'customers', 'seed')
        }),
        Schema.Struct({
          intent: Schema.Literal('sync_stripe_data', 'customer_subscription'),
          customerId: Schema.NonEmptyString
        })
      )
    )
    const formData = yield* Effect.tryPromise(() => c.req.formData()).pipe(Effect.flatMap(Schema.decode(AdminFormDataSchema)))
    let actionData = {}
    switch (formData.intent) {
      case 'effect':
        yield* Q.Producer.send({
          type: 'email',
          to: 'motio1@mail.com',
          from: 'motio@mail.com',
          subject: 'this is subject Q.Producer',
          html: 'test',
          text: 'this is body'
        })
        actionData = { message: 'Message sent' }
        break
      case 'effect_1':
        yield* Effect.log({ user_id: 123, user_email: 'a@example.com', message: 'Effect: v0.5' })
        actionData = { message: 'Effect 1' }
        break
      case 'customers':
        actionData = { customers: yield* IdentityMgr.getCustomers() }
        break
      case 'seed':
        yield* Stripe.seed()
        actionData = { message: 'Seeded' }
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
      default:
        throw new Error('Invalid intent')
    }
    return c.render(<Admin actionData={{ intent: formData.intent, ...actionData }} />)
  })
)

const seedGet = handler((c) => Stripe.seed().pipe(Effect.map(() => c.redirect('/'))))
