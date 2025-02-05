import Stripe from 'stripe'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!)
const baseProduct = await stripe.products.create({
	name: 'Base',
	description: 'Base subscription plan'
})

await stripe.prices.create({
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

await stripe.prices.create({
	product: plusProduct.id,
	unit_amount: 1200, // $12 in cents
	currency: 'usd',
	recurring: {
		interval: 'month',
		trial_period_days: 7
	},
  lookup_key: 'plus'
})

console.log('Stripe products and prices created successfully.')
