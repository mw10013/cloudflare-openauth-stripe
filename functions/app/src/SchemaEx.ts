import { Schema } from 'effect'

export const FormDataFromSelf = Schema.instanceOf(FormData).annotations({ identifier: 'FormDataFromSelf' })
// https://discord.com/channels/795981131316985866/847382157861060618/threads/1270826681505939517
// https://raw.githubusercontent.com/react-hook-form/resolvers/refs/heads/dev/effect-ts/src/effect-ts.ts

export const RecordFromFormData = Schema.transform(FormDataFromSelf, Schema.Record({ key: Schema.String, value: Schema.String }), {
	strict: false,
	decode: (formData) => Object.fromEntries(formData.entries()),
	encode: (data) => {
		const formData = new FormData()
		for (const [key, value] of Object.entries(data)) {
			formData.append(key, value)
		}
		return formData
	}
}).annotations({ identifier: 'RecordFromFormData' })

export const FormDataSchema = <A, I extends Record<string, string>, R>(schema: Schema.Schema<A, I, R>) =>
	Schema.compose(RecordFromFormData, schema, { strict: false }) 

export const DataFromResult = <A, I>(DataSchema: Schema.Schema<A, I>) =>
	Schema.transform(
		Schema.Struct({
			data: Schema.String
		}),
		Schema.parseJson(DataSchema),
		{
			strict: true,
			decode: (result) => result.data,
			encode: (value) => ({ data: value })
		}
	)
