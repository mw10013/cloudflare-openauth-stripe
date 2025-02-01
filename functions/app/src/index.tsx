import type { FC, PropsWithChildren } from 'hono/jsx'
import { Client, createClient } from '@openauthjs/openauth/client'
import { createId } from '@paralleldrive/cuid2'
import { subjects } from '@repo/shared/subjects'
import { Context, Hono } from 'hono'
import { deleteCookie, getCookie, getSignedCookie, setSignedCookie } from 'hono/cookie'
import { jsxRenderer, useRequestContext } from 'hono/jsx-renderer'
import Stripe from 'stripe'

type HonoEnv = {
	Bindings: Env
	Variables: {
		sessionData: SessionData
		stripe: Stripe
		client: Client
		redirectUri: string
	}
}

type SessionData = {
	email?: string
	foo?: string
}

export default {
	async fetch(request, env, ctx): Promise<Response> {
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
			console.log({ log: 'session', sessionId, sessionData, cookieSessionId })

			c.set('stripe', new Stripe(c.env.STRIPE_SECRET_KEY))
			const client = createClient({
				clientID: 'client',
				issuer: c.env.OPENAUTH_ISSUER,
				fetch: (input, init) => c.env.WORKER.fetch(input, init)
			})
			c.set('client', client)
			c.set('redirectUri', new URL(c.req.url).origin + '/callback')
			await next()
			if (c.var.sessionData !== sessionData) {
				console.log({ log: 'sessionData changed', sessionData, sessionDataChanged: c.var.sessionData })
				await env.KV.put(sessionId, JSON.stringify(c.var.sessionData), { expirationTtl: 60 * 5 })
			}
		})
		app.use('/protected/*', async (c, next) => {
			if (!c.var.sessionData.email) {
				return c.redirect('/authorize')
			}
			await next()
		})
		app.use(
			'/*',
			jsxRenderer(({ children }) => <Layout>{children}</Layout>)
		)

		app.get('/', (c) => c.render(<Home />))
		app.get('/public', (c) => c.render(<Public />))
		app.post('/public', async (c) => {
			const formData = await c.req.formData()

			const value = formData.get('value')
			if (typeof value === 'string' && value) {
				c.set('sessionData', { ...c.var.sessionData, foo: value })
			}
			return c.redirect('/public')
		})

		app.get('/protected', (c) => c.render('Protected'))
		app.get('/authorize', async (c) => {
			if (c.var.sessionData.email) {
				return c.redirect('/')
			}
			const { url } = await c.var.client.authorize(c.var.redirectUri, 'code')
			return c.redirect(url)
		})
		app.post('/signout', (c) => {
			deleteCookie(c, 'sessionId')
			// TODO: Delete kv
			return c.redirect('/')
		})
		app.get('/callback', async (c) => {
			try {
				const code = c.req.query('code')
				if (!code) throw new Error('Missing code')
				const exchanged = await c.var.client.exchange(code, c.var.redirectUri)
				if (exchanged.err) throw exchanged.err
				const verified = await c.var.client.verify(subjects, exchanged.tokens.access, {
					refresh: exchanged.tokens.refresh,
					fetch: (input, init) => c.env.WORKER.fetch(input, init)
				})
				if (verified.err) throw verified.err
				c.set('sessionData', { ...c.var.sessionData, email: verified.subject.properties.email })
				return c.redirect('/')
			} catch (e: any) {
				return new Response(e.toString())
			}
		})
		return app.fetch(request, env, ctx)
	}
} satisfies ExportedHandler<Env>

const Layout: FC<PropsWithChildren<{}>> = ({ children }) => {
	const ctx = useRequestContext<HonoEnv>()
	const ListItems = () => (
		<>
			<li>
				<a href="/public">Public</a>
			</li>
			<li>
				<a href="/protected">Protected</a>
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
					<div className="navbar-end">
						{ctx.var.sessionData.email ? (
							<form action="/signout" method="post">
								<button type="submit" className="btn">
									Sign Out
								</button>
							</form>
						) : (
							<a href="/authorize" className="btn">
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
			<CookiesCard />
			<div>
				<pre>{JSON.stringify({ sessionData: c.var.sessionData }, null, 2)}</pre>
			</div>
		</div>
	)
}

const Public: FC = async () => {
	const c = useRequestContext<HonoEnv>()
	const stripe = c.var.stripe
	const products = await stripe.products.list({ expand: ['data.price'] })
	const prices = await stripe.prices.list({ lookup_keys: ['basic', 'pro'], expand: ['data.product'] })
	return (
		<div>
			Public
			<div className="card bg-base-100 w-96 shadow-sm">
				<form action="/public" method="post">
					<div className="card-body">
						<h2 className="card-title">Foo</h2>
						<fieldset className="fieldset">
							<legend className="fieldset-legend">Value</legend>
							<input type="text" name="value" className="input" />
						</fieldset>
						<div className="card-actions justify-end">
							<button type="submit" className="btn btn-primary">
								Set
							</button>
						</div>
					</div>
				</form>
			</div>
			<pre>{JSON.stringify({ sessionData: c.var.sessionData, prices, products }, null, 2)}</pre>
		</div>
	)
}

const CookiesCard: FC = () => {
	const c = useRequestContext<HonoEnv>()
	const cookies = getCookie(c)
	return (
		<div className="card bg-base-100 w-96 shadow-sm">
			<div className="card-body">
				<h2 className="card-title">Cookies</h2>
				<ul className="space-y-2 overflow-auto">
					{Object.entries(cookies).map(([key, value]) => {
						return (
							<li>
								{key}: {value}
							</li>
						)
					})}
				</ul>
			</div>
		</div>
	)
}

async function getTokenCookies(c: Context<HonoEnv>) {
	return {
		accessToken: await getSignedCookie(c, c.env.COOKIE_SECRET, 'accessToken'),
		refreshToken: await getSignedCookie(c, c.env.COOKIE_SECRET, 'refreshToken')
	}
}

async function setTokenCookies(c: Context<HonoEnv>, accessToken: string, refreshToken: string) {
	const options = {
		path: '/',
		secure: true,
		httpOnly: true,
		maxAge: 60 * 5,
		sameSite: 'Strict'
	} as const
	await setSignedCookie(c, 'accessToken', accessToken, c.env.COOKIE_SECRET, options)
	await setSignedCookie(c, 'refreshToken', refreshToken, c.env.COOKIE_SECRET, options)
}

function deleteTokenCookies(c: Context<HonoEnv>) {
	const options = {
		secure: true
	}
	deleteCookie(c, 'accessToken', options)
	deleteCookie(c, 'refreshToken', options)
}
