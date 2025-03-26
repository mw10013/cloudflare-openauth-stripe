# do1

- https://do1-production.devxo.workers.dev/

## Local Dev

- pnpm i
- pnpm dev

## Deploy

- CLOUDFLARE_ENV=production pnpm -F do1 build
- pnpm -F do1 exec wrangler deploy
- Workers & Pages Settings: do1-production
  - Git repository: connect to git repo
  - Build configuration
    - Build command: CLOUDFLARE_ENV=production pnpm -F do1 build
    - Deploy command: pnpm -F do1 exec wrangler deploy
  - Build watch paths
    - Include paths: functions/do1/\*

## Local Dev Log

```
DoDurableObject[2025-03-26T19:51:33.488Z]: constructor: initialized: false: begin

DoDurableObject[2025-03-26T19:51:33.488Z]: constructor: false: end
DoDurableObject[2025-03-26T19:51:33.488Z]: ping: initialized: false

DoDurableObject[2025-03-26T19:51:33.488Z]: constructor: blockConcurrencyWhile: initialized: false: begin
DoDurableObject[2025-03-26T19:51:33.488Z]: constructor: blockConcurrencyWhile: initialized: true: end

DoDurableObject[2025-03-26T19:51:33.490Z]: ping: initialized: true
```

## Production Log

```
DoDurableObject.ping - Ok @ 3/26/2025, 3:57:39 PM
  (log) DoDurableObject[2025-03-26T19:57:39.497Z]: constructor: initialized: false: begin
  (log) DoDurableObject[2025-03-26T19:57:39.497Z]: constructor: false: end
  (log) DoDurableObject[2025-03-26T19:57:39.497Z]: constructor: blockConcurrencyWhile: initialized: false: begin
  (log) DoDurableObject[2025-03-26T19:57:39.497Z]: constructor: blockConcurrencyWhile: initialized: true: end
  (log) DoDurableObject[2025-03-26T19:57:39.497Z]: ping: initialized: true
DoDurableObject.ping - Ok @ 3/26/2025, 3:57:39 PM
  (log) DoDurableObject[2025-03-26T19:57:39.509Z]: ping: initialized: true
```
