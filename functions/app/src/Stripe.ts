import type { Stripe as StripeTypeNs } from 'stripe'
import { Effect, Layer } from 'effect'
import { Stripe as StripeClass } from 'stripe'
import { Repository } from './Repository'

export const make = ({ STRIPE_SECRET_KEY }: { STRIPE_SECRET_KEY: string }) =>
	Effect.gen(function* () {
		const stripe = new StripeClass(STRIPE_SECRET_KEY)
		const repository = yield* Repository // Outside of functions so that Repository does not show up in R
		return {
			getBillingPortalConfigurations: () => Effect.tryPromise(() => stripe.billingPortal.configurations.list()),
			// createBillingPortalSession: ()
			getSubscriptionForCustomer: (customerId: NonNullable<StripeTypeNs.SubscriptionListParams['customer']>) =>
				Effect.tryPromise(() =>
					stripe.subscriptions.list({ customer: customerId, limit: 1, status: 'all', expand: ['data.items', 'data.items.data.price'] })
				).pipe(Effect.map((result) => result.data.length === 0 ? null : result.data[0])),
		}
	})

export class Stripe extends Effect.Tag('Stripe')<Stripe, Effect.Effect.Success<ReturnType<typeof make>>>() {}

export const layer = ({ STRIPE_SECRET_KEY }: { STRIPE_SECRET_KEY: string }) => Layer.effect(Stripe, make({ STRIPE_SECRET_KEY }))
