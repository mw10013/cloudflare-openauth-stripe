# do

## Local Dev

- pnpm i
- pnpm dev

## Deploy

- CLOUDFLARE_ENV=production pnpm -F do build
- pnpm -F do exec wrangler deploy
- Workers & Pages Settings: do-production
  - Git repository: connect to git repo
  - Build configuration
    - Build command: CLOUDFLARE_ENV=production pnpm -F do build
    - Deploy command: pnpm -F do exec wrangler deploy
  - Build watch paths
    - Include paths: functions/do/\*
