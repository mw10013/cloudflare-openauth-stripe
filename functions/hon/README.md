- https://github.com/cloudflare/workers-sdk/tree/main/packages/vite-plugin-cloudflare
- https://hono.dev/docs/guides/jsx#settings
- https://raw.githubusercontent.com/toolbeam/openauth/refs/heads/master/packages/openauth/src/ui/form.tsx
- https://esbuild.github.io/content-types/#jsx
- https://esbuild.github.io/api/#jsx

- https://github.com/tailwindlabs/tailwindcss/discussions/16937

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

## Tailwind

- The tailwind vite plugin is used during development and works with vite to keep src/tailwind.css up to date in memory.
- The tailwind cli is used during build to create dist/client/tailwind.css.

```tsx
<link href={import.meta.env.MODE === 'development' ? '/src/tailwind.css' : '/tailwind.css'} rel="stylesheet"></link>
```
