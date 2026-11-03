import {
  brainResponseSchema,
  checksResponseSchema,
  profileResponseSchema,
  setProfileResponseSchema,
  todayResponseSchema,
  type PatchCardsBody,
  type SetProfileBody,
} from '@guardian-book/shared'
import { api } from './client'

/** B05's learner routes (spec 03 §8.3, §9.3): profile cards, Today, check-ins, the Brain. */

export const getProfile = () => api('/api/me/profile', profileResponseSchema)

export const setProfile = (body: SetProfileBody) => api('/api/me/profile', setProfileResponseSchema, { method: 'POST', body })

export const patchCards = (body: PatchCardsBody) => api('/api/me/profile/cards', profileResponseSchema, { method: 'PATCH', body })

export const getToday = () => api('/api/me/today', todayResponseSchema)

export const getChecks = () => api('/api/me/checks', checksResponseSchema)

export const getBrain = () => api('/api/me/brain', brainResponseSchema)
