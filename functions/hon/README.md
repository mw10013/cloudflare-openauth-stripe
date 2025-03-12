- https://github.com/cloudflare/workers-sdk/tree/main/packages/vite-plugin-cloudflare
- https://hono.dev/docs/guides/jsx#settings
- https://raw.githubusercontent.com/toolbeam/openauth/refs/heads/master/packages/openauth/src/ui/form.tsx
- https://esbuild.github.io/content-types/#jsx
- https://esbuild.github.io/api/#jsx

## Deploy

- CLOUDFLARE_ENV=production pnpm -F hon build
- pnpm -F hon exec wrangler deploy
- Workers & Pages Settings: hon-production
  - Git repository: connect to git repo
  - Build configuration
    - Build command: CLOUDFLARE_ENV=production pnpm -F hon build
    - Deploy command: pnpm -F hon exec wrangler deploy
  - Build watch paths
    - Include paths: functions/hon/\*
