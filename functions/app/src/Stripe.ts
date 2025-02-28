import type { Stripe as StripeTypeNs } from 'stripe'
import { Effect, Layer } from 'effect'
import { Stripe as StripeClass } from 'stripe'
import { Repository } from './Repository'

type T = StripeTypeNs.BillingPortal.SessionCreateParams
type T1 = Pick<StripeTypeNs.BillingPortal.SessionCreateParams, 'customer' | 'return_url' | 'configuration'>

export const make = ({ STRIPE_SECRET_KEY }: { STRIPE_SECRET_KEY: string }) =>
	Effect.gen(function* () {
		const stripe = new StripeClass(STRIPE_SECRET_KEY)
		const repository = yield* Repository // Outside of functions so that Repository does not show up in R
		return {
			createBillingPortalSession: (
				props: NonNullable<Pick<StripeTypeNs.BillingPortal.SessionCreateParams, 'customer' | 'return_url'>>
			) =>
				Effect.tryPromise(() => stripe.billingPortal.configurations.list()).pipe(
					Effect.filterOrFail(
						(result) => result.data.length > 0,
						() => new Error('No billing portal configuration found')
					),
					Effect.map((result) => result.data[0]),
					Effect.flatMap((configuration) =>
						Effect.tryPromise(() =>
							stripe.billingPortal.sessions.create({
								...props,
								configuration: configuration.id
							})
						)
					)
				),
			getSubscriptionForCustomer: (customerId: NonNullable<StripeTypeNs.SubscriptionListParams['customer']>) =>
				Effect.tryPromise(() =>
					stripe.subscriptions.list({ customer: customerId, limit: 1, status: 'all', expand: ['data.items', 'data.items.data.price'] })
				).pipe(Effect.map((result) => (result.data.length === 0 ? null : result.data[0])))
		}
	})

export class Stripe extends Effect.Tag('Stripe')<Stripe, Effect.Effect.Success<ReturnType<typeof make>>>() {}

export const layer = ({ STRIPE_SECRET_KEY }: { STRIPE_SECRET_KEY: string }) => Layer.effect(Stripe, make({ STRIPE_SECRET_KEY }))
