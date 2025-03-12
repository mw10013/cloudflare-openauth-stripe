import { Hono } from 'hono'

type HonoEnv = {
	Bindings: Env
}

const app = new Hono<HonoEnv>()

app.get('/', (c) => {
	return c.text(`Hello vite-plugin-cloudflare [${c.env.ENVIRONMENT}]`)
})

export default app
