# cloudflare-openauth-stripe

## Local Dev

- cp functions/app/.dev.vars.example functions/app/.dev.vars
- pnpm -F worker dev
- pnpm -F app tailwind
- pnpm -F app dev

## Deploy (production)

- pnpm -F app exec wrangler d1 create cloudflare-openauth-stripe-d1-production
- Update app/wrangler.jsonc and worker/wrangler.jsonc with production d1 id
- pnpm -F app d1:migrate:apply:PRODUCTION
- pnpm -F app exec wrangler kv namespace create kv-production
- Update app/wrangler.jsonc and worker/wrangler.jsonc with production kv id
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
- pnpm -F app exec wrangler secret put STRIPE_SECRET_KEY --env production
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

## Stripe

- limit 1 subscription  
- https://github.com/stripe/stripe-node
- https://docs.stripe.com/api?lang=node
- https://github.com/nextjs/saas-starter
- https://www.youtube.com/watch?v=Wdyndb17K58&t=173s

```
Double subscriptions are not an issue when you create a customer first, then create a payment intent for that customer and then load your checkout forms using that intent. It won't matter whether the user goes back, forward, refreshes or whatever. As long as the payment intent doesn't change, it won't be a double subscription. Also a lot of projects actually do allow multiple subscriptions, so they can't just make such a critical option on by default (limit to 1). On the price IDs between environments - use price lookup keys instead.
```
