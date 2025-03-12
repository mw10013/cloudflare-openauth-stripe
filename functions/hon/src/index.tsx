import type { FC, PropsWithChildren } from 'hono/jsx'
import { Hono } from 'hono'

// import tailwindStyles from './tailwind.css?url'

const app = new Hono<{
	Bindings: Env
}>()

const Layout: FC<PropsWithChildren<{}>> = (props) => {
	return (
		<html>
			<head>
				<meta charset="UTF-8" />
				<meta name="viewport" content="width=device-width, initial-scale=1.0" />
				{/* <link href={tailwindStyles} rel="stylesheet" /> */}
				<title>Hon App</title>
			</head>
			<body className="p-6">{props.children}</body>
		</html>
	)
}

const Top: FC<{ messages: string[] }> = (props: { messages: string[] }) => {
	return (
		<Layout>
			<h1 className="text-3xl font-bold underline">Hello tailwind!</h1>
			{/* <p>{tailwindStyles}</p> */}
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
