import type { FC, PropsWithChildren } from 'hono/jsx'
import { Hono } from 'hono'

const app = new Hono<{
	Bindings: Env
}>()

const Layout: FC<PropsWithChildren<{}>> = (props) => {
	return (
		<html>
			<head>
				<meta charset="UTF-8" />
				<meta name="viewport" content="width=device-width, initial-scale=1.0" />
				<link href={import.meta.env.MODE === 'development' ? '/src/tailwind.css' : '/tailwind.css'} rel="stylesheet"></link>
				<title>Hon App</title>
			</head>
			<body className="p-6">{props.children}</body>
		</html>
	)
}

app.get('/', (c) =>
	c.html(
		<Layout>
			<h1 className="text-3xl font-bold text-blue-800">Hon App</h1>
			<p>ENVIRONMENT: {c.env.ENVIRONMENT}</p>
			<p>MODE: {import.meta.env.MODE}</p>
		</Layout>
	)
)
app.get('/foo', (c) =>
	c.html(
		<Layout>
			<h1 className="text-purple-500">FOO</h1>
		</Layout>
	)
)

export default app
