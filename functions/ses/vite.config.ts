import { cloudflare } from '@cloudflare/vite-plugin'
import { defineConfig } from 'vite'

export default defineConfig({
	// https://vite.dev/config/shared-options.html#resolve-alias
	// https://github.com/rollup/plugins/tree/master/packages/alias#entries
	resolve: {
		alias: {
			// fs: '/src/fs-polyfill'
			// fs: path.resolve(__dirname, 'src/fs-polyfill.ts')
		}
	},
	plugins: [cloudflare()]
})
