import {
  approvePaperResponseSchema,
  classPracticeListResponseSchema,
  classPracticeResponseSchema,
  libraryPaperResponseSchema,
  libraryResponseSchema,
  librarySearchResponseSchema,
  whatComesUpResponseSchema,
  type CreateClassPracticeBody,
  type PaperRef,
} from '@guardian-book/shared'
import { api } from './client'

/**
 * The past-paper library (B17; D40): one function per route, parsed with the shared schema.
 * Nothing here ever receives a bucket URL; a diagram is fetched by item ID through the API.
 */

const id = (value: string) => encodeURIComponent(value)

export const libraryPapers = () => api('/api/library', libraryResponseSchema)

/** `path` is the paper's library path, `mathematics/12/2023/november/p1`. */
export const libraryPaper = (path: string) => api(`/api/library/${path.split('/').map(id).join('/')}`, libraryPaperResponseSchema)

export const librarySearch = (query: string) => api(`/api/library/search?q=${id(query)}`, librarySearchResponseSchema)

export const whatComesUp = () => api('/api/library/comes-up', whatComesUpResponseSchema)

/** The diagram, proxied by the API (never a bucket link). */
export const diagramUrl = (itemId: string) => `/api/library/items/${id(itemId)}/diagram`

export const approvePaper = (classId: string, paper: PaperRef) =>
  api(`/api/teacher/classes/${id(classId)}/library/approve`, approvePaperResponseSchema, { method: 'POST', body: paper })
export const approveTopic = (classId: string, skillTag: string) =>
  api(`/api/teacher/classes/${id(classId)}/library/approve`, approvePaperResponseSchema, { method: 'POST', body: { skillTag } })

export const classPractice = (classId: string) => api(`/api/teacher/classes/${id(classId)}/practice`, classPracticeListResponseSchema)
export const createClassPractice = (classId: string, body: CreateClassPracticeBody) =>
  api(`/api/teacher/classes/${id(classId)}/practice`, classPracticeResponseSchema, { method: 'POST', body })
