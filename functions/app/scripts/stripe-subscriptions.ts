import Stripe from 'stripe'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
	apiVersion: '2025-02-24.acacia'
})

const { data: subscriptions } = await stripe.subscriptions.list({ limit: 10 })
console.log({ subscriptionCount: subscriptions.length })

const mapped = subscriptions.map((subscription) => {
	console.log(subscription.id)
	return {
		subscriptionId: subscription.id,
    customerId: subscription.customer
		// customerId: subscription.customer
	}
})

console.log({ mapped })
