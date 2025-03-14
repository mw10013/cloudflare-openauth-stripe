# cloudflare-openauth-stripe-client

## Deploy

- CLOUDFLARE_ENV=production pnpm -F app build
- pnpm -F app exec wrangler deploy
- pnpm -F app exec wrangler secret put <SECRET> --env production
- Workers & Pages Settings: cloudflare-openauth-stripe-app-production
  - Git repository: connect to git repo
  - Build configuration
    - Build command: CLOUDFLARE_ENV=production pnpm -F app build
    - Deploy command: pnpm -F app exec wrangler deploy
  - Build watch paths
    - Include paths: functions/app/\*

## Tailwind

- The tailwind vite plugin is used during development and works with vite to keep src/tailwind.css up to date in memory.
- The tailwind cli is used during build to create dist/client/tailwind.css.

```tsx
<link href={import.meta.env.MODE === 'development' ? '/src/tailwind.css' : '/tailwind.css'} rel="stylesheet"></link>
```

