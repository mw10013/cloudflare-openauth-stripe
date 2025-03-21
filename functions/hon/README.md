# hon

## Local Dev

- pnpm i
- pnpm dev

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
