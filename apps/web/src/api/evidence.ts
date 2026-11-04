import { evidenceResponseSchema } from '@guardian-book/shared'
import { api } from './client'

/** The proof page's data: the committed results file, or null when none is committed. */
export const evidence = () => api('/api/evidence', evidenceResponseSchema)
