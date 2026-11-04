import { MAX_PROFILE_ANSWER_LENGTH, MAX_PROFILE_SUBJECTS, type SetProfileBody } from '@guardian-book/shared'

/**
 * Tell me about you as quick taps (B16 §1). The taps are composed into the four answers
 * `POST /api/me/profile` already takes, so the profile-cards call and its verifier are
 * unchanged; the model only ever sees structured sentences now, never an essay.
 */

export const GRADES: ReadonlyArray<{ value: string; label: string }> = [
  { value: '8', label: 'Grade 8' },
  { value: '9', label: 'Grade 9' },
  { value: '10', label: 'Grade 10' },
  { value: '11', label: 'Grade 11' },
  { value: '12', label: 'Grade 12' },
  { value: 'rewriting', label: 'Finished school / rewriting matric' },
]

/** The CAPS FET subject list, as a learner says them on a timetable. */
export const CAPS_FET_SUBJECTS: readonly string[] = [
  'Mathematics',
  'Mathematical Literacy',
  'Physical Sciences',
  'Life Sciences',
  'Accounting',
  'Business Studies',
  'Economics',
  'Geography',
  'History',
  'English HL',
  'English FAL',
  'Afrikaans HL',
  'Afrikaans FAL',
  'isiZulu HL',
  'isiZulu FAL',
  'Sesotho HL',
  'Sesotho FAL',
  'Life Orientation',
  'Information Technology',
  'CAT',
  'Engineering Graphics and Design',
  'Tourism',
  'Consumer Studies',
  'Agricultural Sciences',
  'Visual Arts',
  'Dramatic Arts',
]

export const OTHER_SUBJECT = 'Other'

export const DREAM_EXAMPLES: readonly string[] = ['be an engineer', 'be a nurse', 'start a business']

/** The learner's own choice (B16 §1): never a label from the model. */
export const LEARN_OPTIONS: readonly string[] = [
  'someone shows me an example',
  'I try first, then check',
  'I watch a video',
  'I talk it through',
  'I practise lots of questions',
]

export interface SetupTaps {
  grade: string
  subjects: string[]
  /** A subject typed under "Other". */
  otherSubject: string
  hardest: string
  /** The gap in "One day I want to ___". */
  dream: string
  learn: string
}

export const EMPTY_TAPS: SetupTaps = { grade: '', subjects: [], otherSubject: '', hardest: '', dream: '', learn: '' }

/** The subjects as chosen, "Other" typed in last, capped at the card's limit. */
export function chosenSubjects(taps: Pick<SetupTaps, 'subjects' | 'otherSubject'>): string[] {
  const other = taps.otherSubject.trim()
  return [...new Set([...taps.subjects, ...(other ? [other] : [])])].slice(0, MAX_PROFILE_SUBJECTS)
}

function gradeSentence(grade: string): string | null {
  if (grade === 'rewriting') return 'I have finished school and I am rewriting matric.'
  return /^(8|9|10|11|12)$/.test(grade) ? `I am in Grade ${grade}.` : null
}

const clip = (text: string): string => text.slice(0, MAX_PROFILE_ANSWER_LENGTH)

/**
 * The four answers. The grade has no card of its own, so it rides as the first sentence of
 * "how I learn" (the one card a parent never sees) until a grade field exists.
 */
export function composeAnswers(taps: SetupTaps): SetProfileBody {
  const subjects = chosenSubjects(taps)
  const dreamGap = taps.dream
    .trim()
    .replace(/^(one day,?\s+)?i\s+want\s+to\s+/i, '')
    .replace(/[.!]+$/, '')
  const learn = taps.learn.trim()
  const grade = gradeSentence(taps.grade)
  return {
    dream: clip(dreamGap ? `One day I want to ${dreamGap}.` : ''),
    subjects: clip(subjects.join(', ')),
    hardestSubject: clip(subjects.includes(taps.hardest) ? taps.hardest : ''),
    howILearn: clip([grade, learn ? `I learn best when ${learn}.` : null].filter((part): part is string => part !== null).join(' ')),
  }
}

export function isBlank(taps: SetupTaps): boolean {
  const answers = composeAnswers(taps)
  return Object.values(answers).every((value) => value.trim().length === 0)
}
