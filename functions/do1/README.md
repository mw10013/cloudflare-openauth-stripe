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
DoDurableObject[2025-03-26T21:14:13.372Z]: constructor: initialized: false: begin

DoDurableObject[2025-03-26T21:14:13.373Z]: constructor: false: end
DoDurableObject[2025-03-26T21:14:13.373Z]: ping: initialized: false

DoDurableObject[2025-03-26T21:14:13.374Z]: constructor: blockConcurrencyWhile: initialized: false: begin

DoDurableObject[2025-03-26T21:14:13.374Z]: constructor: blockConcurrencyWhile: initialized: true: end

DoDurableObject[2025-03-26T21:14:13.378Z]: alarm: initialized: true isRetry: false retryCount: 0

DoDurableObject[2025-03-26T21:14:15.795Z]: alarm: initialized: true isRetry: true retryCount: 1

DoDurableObject[2025-03-26T21:14:20.218Z]: alarm: initialized: true isRetry: true retryCount: 2

DoDurableObject[2025-03-26T21:14:28.852Z]: alarm: initialized: true isRetry: true retryCount: 3

DoDurableObject[2025-03-26T21:14:45.880Z]: constructor: initialized: false: begin

DoDurableObject[2025-03-26T21:14:45.880Z]: constructor: false: end
DoDurableObject[2025-03-26T21:14:45.880Z]: alarm: initialized: false isRetry: true retryCount: 4

DoDurableObject[2025-03-26T21:14:45.881Z]: constructor: blockConcurrencyWhile: initialized: false: begin
DoDurableObject[2025-03-26T21:14:45.881Z]: constructor: blockConcurrencyWhile: initialized: true: end

DoDurableObject[2025-03-26T21:15:23.867Z]: constructor: initialized: false: begin

DoDurableObject[2025-03-26T21:15:23.868Z]: constructor: false: end
DoDurableObject[2025-03-26T21:15:23.868Z]: alarm: initialized: false isRetry: true retryCount: 5

DoDurableObject[2025-03-26T21:15:23.868Z]: constructor: blockConcurrencyWhile: initialized: false: begin
DoDurableObject[2025-03-26T21:15:23.868Z]: constructor: blockConcurrencyWhile: initialized: true: end

DoDurableObject[2025-03-26T21:16:41.551Z]: constructor: initialized: false: begin

DoDurableObject[2025-03-26T21:16:41.551Z]: constructor: false: end
DoDurableObject[2025-03-26T21:16:41.552Z]: alarm: initialized: false isRetry: true retryCount: 6

DoDurableObject[2025-03-26T21:16:41.552Z]: constructor: blockConcurrencyWhile: initialized: false: begin
DoDurableObject[2025-03-26T21:16:41.552Z]: constructor: blockConcurrencyWhile: initialized: true: end
```

## Production Log

```
DoDurableObject.ping - Ok @ 3/26/2025, 5:30:56 PM
  (log) DoDurableObject[2025-03-26T21:30:56.679Z]: constructor: initialized: false: begin
  (log) DoDurableObject[2025-03-26T21:30:56.679Z]: constructor: false: end
  (log) DoDurableObject[2025-03-26T21:30:56.679Z]: constructor: blockConcurrencyWhile: initialized: false: begin
  (log) DoDurableObject[2025-03-26T21:30:56.679Z]: constructor: blockConcurrencyWhile: initialized: true: end
  (log) DoDurableObject[2025-03-26T21:30:56.679Z]: ping: initialized: true
Alarm @ 3/26/2025, 5:30:56 PM - Exception Thrown
  (log) DoDurableObject[2025-03-26T21:30:56.704Z]: alarm: initialized: true isRetry: false retryCount: 0
✘ [ERROR]   Error: DoDurableObject[2025-03-26T21:30:56.704Z]: alarm error: initialized: true isRetry: false retryCount: 0


Alarm @ 3/26/2025, 5:30:56 PM - Exception Thrown
  (log) DoDurableObject[2025-03-26T21:30:59.139Z]: alarm: initialized: true isRetry: true retryCount: 1
✘ [ERROR]   Error: DoDurableObject[2025-03-26T21:30:59.139Z]: alarm error: initialized: true isRetry: true retryCount: 1


Alarm @ 3/26/2025, 5:30:56 PM - Exception Thrown
  (log) DoDurableObject[2025-03-26T21:31:03.302Z]: alarm: initialized: true isRetry: true retryCount: 2
✘ [ERROR]   Error: DoDurableObject[2025-03-26T21:31:03.302Z]: alarm error: initialized: true isRetry: true retryCount: 2


Alarm @ 3/26/2025, 5:30:56 PM - Exception Thrown
  (log) DoDurableObject[2025-03-26T21:31:11.787Z]: alarm: initialized: true isRetry: true retryCount: 3
✘ [ERROR]   Error: DoDurableObject[2025-03-26T21:31:11.787Z]: alarm error: initialized: true isRetry: true retryCount: 3


Alarm @ 3/26/2025, 5:30:56 PM - Exception Thrown
  (log) DoDurableObject[2025-03-26T21:31:31.396Z]: constructor: initialized: false: begin
  (log) DoDurableObject[2025-03-26T21:31:31.396Z]: constructor: false: end
  (log) DoDurableObject[2025-03-26T21:31:31.396Z]: constructor: blockConcurrencyWhile: initialized: false: begin
  (log) DoDurableObject[2025-03-26T21:31:31.396Z]: constructor: blockConcurrencyWhile: initialized: true: end
  (log) DoDurableObject[2025-03-26T21:31:31.396Z]: alarm: initialized: true isRetry: true retryCount: 4
✘ [ERROR]   Error: DoDurableObject[2025-03-26T21:31:31.396Z]: alarm error: initialized: true isRetry: true retryCount: 4


Alarm @ 3/26/2025, 5:30:56 PM - Exception Thrown
  (log) DoDurableObject[2025-03-26T21:32:06.334Z]: constructor: initialized: false: begin
  (log) DoDurableObject[2025-03-26T21:32:06.334Z]: constructor: false: end
  (log) DoDurableObject[2025-03-26T21:32:06.334Z]: constructor: blockConcurrencyWhile: initialized: false: begin
  (log) DoDurableObject[2025-03-26T21:32:06.334Z]: constructor: blockConcurrencyWhile: initialized: true: end
  (log) DoDurableObject[2025-03-26T21:32:06.334Z]: alarm: initialized: true isRetry: true retryCount: 5
✘ [ERROR]   Error: DoDurableObject[2025-03-26T21:32:06.334Z]: alarm error: initialized: true isRetry: true retryCount: 5


Alarm @ 3/26/2025, 5:30:56 PM - Exception Thrown
  (log) DoDurableObject[2025-03-26T21:33:18.878Z]: constructor: initialized: false: begin
  (log) DoDurableObject[2025-03-26T21:33:18.878Z]: constructor: false: end
  (log) DoDurableObject[2025-03-26T21:33:18.878Z]: constructor: blockConcurrencyWhile: initialized: false: begin
  (log) DoDurableObject[2025-03-26T21:33:18.878Z]: constructor: blockConcurrencyWhile: initialized: true: end
  (log) DoDurableObject[2025-03-26T21:33:18.878Z]: alarm: initialized: true isRetry: true retryCount: 6
✘ [ERROR]   Error: DoDurableObject[2025-03-26T21:33:18.878Z]: alarm error: initialized: true isRetry: true retryCount: 6
```
