import { defineConfig } from 'vite'
import { cloudflare } from '@cloudflare/vite-plugin'

export default defineConfig(({ mode }) => {
  if (mode === 'client') {
    return {
      build: {
        assetsDir: 'client/static',
        outDir: 'dist/client',
        rollupOptions: {
          input: ['./src/client.tsx'],
          output: {
            entryFileNames: 'static/client.js',
            chunkFileNames: 'static/assets/[name]-[hash].js',
            assetFileNames: 'static/assets/[name].[ext]'
          }
        }
      }
    }
  } else {
    return {
      plugins: [cloudflare()]
    }
  }
})
