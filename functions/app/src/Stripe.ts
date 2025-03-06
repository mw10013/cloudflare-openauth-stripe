import type { Stripe as StripeTypeNs } from 'stripe'
import { Config, Console, Effect, Layer, Option, Predicate, Redacted } from 'effect'
import { Stripe as StripeClass } from 'stripe'
import { Repository } from './Repository'

export const make = () =>
	Effect.gen(function* () {
		const stripeSecretKeyRedacted = yield* Config.redacted('STRIPE_SECRET_KEY')
		const stripe = new StripeClass(Redacted.value(stripeSecretKeyRedacted))
		const repository = yield* Repository // Outside of functions so that Repository does not show up in R
		const allowedEvents: StripeTypeNs.Event.Type[] = [
			'checkout.session.completed',
			'customer.subscription.created',
			'customer.subscription.updated',
			'customer.subscription.deleted',
			'customer.subscription.paused',
			'customer.subscription.resumed',
			'customer.subscription.pending_update_applied',
			'customer.subscription.pending_update_expired',
			'customer.subscription.trial_will_end',
			'invoice.paid',
			'invoice.payment_failed',
			'invoice.payment_action_required',
			'invoice.upcoming',
			'invoice.marked_uncollectible',
			'invoice.payment_succeeded',
			'payment_intent.succeeded',
			'payment_intent.payment_failed',
			'payment_intent.canceled'
		]
		const getSubscriptionForCustomer = (customerId: NonNullable<StripeTypeNs.SubscriptionListParams['customer']>) =>
			Effect.tryPromise(() =>
				stripe.subscriptions.list({ customer: customerId, limit: 1, status: 'all', expand: ['data.items', 'data.items.data.price'] })
			).pipe(Effect.map((result) => Option.fromNullable(result.data[0])))

		const syncStripData = (customerId: string) =>
			// We do not handle multiple subscriptions.
			getSubscriptionForCustomer(customerId).pipe(
				Effect.flatMap((subscriptionOption) =>
					Option.match(subscriptionOption, {
						onNone: () =>
							// Stripe test environment deletes stale subscriptions.
							repository.updateStripeSubscription({
								stripeCustomerId: customerId,
								stripeSubscriptionId: null,
								stripeProductId: null,
								planName: null,
								subscriptionStatus: null
							}),
						onSome: (subscription) => {
							const stripeProductId = subscription.items.data[0].price.product
							const planName = subscription.items.data[0].price.lookup_key
							return Predicate.isString(stripeProductId) && Predicate.isString(planName)
								? repository.updateStripeSubscription({
										stripeCustomerId: customerId,
										stripeSubscriptionId: subscription.id,
										stripeProductId,
										planName,
										subscriptionStatus: subscription.status
									})
								: Effect.fail(new Error('Invalid types: price product and lookup key must be strings'))
						}
					}).pipe(Effect.asVoid)
				)
			)
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
			getSubscriptionForCustomer,
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
				),
			finalizeCheckoutSession: (sessionId: string) =>
				Effect.tryPromise(() => stripe.checkout.sessions.retrieve(sessionId, { expand: ['customer'] })).pipe(
					Effect.flatMap((session) =>
						Option.fromNullable(session.customer).pipe(
							Option.filterMap((v) => (v !== null && typeof v !== 'string' ? Option.some(v) : Option.none()))
						)
					),
					Effect.flatMap((customer) => syncStripData(customer.id))
				),
			getCheckoutSession: (sessionId: string) =>
				Effect.tryPromise(() => stripe.checkout.sessions.retrieve(sessionId, { expand: ['customer'] })),
			syncStripData,
			processWebhook: (body: string, signature: string) =>
				Config.redacted('STRIPE_WEBHOOK_SECRET').pipe(
					Effect.flatMap((stripeWebhookSecretRedacted) =>
						Effect.tryPromise(() => stripe.webhooks.constructEventAsync(body, signature, Redacted.value(stripeWebhookSecretRedacted)))
					),
					Effect.map((event) => ({
						event,
						allowedOption: Option.liftPredicate<StripeTypeNs.Event>((event) => allowedEvents.includes(event.type))(event)
					})),
					Effect.flatMap(({ event, allowedOption }) =>
						Option.match(allowedOption, {
							onNone: () => Console.log(`stripe webhook: ${event.type} is not allowed`),
							onSome: (event) =>
								// All allowed events should have a customerId but TypeScript does not know this
								Effect.succeed((event.data.object as { customer: string }).customer).pipe(
									Effect.filterOrFail(
										Predicate.isString, // Ensure our assumption is correct.
										() => new Error(`[STRIPE HOOK][CANCER] ID isn't string.\nEvent type: ${event.type}`)
									),
									Effect.flatMap(syncStripData)
								)
						})
					)
				)
		}
	})

export class Stripe extends Effect.Tag('Stripe')<Stripe, Effect.Effect.Success<ReturnType<typeof make>>>() {}

export const layer = () => Layer.effect(Stripe, make())
