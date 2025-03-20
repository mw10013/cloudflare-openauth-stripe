## Add `object` support to Config for Cloudflare Integration and Declarative Services

Traditionally, environment variables are string based. Modern runtimes such as Cloudflare's also put objects into the environment. Cloudflare calls these [bindings](https://developers.cloudflare.com/workers/runtime-apis/bindings/). They allow a Worker, Cloudflare's serverless function, to interact with resources on Cloudflare such as D1 (sqlite), R2 (object storage), and DO (durable objects). ConfigProviders hew to tradition and support only string-based configuration so they cannot fully support Cloudflare envs.

In Effect, a service can be 'fully declarative' — meaning it avoids runtime boilerplate — if its layer constructors don’t need arguments from the application. This is a desirable property, as it simplifies layer construction. Config supports this declarativity when limited to string-based configuration. However, a Cloudflare service, which depends on object bindings in the environment, can’t leverage Config to achieve this property.

I propose adding `object` support to Config for full Cloudflare env integration and to unlock declarative Cloudflare services.

### Proposed API

```ts
ConfigProvider.fromObject: <T extends { [K in keyof T]: string | object }>(object: T) => Layer<never, never, never>

Config.object: (name: string) => Config<object>
```

### Proof of Concept (POC)

The POC uses pathological type assertions to mock the proposed API, demonstrating that the existing machinery in Effect can support this. It is in this [repo]() and its essence:

```ts
// ConfigEx.ts

// Mock of ConfigProvider.fromObject: <T extends { [K in keyof T]: string | object }>(object: T) => Layer<never, never, never>
export const fromObject = <T extends { [K in keyof T]: string | object }>(object: T) =>
	pipe(
		object as unknown as Record<string, string>,
		Record.toEntries,
		(tuples) => new Map(tuples),
		ConfigProvider.fromMap,
		Layer.setConfigProvider
	)

// Mock of Config.object: (name: string) => Config<object>
export const object = (name: string) =>
	Config.string(name).pipe(
		Config.mapOrFail((value) =>
			value !== null && typeof value === 'object'
				? Either.right(value as object)
				: Either.left(ConfigError.InvalidData([], `Expected an object but received ${value}`))
		)
	)
```

Here is a declarative Cloudflare service with a dependency on another declarative Cloudflare service:

```ts
// Poll.ts
export class Poll extends Effect.Service<Poll>()('Poll', {
	accessors: true,
	dependencies: [KV.Default],
	effect: Effect.gen(function* () {
		const pollDo = yield* ConfigEx.object('POLL_DO').pipe(
			Config.mapOrFail((object) =>
				Predicate.hasProperty(object, 'idFromName') && typeof object.idFromName === 'function'
					? Either.right(object as Env['POLL_DO'])
					: Either.left(ConfigError.InvalidData([], `Expected a DurableObjectNamespace but received ${object}`))
			)
		)
   // Snip
    return {
			// Snip
		}
	})
}) {}
```

The runtime

```ts
// index.tsx
export const makeRuntime = (env: Env) => {
	const ConfigLive = ConfigEx.fromObject(env)
	return Layer.mergeAll(Poll.Default).pipe(Layer.provide(ConfigLive), ManagedRuntime.make)
}
```