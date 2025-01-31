// Generated by Wrangler by running `wrangler types ./types/worker-configuration.d.ts --experimental-include-runtime ./types/runtime.d.ts`

interface Env {
	KV: KVNamespace;
	ENVIRONMENT: "local" | "staging" | "production";
	OPENAUTH_ISSUER: "http://localhost:8788" | "https://cloudflare-openauth-stripe-worker-staging.devxo.workers.dev" | "https://cloudflare-openauth-stripe-worker-production.devxo.workers.dev";
	COOKIE_SECRET: string;
	STRIPE_SECRET_KEY: string;
	STRIPE_WEBHOOK_SECRET: string;
	D1: D1Database;
	WORKER: Fetcher;
	ASSETS: Fetcher;
}
