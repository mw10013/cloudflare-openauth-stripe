# cloudflare-openauth-stripe

## Local Dev

- cp functions/app/.dev.vars.example functions/app/.dev.vars
- pnpm -F worker dev
- pnpm -F app tailwind
- pnpm -F app dev

## Deploy (production)

- pnpm -F worker exec wrangler kv namespace create kv-production
- Update worker/wrangler.jsonc with production kv id
- pnpm -F worker exec wrangler deploy --env production
- Workers & Pages Settings: cloudflare-openauth-stripe-worker-production
  - Git repository: connect to git repo
  - Build configuration
    - Deploy command: pnpm -F worker exec wrangler deploy --env production
  - Build watch paths
    - Include paths: functions/worker/* functions/shared/*
- Update app/wrangler.jsonc OPENAUTH_ISSUER
- pnpm -F app build
- pnpm -F app exec wrangler deploy --env production
- pnpm -F app exec wrangler secret put COOKIE_SECRET --env production
- Workers & Pages Settings: cloudflare-openauth-stripe-app-production
  - Git repository: connect to git repo
  - Build configuration
    - Build command: pnpm -F app build
    - Deploy command: pnpm -F app exec wrangler deploy --env production
  - Build watch paths
    - Include paths: functions/app/* functions/shared/*
- pnpm -F worker exec wrangler tail cloudflare-openauth-stripe-worker-production

## Deploy (staging)

- Steps of Deploy (production) substituting staging for production
- Workers & Pages Settings: cloudflare-openauth-stripe-worker-staging/cloudflare-openauth-stripe-app-production
  - Branch control: staging

## D1

- pnpm -F app exec wrangler d1 migrations create d1-local <MIGRATION-NAME>

## Node version for build

- See .node-version in root.
- https://github.com/shadowspawn/node-version-usage

## Prettier

- pnpm add -D --save-exact prettier --workspace-root
- https://prettier.io/docs/en/ignore
  - Prettier will also follow rules specified in the ".gitignore" file if it exists in the same directory from which it is run.
- pnpm prettier . --check
