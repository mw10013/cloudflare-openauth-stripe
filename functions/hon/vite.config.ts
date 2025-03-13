// vite.config.ts

import { cloudflare } from '@cloudflare/vite-plugin'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'

// export default defineConfig(({ isSsrBuild }) => ({
// 	build: {
// 		// https://github.com/remix-run/react-router-templates/blob/main/cloudflare/vite.config.ts
// 		rollupOptions: isSsrBuild
// 			? {
// 					input: './src/index.tsx' // Specify your entry point for SSR
// 				}
// 			: undefined
// 	},
// 	plugins: [tailwindcss(), cloudflare()]
// }))

export default defineConfig({
	plugins: [tailwindcss(), cloudflare()]
})
