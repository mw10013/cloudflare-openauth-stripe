import Stripe from 'stripe'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
	apiVersion: '2025-02-24.acacia'
})

const {
	data: [price]
} = await stripe.prices.list({
	lookup_keys: ['base'],
	limit: 1
})
if (!price) throw new Error('Price not found')
console.log({ priceId: price.id })

const email = 'u1@u.com'

const {
	data: [existingCustomer]
} = await stripe.customers.list({
	email,
	limit: 1
})
if (existingCustomer) {
	await stripe.customers.del(existingCustomer.id)
}

const customer = await stripe.customers.create({
	email
})
const paymentMethod = await stripe.paymentMethods.attach('pm_card_visa', {
	customer: customer.id
})
await stripe.customers.update(customer.id, {
	invoice_settings: {
		default_payment_method: paymentMethod.id
	}
})

const subscription = await stripe.subscriptions.create({
	customer: customer.id,
	items: [{ price: price.id }],
	payment_behavior: 'error_if_incomplete', // Forces immediate payment
	expand: ['latest_invoice.payment_intent'] // Optional: helps verify payment status
})
console.log({
	customerId: customer.id,
	paymentMethodId: paymentMethod.id,
	subscriptionId: subscription.id,
	status: subscription.status,
	paid: subscription.latest_invoice && typeof subscription.latest_invoice !== 'string' ? subscription.latest_invoice.paid : undefined
})
