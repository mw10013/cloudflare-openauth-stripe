## Ask for `object` support in Config to ease Cloudflare env integration and unlock declarative Cloudflare services

Traditionally, environment variables are string based. Modern runtimes such as Cloudflare's also put objects into the environment. Cloudflare calls these [bindings](https://developers.cloudflare.com/workers/runtime-apis/bindings/). They allow a Worker, Cloudflare's servless function, to interact with resources on Cloudflare such as D1 (sqlite), R2 (object storage), and DO (durable objects). I ask for `object` support in Config to ease Cloudflare env integration and unlock declarative Cloudflare services.

### Proposed API

```ts
ConfigProvider.fromObject: <T extends { [K in keyof T]: string | object }>(object: T) => Layer<never, never, never>

Config.object: (name: string) => Config<object>
```

### Proof of Concept (POC)

POC using pathological type assertions demonstrates that the existing machinery in Effect can support objects in Config. The POC is in this [repo]() and its essence:

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

A declarative Cloudflare service with a dependency on another Cloudflare service:

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
    <snip>
    return {
			<snip>
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

### Alternate Approaches

#### Pass Cloudflare env into layer constructors

```ts
export const make = ({ db }: { db: D1Database }) => ({
	<snip>
})
export class D1 extends Effect.Tag('D1')<D1, ReturnType<typeof make>>() {}
export const layer = ({ db }: { db: D1Database }) => Layer.succeed(D1, make({ db }))
```

`layer` is the constructor a D1 layer and takes a D1Database that you get from a Cloudflare env.

The downside is that this is not declarative and I don't have the skills to make it so. At layer construction time, you'll need to imperatively piece the layers together.

Contrast

```ts
export const makeRuntime = (env: Env) => {
	const D1Live = D1.layer({ db: env.D1 })
	const RepositoryLive = Repository.Live.pipe(Layer.provide(D1Live))
	const KVLive = KV.layer({ kv: env.KV })
	const R2live = R2.layer({ r2: env.R2 })
	const DOLive = DO.layer({ do: env.DO })
	const StripeLive = stripeLayer(env).pipe(Layer.merge(RepositoryLive, KVLive, R2Live, DOLive))
	const Live = Layer.mergeAll(StripeLive, RepositoryLive)
	return ManagedRuntime.make(Live)
}
```

with

```ts
export const makeRuntime = (env: Env) => {
	const Live = Layer.mergeAll(Stripe.Default, Repository.Default)
	return ManagedRuntime.make(Live)
}
```

### Importing Cloudflare env as a global

- low-level
- override of bindings?
  [doc](https://developers.cloudflare.com/workers/runtime-apis/bindings/#importing-env-as-a-global)
