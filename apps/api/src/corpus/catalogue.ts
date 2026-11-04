import { PAPER_SESSIONS, paperPath, type PaperRef, type PaperSession } from '@guardian-book/shared'
import type { CorpusObject } from './r2.js'

/**
 * Which objects in the DBE bucket are the papers this build extracts (brief B17 phase A §1):
 * Grade 12 NSC **Mathematics**, Papers 1 and 2, the English question paper and its memo
 * (memos are bilingual), newest session first. Pure: it reads key names only.
 *
 * Keys look like `dbe/raw/nsc/g12/<year>_<session>/Mathematics/<hash>__<Paper_1 | Memo_1>__<language>.pdf`.
 */

export const CORPUS_SUBJECT = 'Mathematics'
export const CORPUS_GRADE = 12

export interface CorpusPaper {
  ref: PaperRef
  /** `mathematics/12/2025/november/p1`: the folder name everywhere under the corpus dir. */
  id: string
  paperKey: string
  memoKey: string
}

const KEY = /^dbe\/raw\/nsc\/g12\/(\d{4})_([A-Za-z_]+)\/Mathematics\/[0-9a-f]+__(Paper|Memo)_([12])__([A-Za-z_]+)\.pdf$/

const SESSION_BY_FOLDER: Record<string, PaperSession> = {
  November: 'november',
  May_June: 'may_june',
  Feb_March: 'feb_march',
  February_March: 'feb_march',
}

interface Found {
  ref: PaperRef
  paper: string | null
  memo: string | null
}

/** Pairs every Mathematics Grade 12 English paper with its memo; unpaired papers are left out. */
export function catalogueMathsPapers(objects: CorpusObject[]): CorpusPaper[] {
  const found = new Map<string, Found>()
  for (const { key } of objects) {
    const match = KEY.exec(key)
    if (!match) continue
    const [, year, sessionFolder, kind, paperNo, language] = match
    const session = SESSION_BY_FOLDER[sessionFolder ?? '']
    if (!session || !year || !paperNo) continue
    const ref: PaperRef = { subject: CORPUS_SUBJECT, grade: CORPUS_GRADE, year: Number(year), session, paper: Number(paperNo) }
    const id = paperPath(ref)
    const entry = found.get(id) ?? { ref, paper: null, memo: null }
    // The question paper must be the English one; a memo is bilingual, any language label will do.
    if (kind === 'Paper' && /^English$/i.test(language ?? '')) entry.paper = key
    if (kind === 'Memo') entry.memo = key
    found.set(id, entry)
  }
  return [...found.values()]
    .filter((entry): entry is Found & { paper: string; memo: string } => entry.paper !== null && entry.memo !== null)
    .map((entry) => ({ ref: entry.ref, id: paperPath(entry.ref), paperKey: entry.paper, memoKey: entry.memo }))
    .sort(newestFirst)
}

/** Newest first: year, then session (November after May/June after Feb/March), then paper number. */
export function newestFirst(a: CorpusPaper, b: CorpusPaper): number {
  if (a.ref.year !== b.ref.year) return b.ref.year - a.ref.year
  const order = (session: PaperSession) => PAPER_SESSIONS.indexOf(session)
  if (a.ref.session !== b.ref.session) return order(b.ref.session) - order(a.ref.session)
  return a.ref.paper - b.ref.paper
}

/** `2026-may_june`: the session key the CLI takes and the held-out rule compares. */
export function sessionKey(ref: Pick<PaperRef, 'year' | 'session'>): string {
  return `${ref.year}-${ref.session}`
}

/** The newest session among the papers (phase C measures on it). Null when there are none. */
export function newestSession(papers: CorpusPaper[]): string | null {
  const first = [...papers].sort(newestFirst)[0]
  return first ? sessionKey(first.ref) : null
}

/**
 * The held-out set, frozen by D31 ("the newest sessions (2025 November, 2026 May/June),
 * frozen when first catalogued"): its items load with `held_out`, never reach practice or
 * the library, and feed the evaluation only (brief B17 A.5). Named, not computed, so a
 * session added to the bucket later never moves the set.
 */
export const HELD_OUT_SESSIONS: readonly string[] = ['2026-may_june', '2025-november']

export function isHeldOut(ref: Pick<PaperRef, 'year' | 'session'>, heldOut: readonly string[] = HELD_OUT_SESSIONS): boolean {
  return heldOut.includes(sessionKey(ref))
}
