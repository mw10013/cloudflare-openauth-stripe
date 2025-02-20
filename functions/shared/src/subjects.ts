import { createSubjects } from '@openauthjs/openauth/subject'
import { Schema } from 'effect'

export const UserSubject = Schema.Struct({
	email: Schema.String
})

export const subjects = createSubjects({
	user: Schema.standardSchemaV1(UserSubject)
})
