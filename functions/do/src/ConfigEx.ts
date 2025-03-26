import { Config, ConfigError, ConfigProvider, Either, Layer, pipe, Record } from 'effect'

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
