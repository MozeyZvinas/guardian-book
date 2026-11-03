import type { Role } from '@guardian-book/shared'

/**
 * The demo circle (spec 02 P0-01; brief B02 §7). Fixed UUIDs so tests can name rows.
 * Every person is fictional (`synthetic_self_generated`); every school is `fictional`.
 * Emails use the reserved `.test` TLD and never belong to anyone.
 */

export const SEED_SCHOOLS = {
  sentinel: { id: '019a0b02-0000-7000-8000-00000000a001', name: 'Sentinel High (fictional)' },
  riverside: { id: '019a0b02-0000-7000-8000-00000000a002', name: 'Riverside Secondary (fictional)' },
} as const

export interface SeedPerson {
  key: string
  id: string
  role: Role
  nickname: string
  email: string
  school: keyof typeof SEED_SCHOOLS | null
}

const person = (key: string, suffix: string, role: Role, nickname: string, school: SeedPerson['school']): SeedPerson => ({
  key,
  id: `019a0b02-0000-7000-8000-0000000${suffix}`,
  role,
  nickname,
  email: `${key}@demo.guardianbook.test`,
  school,
})

export const SEED_PEOPLE = {
  // The demo circle at Sentinel High
  lerato: person('lerato', '00101', 'learner', 'Lerato', 'sentinel'),
  mmaLerato: person('mma-lerato', '00102', 'guardian', 'Mma Lerato', null),
  msDlamini: person('ms-dlamini', '00103', 'teacher', 'Ms Dlamini', 'sentinel'),
  // Five classmates in 12A
  thabo: person('thabo', '00111', 'learner', 'Thabo', 'sentinel'),
  naledi: person('naledi', '00112', 'learner', 'Naledi', 'sentinel'),
  sipho: person('sipho', '00113', 'learner', 'Sipho', 'sentinel'),
  zanele: person('zanele', '00114', 'learner', 'Zanele', 'sentinel'),
  kagiso: person('kagiso', '00115', 'learner', 'Kagiso', 'sentinel'),
  // A second teacher and class at Sentinel High, for cross-class tests
  mrNaidoo: person('mr-naidoo', '00121', 'teacher', 'Mr Naidoo', 'sentinel'),
  bongani: person('bongani', '00122', 'learner', 'Bongani', 'sentinel'),
  // Riverside Secondary, for cross-school tests
  msBotha: person('ms-botha', '00131', 'teacher', 'Ms Botha', 'riverside'),
  anele: person('anele', '00132', 'learner', 'Anele', 'riverside'),
} as const

export type SeedPersonKey = keyof typeof SEED_PEOPLE

export const SEED_CLASSES = {
  '12A': {
    id: '019a0b02-0000-7000-8000-00000000c001',
    name: '12A',
    teacher: 'msDlamini' as SeedPersonKey,
    school: 'sentinel' as const,
    learners: ['lerato', 'thabo', 'naledi', 'sipho', 'zanele', 'kagiso'] as SeedPersonKey[],
  },
  '11B': {
    id: '019a0b02-0000-7000-8000-00000000c002',
    name: '11B',
    teacher: 'mrNaidoo' as SeedPersonKey,
    school: 'sentinel' as const,
    learners: ['bongani'] as SeedPersonKey[],
  },
  '10C': {
    id: '019a0b02-0000-7000-8000-00000000c003',
    name: '10C',
    teacher: 'msBotha' as SeedPersonKey,
    school: 'riverside' as const,
    learners: ['anele'] as SeedPersonKey[],
  },
} as const

export type SeedClassKey = keyof typeof SEED_CLASSES

/** Guardian links created by the seed (as if the guardian had redeemed the learner's code). */
export const SEED_GUARDIAN_LINKS: { learner: SeedPersonKey; guardian: SeedPersonKey }[] = [
  { learner: 'lerato', guardian: 'mmaLerato' },
]

/** Classes whose teacher has approved the sample items (12A only: assessing for 11B is refused). */
export const SEED_GUIDELINE_APPROVALS: SeedClassKey[] = ['12A']
