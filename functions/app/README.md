# cloudflare-openauth-stripe-client

## Local Dev

- pnpm i
- cp functions/app/.dev.vars.example functions/app/.dev.vars
- pnpm -F app dev

## Deploy

- pnpm wrangler kv namespace create cloudflare-openauth-stripe-app-kv-production
- Update wrangler.jsonc production kv_namespaces
- pnpm -F app d1:reset:PRODUCTION
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

## D1

- pnpm -F app exec wrangler d1 migrations create d1-local <MIGRATION-NAME>

## Stripe

- Set API version in Stripe Workbench and confirm it matches version used by Stripe service.
- stripe trigger payment_intent.succeeded
- stripe trigger customer.subscription.updated

- https://docs.stripe.com/development
- https://docs.stripe.com/workbench/guides#view-api-versions

- Prevent customer creation race conditions: https://github.com/stripe/stripe-node/issues/476#issuecomment-402541143
- https://docs.stripe.com/api/idempotent_requests

- https://github.com/stripe/stripe-node
- https://docs.stripe.com/api?lang=node
- https://github.com/nextjs/saas-starter
- https://www.youtube.com/watch?v=Wdyndb17K58&t=173s

```
Double subscriptions are not an issue when you create a customer first, then create a payment intent for that customer and then load your checkout forms using that intent. It won't matter whether the user goes back, forward, refreshes or whatever. As long as the payment intent doesn't change, it won't be a double subscription. Also a lot of projects actually do allow multiple subscriptions, so they can't just make such a critical option on by default (limit to 1). On the price IDs between environments - use price lookup keys instead.
```

### Disable Cash App Pay

- https://github.com/t3dotgg/stripe-recommendations?tab=readme-ov-file#disable-cash-app-pay
- Settings | Payments | Payment methods

### Limit Customers to One Subscription

- https://github.com/t3dotgg/stripe-recommendations?tab=readme-ov-file#enable-limit-customers-to-one-subscription
- https://docs.stripe.com/payments/checkout/limit-subscriptions
- https://billing.stripe.com/p/login/test_3cs9EBfMn4Qn7Ze144

### Webhook

- stripe listen --load-from-webhooks-api --forward-to localhost:8787
  - Must have stripe webhook endpoint url with path /api/stripe/webhook
  - STRIPE_WEBHOOK_SECRET must align with listen secret
- stripe listen --forward-to localhost:8787/api/stripe/webhook
- stripe listen --print-secret

### Billing Portal

- Settings | Billing | Customer portal
- https://docs.stripe.com/customer-management/activate-no-code-customer-portal
- https://billing.stripe.com/p/login/test_9AQeYV6bN1Eb6VafYZ

### Testing Payments

To test Stripe payments, use the following test card details:

- Card Number: `4242 4242 4242 4242`
- Expiration: Any future date
- CVC: Any 3-digit number
