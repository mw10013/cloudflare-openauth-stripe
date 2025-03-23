import Stripe from 'stripe'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
	apiVersion: '2025-02-24.acacia'
})
const baseProduct = await stripe.products.create({
	name: 'Base',
	description: 'Base subscription plan'
})

const basePrice = await stripe.prices.create({
	product: baseProduct.id,
	unit_amount: 800, // $8 in cents
	currency: 'usd',
	recurring: {
		interval: 'month',
		trial_period_days: 7
	},
	lookup_key: 'base'
})

const plusProduct = await stripe.products.create({
	name: 'Plus',
	description: 'Plus subscription plan'
})

const plusPrice = await stripe.prices.create({
	product: plusProduct.id,
	unit_amount: 1200, // $12 in cents
	currency: 'usd',
	recurring: {
		interval: 'month',
		trial_period_days: 7
	},
	lookup_key: 'plus'
})

await stripe.billingPortal.configurations.create({
	business_profile: {
		headline: 'Manage your subscription'
	},
	features: {
		payment_method_update: {
			enabled: true
		},
		subscription_update: {
			enabled: true,
			default_allowed_updates: ['price', 'promotion_code'],
			proration_behavior: 'create_prorations',
			products: [
				{
					product: baseProduct.id,
					prices: [basePrice.id]
				},
				{
					product: plusProduct.id,
					prices: [plusPrice.id]
				}
			]
		},
		subscription_cancel: {
			enabled: true,
			mode: 'at_period_end',
			cancellation_reason: {
				enabled: true,
				options: ['too_expensive', 'missing_features', 'switched_service', 'unused', 'other']
			}
		}
	}
})

console.log('Stripe seeded successfully.')
