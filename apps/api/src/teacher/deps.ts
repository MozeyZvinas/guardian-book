import type { PracticeDeps } from '../inputs/deps.js'

/**
 * What the teacher space, interventions and notes need: the database, the gateway and
 * the caps for note drafting (through B04's `runModel`), a logger and a clock. A subset of
 * `PracticeDeps`, so `createApp` passes the same object.
 */
export type TeacherDeps = Pick<PracticeDeps, 'db' | 'gateway' | 'logger' | 'limits' | 'now'>
