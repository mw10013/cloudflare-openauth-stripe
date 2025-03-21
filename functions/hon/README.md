# hon

## Local Dev

- pnpm i
- pnpm dev

## Deploy

- CLOUDFLARE_ENV=production pnpm build
- pnpm wrangler deploy
- Workers & Pages Settings: hon-production
  - Git repository: connect to git repo
  - Build configuration
    - Build command: CLOUDFLARE_ENV=production pnpm build
    - Deploy command: pnpm wrangler deploy

