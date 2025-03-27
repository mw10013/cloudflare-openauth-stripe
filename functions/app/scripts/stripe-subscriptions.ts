import { Effect } from 'effect'
import Stripe from 'stripe'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
	apiVersion: '2025-02-24.acacia'
})

// const { data: subscriptions } = await stripe.subscriptions.list({ limit: 1 })
const { data: subscriptions } = await stripe.subscriptions.list({ limit: 10 })
console.log({ subscriptionCount: subscriptions.length })

const effects = subscriptions.map((subscription) =>
	Effect.gen(function* () {
		yield* Effect.tryPromise(() =>
			stripe.subscriptions.update(subscription.id, {
				metadata: {
					lastPing: new Date().toISOString()
				}
			})
		)
		yield* Effect.log(`customerId: ${subscription.customer}, subscriptionId: ${subscription.id}`)
	})
)

// await Effect.all(effects, { concurrency: 5 }).pipe(Effect.runPromise)
await Effect.all(effects.concat(effects, effects), { concurrency: 5 }).pipe(Effect.runPromise)
