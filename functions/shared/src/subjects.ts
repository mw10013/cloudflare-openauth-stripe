import { createSubjects } from '@openauthjs/openauth/subject'
import { z } from 'zod'

export const subjects = createSubjects({
	user: z.object({
		// userId: z.number(),
		email: z.string()
	})
})
