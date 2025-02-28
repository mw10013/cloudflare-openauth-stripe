import type { Stripe as StripeTypeNs } from 'stripe'
import { Effect, Layer } from 'effect'
import { Stripe as StripeClass } from 'stripe'
import { Repository } from './Repository'

type T = Pick<
	{
		[K in keyof StripeTypeNs.BillingPortal.SessionCreateParams]-?: NonNullable<StripeTypeNs.BillingPortal.SessionCreateParams[K]>
	},
	'customer' | 'return_url'
>

export const make = ({ STRIPE_SECRET_KEY }: { STRIPE_SECRET_KEY: string }) =>
	Effect.gen(function* () {
		const stripe = new StripeClass(STRIPE_SECRET_KEY)
		const repository = yield* Repository // Outside of functions so that Repository does not show up in R
		return {
			getPrices: () =>
				Effect.tryPromise(() => stripe.prices.list({ lookup_keys: ['base', 'plus'], expand: ['data.product'] })).pipe(
					Effect.map((priceList) =>
						priceList.data.sort((a, b) => (a.lookup_key && b.lookup_key ? a.lookup_key.localeCompare(b.lookup_key) : 0))
					)
				),
			createBillingPortalSession: (
				props: Pick<
					{
						[K in keyof StripeTypeNs.BillingPortal.SessionCreateParams]-?: NonNullable<StripeTypeNs.BillingPortal.SessionCreateParams[K]>
					},
					'customer' | 'return_url'
				>
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
				).pipe(Effect.map((result) => (result.data.length === 0 ? null : result.data[0]))),
			// https://github.com/t3dotgg/stripe-recommendations?tab=readme-ov-file#checkout-flow
			ensureStripeCustomerId: ({ userId, email }: { userId: number; email: string }) =>
				Effect.gen(function* () {
					const team = yield* repository.getRequiredTeamForUser({ userId })
					if (team.stripeCustomerId)
						return {
							stripeCustomerId: team.stripeCustomerId,
							stripeSubscriptionId: team.stripeSubscriptionId
						}
					const customer = yield* Effect.tryPromise(() =>
						stripe.customers.create({
							email,
							metadata: { userId: userId.toString() } // DO NOT FORGET THIS
						})
					)
					yield* repository.updateStripeCustomerId({ teamId: team.teamId, stripeCustomerId: customer.id })
					return {
						stripeCustomerId: customer.id,
						stripeSubscriptionId: null
					}
				}),
			createCheckoutSession: ({
				customer,
				client_reference_id,
				success_url,
				cancel_url,
				price
			}: Pick<
				{
					[K in keyof StripeTypeNs.Checkout.SessionCreateParams]-?: NonNullable<StripeTypeNs.Checkout.SessionCreateParams[K]>
				},
				'customer' | 'client_reference_id' | 'success_url' | 'cancel_url'
			> & { price: string }) =>
				Effect.tryPromise(() =>
					stripe.checkout.sessions.create({
						payment_method_types: ['card'],
						line_items: [
							{
								price,
								quantity: 1
							}
						],
						mode: 'subscription',
						success_url,
						cancel_url,
						customer,
						client_reference_id,
						allow_promotion_codes: true,
						subscription_data: {
							trial_period_days: 14
						}
					})
				)
		}
	})

export class Stripe extends Effect.Tag('Stripe')<Stripe, Effect.Effect.Success<ReturnType<typeof make>>>() {}

export const layer = ({ STRIPE_SECRET_KEY }: { STRIPE_SECRET_KEY: string }) => Layer.effect(Stripe, make({ STRIPE_SECRET_KEY }))
