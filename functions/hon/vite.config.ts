import { cloudflare } from '@cloudflare/vite-plugin'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'

export default defineConfig({
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
