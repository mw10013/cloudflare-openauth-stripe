import type { FC, PropsWithChildren } from 'hono/jsx'
import { Hono } from 'hono'

const app = new Hono<{
	Bindings: Env
}>()

const Layout: FC<PropsWithChildren<{}>> = (props) => {
	return (
		<html>
			<body>{props.children}</body>
		</html>
	)
}

const Top: FC<{ messages: string[] }> = (props: { messages: string[] }) => {
	return (
		<Layout>
			<h1>Hello Hono!</h1>
			<ul>
				{props.messages.map((message) => {
					return <li>{message}</li>
				})}
			</ul>
		</Layout>
	)
}

app.get('/', (c) => {
	const messages = ['Good Morning', 'Good Evening', 'Good Night', c.env.ENVIRONMENT]
	return c.html(<Top messages={messages} />)
})

// app.get('/', (c) => {
// 	return c.text(`Hello vite-plugin-cloudflare [${c.env.ENVIRONMENT}]`)
// })

export default app
