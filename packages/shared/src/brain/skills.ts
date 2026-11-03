/**
 * Skill labels (brief B05 §5). Chips never show a raw tag: every tag the content pack uses
 * has wording for the learner, the guardian and the teacher, and any tag not listed here
 * falls back to plain words made from the tag itself. B06 and B07 import this same map.
 */

export const SKILL_AUDIENCES = ['learner', 'guardian', 'teacher'] as const
export type SkillAudience = (typeof SKILL_AUDIENCES)[number]

export interface SkillLabels {
  learner: string
  guardian: string
  teacher: string
}

const labels = (learner: string, guardian: string, teacher: string): SkillLabels => ({ learner, guardian, teacher })

/** The content pack's tags (C1, 3 Nov 2026) with the wording from the brief, verbatim. */
export const SKILL_LABELS: Readonly<Record<string, SkillLabels>> = {
  'algebra.standard_form': labels('Getting the equation equal to zero', 'Setting up the equation', 'Standard form'),
  'algebra.factorising': labels(
    'Factorising into two brackets',
    'Factorising (splitting an expression into two brackets)',
    'Factorising trinomials',
  ),
  'algebra.zero_product': labels('Solving from the brackets', 'Finding the answers from the brackets', 'Zero-product law'),
  'algebra.quadratic_formula': labels('Using the quadratic formula', 'Using the quadratic formula', 'Quadratic formula'),
  'algebra.quadratic_inequality': labels(
    'Solving inequalities',
    'Inequalities (finding a range of answers)',
    'Quadratic inequalities',
  ),
  'algebra.substitution': labels(
    'Substituting one equation into the other',
    'Solving two equations together',
    'Simultaneous equations (substitution)',
  ),
  'seq.arithmetic_general_term': labels(
    'Arithmetic patterns: the general term',
    'Number patterns that add the same amount',
    'Arithmetic sequences: Tn',
  ),
  'seq.arithmetic_sum': labels('Adding up an arithmetic series', 'Adding up a number pattern', 'Arithmetic series: Sn'),
  'seq.geometric_general_term': labels(
    'Geometric patterns: finding r',
    'Number patterns that multiply by the same amount',
    'Geometric sequences: Tn and r',
  ),
  'seq.geometric_sum': labels('Adding up a geometric series', 'Adding up a multiplying pattern', 'Geometric series: Sn'),
  'seq.convergence': labels('When a series converges', 'When a pattern settles to a total', 'Convergence (−1 < r < 1)'),
  'seq.sum_to_infinity': labels('Sum to infinity', 'The total a pattern settles to', 'Sum to infinity'),
  'calc.first_principles': labels(
    'Derivatives from first principles',
    'Working out a rate of change step by step',
    'First principles',
  ),
  'calc.power_rule': labels('Differentiation rules', 'Rules for rates of change', 'Differentiation rules'),
  'calc.exponent_form': labels(
    'Writing terms as powers first',
    'Rewriting before calculating',
    'Exponential form before differentiating',
  ),
  'calc.tangent_line': labels('Equation of a tangent', 'The line that touches a curve', 'Equation of a tangent'),
  'calc.stationary_points': labels('Turning points', 'Where a graph turns', 'Stationary points'),
  'functions.evaluate': labels('Substituting into a function', 'Putting a number into a formula', 'Evaluating f(a)'),
}

export const KNOWN_SKILL_TAGS: readonly string[] = Object.keys(SKILL_LABELS)

export function isKnownSkill(tag: string): boolean {
  return Object.hasOwn(SKILL_LABELS, tag)
}

/**
 * Plain words from an unknown tag: the last dotted segment, dashes and underscores as
 * spaces, first letter capitalised. `factorise-trinomial` → "Factorise trinomial";
 * `calc.chain_rule` → "Chain rule". Never returns an empty string.
 */
export function fallbackSkillLabel(tag: string): string {
  const segment = tag.split('.').filter((part) => part.length > 0).at(-1) ?? tag
  const words = segment.replace(/[-_]+/g, ' ').trim().toLowerCase()
  if (words.length === 0) return 'Skill'
  return words.charAt(0).toUpperCase() + words.slice(1)
}

/** The label for a tag as one audience should read it. */
export function skillLabel(tag: string, audience: SkillAudience): string {
  const known = SKILL_LABELS[tag]
  return known ? known[audience] : fallbackSkillLabel(tag)
}

/** All three labels for a tag (known or fallback), for views that render per audience. */
export function skillLabels(tag: string): SkillLabels {
  const known = SKILL_LABELS[tag]
  if (known) return known
  const fallback = fallbackSkillLabel(tag)
  return { learner: fallback, guardian: fallback, teacher: fallback }
}
