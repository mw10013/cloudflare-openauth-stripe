import { DurableObject } from 'cloudflare:workers'
import { Config, ConfigError, Effect, Either, Predicate } from 'effect'
import * as ConfigEx from './ConfigEx'

export class Do extends Effect.Service<Do>()('Do', {
	accessors: true,
	dependencies: [],
	effect: Effect.gen(function* () {
		const doDo = yield* ConfigEx.object('DO').pipe(
			Config.mapOrFail((object) =>
				Predicate.hasProperty(object, 'idFromName') && typeof object.idFromName === 'function'
					? Either.right(object as Env['DO'])
					: Either.left(ConfigError.InvalidData([], `Expected a DurableObjectNamespace but received ${object}`))
			)
		)
		const id = doDo.idFromName('do')
		const stub = doDo.get(id)
		return {
			ping: () => Effect.tryPromise(() => stub.ping())
		}
	})
}) {}

export class DoDurableObject extends DurableObject<Env> {
	initialized = false

	constructor(ctx: DurableObjectState, env: Env) {
		super(ctx, env)
		console.log(`DoDurableObject[${new Date().toISOString()}]: constructor: initialized: ${this.initialized}: begin`)
		ctx.blockConcurrencyWhile(async () => {
			console.log(
				`DoDurableObject[${new Date().toISOString()}]: constructor: blockConcurrencyWhile: initialized: ${this.initialized}: begin`
			)
			this.initialized = true
			console.log(`DoDurableObject[${new Date().toISOString()}]: constructor: blockConcurrencyWhile: initialized: ${this.initialized}: end`)
		})
		console.log(`DoDurableObject[${new Date().toISOString()}]: constructor: ${this.initialized}: end`)
	}

	async ping() {
		console.log(`DoDurableObject[${new Date().toISOString()}]: ping: initialized: ${this.initialized}`)
		return { ping: 'pong', initialized: this.initialized }
	}
}
