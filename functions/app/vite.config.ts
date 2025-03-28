import { cloudflare } from '@cloudflare/vite-plugin'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'

export default defineConfig({
	// resolve: {
	// 	alias: {
	// 		'./runtimeConfig': './runtimeConfig.browser'
	// 	}
	// },
	build: {
		rollupOptions: {
			input: './src/tailwind.css',
			output: {
				assetFileNames: '[name][extname]'
			}
		}
	},
	plugins: [tailwindcss(), cloudflare()]
})
