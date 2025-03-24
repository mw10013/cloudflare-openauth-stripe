import type { Stripe as StripeType } from 'stripe'
import { DurableObject } from 'cloudflare:workers'
import { Config, ConfigError, Effect, Either, Layer, Logger, LogLevel, ManagedRuntime, Option, Predicate, Redacted } from 'effect'
import { Stripe as StripeClass } from 'stripe'
import * as ConfigEx from './ConfigEx'
import { InvariantResponseError } from './ErrorEx'
import { Repository } from './Repository'

export class Stripe extends Effect.Service<Stripe>()('Stripe', {
	accessors: true,
	dependencies: [Repository.Default],
	effect: Effect.gen(function* () {
		const STRIPE_SECRET_KEY = yield* Config.redacted('STRIPE_SECRET_KEY')
		// When you specify an apiVersion that conflicts with the stripe package version, Stripe recommends you @ts-ignore.
		// See the doc string for apiVersion.
		// // @ts-expect-error: API version difffers from LatestApiVersion
		const stripe = new StripeClass(Redacted.value(STRIPE_SECRET_KEY), { apiVersion: '2025-02-24.acacia' })
		const repository = yield* Repository
		const allowedEvents: StripeType.Event.Type[] = [
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

		const stripeDo = yield* ConfigEx.object('STRIPE_DO').pipe(
			Config.mapOrFail((object) =>
				Predicate.hasProperty(object, 'idFromName') && typeof object.idFromName === 'function'
					? Either.right(object as Env['STRIPE_DO'])
					: Either.left(ConfigError.InvalidData([], `Expected a DurableObjectNamespace but received ${object}`))
			)
		)
		const id = stripeDo.idFromName('stripe')
		const stub = stripeDo.get(id)

		const getSubscriptionForCustomer = (customerId: NonNullable<StripeType.SubscriptionListParams['customer']>) =>
			Effect.tryPromise(() =>
				stripe.subscriptions.list({ customer: customerId, limit: 1, status: 'all', expand: ['data.items', 'data.items.data.price'] })
			).pipe(Effect.map((result) => Option.fromNullable(result.data[0])))

		const syncStripeData = (customerId: string) =>
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
								: Effect.fail(new Error(`syncStripeData: price product (${stripeProductId}) and lookup key (${planName}) must be strings`))
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
						[K in keyof StripeType.BillingPortal.SessionCreateParams]-?: NonNullable<StripeType.BillingPortal.SessionCreateParams[K]>
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
					const account = yield* repository.getRequiredAccountForUser({ userId })
					if (account.stripeCustomerId)
						return {
							stripeCustomerId: account.stripeCustomerId,
							stripeSubscriptionId: account.stripeSubscriptionId
						}
					// Test environment may have seeded stripe customers
					const {
						data: [existingCustomer]
					} = yield* Effect.tryPromise(() =>
						stripe.customers.list({
							email,
							limit: 1
						})
					)
					const customer = existingCustomer
						? existingCustomer
						: yield* Effect.tryPromise(() =>
								stripe.customers.create({
									email
									// metadata: { userId: userId.toString() } // DO NOT FORGET THIS
								})
							)
					yield* repository.updateStripeCustomerId({ accountId: account.accountId, stripeCustomerId: customer.id })
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
					[K in keyof StripeType.Checkout.SessionCreateParams]-?: NonNullable<StripeType.Checkout.SessionCreateParams[K]>
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
					Effect.flatMap((customer) => syncStripeData(customer.id))
				),
			getCheckoutSession: (sessionId: string) =>
				Effect.tryPromise(() => stripe.checkout.sessions.retrieve(sessionId, { expand: ['customer'] })),

			syncStripeData,

			handleWebhook: (request: Request) =>
				Effect.gen(function* () {
					const signature = yield* Effect.fromNullable(request.headers.get('Stripe-Signature')).pipe(
						Effect.mapError(
							() =>
								new InvariantResponseError({
									message: 'Missing stripe signature.',
									response: new Response(null, { status: 400 })
								})
						)
					)
					const body = yield* Effect.tryPromise(() => request.text())
					const event = yield* Config.redacted('STRIPE_WEBHOOK_SECRET').pipe(
						Effect.flatMap((stripeWebhookSecretRedacted) =>
							Effect.tryPromise(() => stripe.webhooks.constructEventAsync(body, signature, Redacted.value(stripeWebhookSecretRedacted)))
						),
						Effect.tap((event) => Effect.log(`Stripe webhook: ${event.type}`))
					)
					const allowedOption = Option.liftPredicate<StripeType.Event>((event) => allowedEvents.includes(event.type))(event)
					if (Option.isNone(allowedOption)) {
						yield* Effect.logError(`Stripe webhook: ${event.type} is not allowed`)
						return new Response() // Return 200 to avoid retries
					}
					const customerId = (allowedOption.value.data.object as { customer: string }).customer
					if (!Predicate.isString(customerId)) {
						yield* Effect.logError(`Stripe webhook: customerId is not string for event type: ${event.type}`)
						return new Response() // Return 200 to avoid retries
					}
					yield* Effect.tryPromise(() => stub.queueEvent(customerId))
					yield* syncStripeData(customerId)
					return new Response()
				}).pipe(
					Effect.tapError((error) =>
						Effect.logError(`Stripe webhook failed: ${error instanceof Error ? error.message : 'Internal server error'}`)
					),
					Effect.mapError((error) => (error instanceof InvariantResponseError ? error.response : new Response(null, { status: 500 }))),
					Effect.merge
				),

			reconcile: () =>
				Effect.gen(function* () {
					const accounts = yield* repository.getAccounts()
					const iterable = accounts.map((account) => {
						const owner = account.accountMembers.find((member) => member.accountMemberRole === 'owner')?.user
						if (!owner) {
							return Effect.fail(new Error(`Organization ${account.accountId} has no owner`))
						}
						return Effect.gen(function* () {
							const customer = yield* Effect.tryPromise(async () => {
								const {
									data: [customer]
								} = await stripe.customers.list({
									email: owner.email,
									limit: 1
								})
								return customer
							})
							if (customer) {
								if (account.stripeCustomerId !== customer.id) {
									yield* repository.updateStripeCustomerId({ accountId: account.accountId, stripeCustomerId: customer.id })
								}
								yield* Effect.log(`Stripe reconcile: accountId: ${account.accountId}, stripeCustomerId: ${customer.id}`)
								yield* syncStripeData(customer.id)
							}
						})
					})
					yield* Effect.all(iterable)
				})
		}
	})
}) {}

const makeRuntime = (env: Env) => {
	const LogLevelLive = Config.logLevel('LOG_LEVEL').pipe(
		Config.withDefault(LogLevel.Info),
		Effect.map((level) => Logger.minimumLogLevel(level)),
		Layer.unwrapEffect
	)
	const ConfigLive = ConfigEx.fromObject(env)
	return Layer.mergeAll(
		Stripe.Default,
		Logger.replace(Logger.defaultLogger, env.ENVIRONMENT === 'local' ? Logger.defaultLogger : Logger.jsonLogger)
	).pipe(Layer.provide(LogLevelLive), Layer.provide(ConfigLive), ManagedRuntime.make)
}

const STRIPE_DO_DELAY_SEC = 15
const STRIPE_DO_LIMIT = 2

// TODO: runtime, concurrent batch
export class StripeDurableObject extends DurableObject<Env> {
	storage: DurableObjectStorage
	sql: SqlStorage
	runtime: ReturnType<typeof makeRuntime>

	constructor(ctx: DurableObjectState, env: Env) {
		super(ctx, env)
		this.storage = ctx.storage
		this.sql = ctx.storage.sql
		this.runtime = makeRuntime(env)

		this.sql.exec(`create table if not exists events(
			customerId text primary key,
			createdAt integer default (unixepoch()))`)
	}

	async queueEvent(customerId: string) {
		const alarm = await this.storage.getAlarm()
		if (alarm === null) {
			this.storage.setAlarm(Date.now() + 1000 * STRIPE_DO_DELAY_SEC)
		}
		this.sql.exec(`insert into events (customerId) values (?) on conflict (customerId) do nothing`, customerId)
	}

	async alarm() {
		const events = this.sql
			.exec<{ customerId: string }>(`select customerId, createdAt from events order by createdAt asc limit ?`, STRIPE_DO_LIMIT + 1)
			.toArray()
		console.log({ message: 'alarm', eventCount: events.length, events })
		if (events.length > STRIPE_DO_LIMIT) {
			this.storage.setAlarm(Date.now() + 1000 * STRIPE_DO_DELAY_SEC)
		}
		const iterable = events.slice(0, STRIPE_DO_LIMIT).map(({ customerId }) =>
			Effect.gen(this, function* () {
				yield* Effect.log(`alarm: processing customerId: ${customerId}`)
				yield* Effect.try(() => this.sql.exec(`delete from events where customerId = ?`, customerId))
			})
		)
		await this.runtime.runPromise(Effect.all(iterable, { concurrency: 2 }))
	}
}
