/**
 * Maintained word lists for the text rules. Add to them; never remove without a ruling.
 * Matching is case-insensitive on word boundaries (see `text.ts`), so "mood" does not
 * match "moody" unless listed, and "stressed" is listed while "stress" (as in "stress the
 * importance") is not.
 */

/**
 * INFERENCE_FORBIDDEN (P0-08, spec 04 §4 "No emotion inference"; P0-02 "No personality
 * typing, no learning-style label"). The model speaks about the work, never the person.
 */
export const FORBIDDEN_INFERENCE_TERMS: readonly string[] = [
  // mood and emotion
  'mood',
  'moody',
  'anxiety',
  'anxious',
  'depressed',
  'depression',
  'stressed',
  'unhappy',
  'sad',
  'angry',
  'frustrated',
  'emotional',
  'upset',
  // effort or character judgements
  'lazy',
  'laziness',
  'unmotivated',
  'personality',
  'introvert',
  'introverted',
  'extrovert',
  'extroverted',
  'gifted',
  'slow learner',
  'low ability',
  // learning-style labels
  'visual learner',
  'auditory learner',
  'kinesthetic',
  'kinaesthetic',
  'learning style',
  'learning styles',
  // health and diagnosis
  'adhd',
  'autism',
  'autistic',
  'dyslexia',
  'dyslexic',
  'dyscalculia',
  'disorder',
  'mental health',
  'iq',
]

/**
 * PLAIN_LANGUAGE_FAIL jargon list (P0-08 guardian view; spec 03 §8.1 "Guardian view text
 * passes the plain-language check at write time"). Words a parent should never need a
 * glossary for.
 */
export const JARGON_TERMS: readonly string[] = [
  'pedagogy',
  'pedagogical',
  'scaffolding',
  'scaffold',
  'metacognition',
  'metacognitive',
  'differentiation',
  'formative',
  'summative',
  'heuristic',
  'cognitive load',
  'misconception',
  'rubric',
  'consequential accuracy',
  'consistent accuracy',
  'method mark',
  'method marks',
  'taxonomy',
  'curriculum',
  'competency',
  'competencies',
  'learning outcome',
  'learning outcomes',
  'remediation',
  'intervention',
  'zone of proximal development',
  'assessment for learning',
  'mastery',
  'proficiency',
]
