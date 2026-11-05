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
const CONTENT_PACK_LABELS: Readonly<Record<string, SkillLabels>> = {
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

/**
 * The NSC Mathematics Grade 12 taxonomy (brief B17 phase A §3; CAPS Papers 1 and 2). Every
 * extracted question and memo step carries one of these tags; the extraction contract
 * offers the model this list and nothing else. Groups: algebra, seq, functions, finance,
 * calc, prob (Paper 1); stats, geom (analytical), trig, euclid (Paper 2).
 */
const NSC_LABELS: Readonly<Record<string, SkillLabels>> = {
  'algebra.surd_equation': labels('Solving equations with a square root', 'Equations with a square-root sign', 'Surd equations'),
  'algebra.exponents': labels('Working with exponents', 'Powers and exponent rules', 'Exponential laws and equations'),
  'algebra.surds': labels('Simplifying surds', 'Simplifying square roots', 'Surds'),
  'algebra.nature_of_roots': labels('The nature of the roots', 'Whether an equation has answers', 'Nature of roots (discriminant)'),
  'algebra.completing_square': labels('Completing the square', 'Rewriting an equation to solve it', 'Completing the square'),
  'seq.quadratic_pattern': labels('Quadratic number patterns', 'Patterns where the differences change', 'Quadratic sequences'),
  'seq.sigma_notation': labels('Sigma notation', 'Adding up a list with the sum symbol', 'Sigma notation'),
  'functions.parabola': labels('Parabolas', 'U-shaped graphs', 'Quadratic functions (parabolas)'),
  'functions.hyperbola': labels('Hyperbolas', 'Graphs with two separate curves', 'Hyperbolic functions'),
  'functions.exponential': labels('Exponential graphs', 'Graphs that grow faster and faster', 'Exponential functions'),
  'functions.logarithm': labels('Logarithms', 'Logarithms (undoing a power)', 'Logarithmic functions'),
  'functions.inverse': labels('Inverse functions', 'A graph and its mirror image', 'Inverse functions'),
  'functions.transformations': labels('Shifting and reflecting graphs', 'Moving a graph', 'Transformations of graphs'),
  'functions.graph_reading': labels('Reading values off a graph', 'Reading a graph', 'Graph interpretation'),
  'functions.domain_range': labels('Domain and range', 'Which values a graph covers', 'Domain and range'),
  'functions.asymptotes_intercepts': labels('Asymptotes and intercepts', 'Where a graph crosses the axes', 'Asymptotes and intercepts'),
  'finance.compound_growth': labels('Growth and decay', 'Money growing with interest', 'Compound growth and decay'),
  'finance.annuity': labels('Annuities', 'Saving or paying the same amount regularly', 'Future and present value annuities'),
  'finance.loan': labels('Loan repayments', 'Paying off a loan', 'Loan balances and repayments'),
  'finance.timeline': labels('Changing interest rates', 'Money over time with changes', 'Timelines with rate changes and withdrawals'),
  'calc.cubic_graph': labels('Cubic graphs', 'Graphs with two turning points', 'Cubic functions: sketching and interpretation'),
  'calc.concavity': labels('Concavity and inflection', 'Where a curve changes its bend', 'Concavity and points of inflection'),
  'calc.optimisation': labels('Biggest and smallest values', 'Finding the best value', 'Optimisation'),
  'calc.rate_of_change': labels('Rates of change', 'How fast something changes', 'Rates of change'),
  'prob.basic': labels('Basic probability', 'How likely something is', 'Probability rules'),
  'prob.venn': labels('Venn diagrams', 'Overlapping-circle diagrams', 'Venn diagrams'),
  'prob.tree': labels('Tree diagrams and tables', 'Branching diagrams for chance', 'Tree diagrams and contingency tables'),
  'prob.independent': labels('Independent events', 'Events that do not affect each other', 'Independent and mutually exclusive events'),
  'prob.counting': labels('Counting arrangements', 'Counting the ways things can be arranged', 'Fundamental counting principle'),
  'stats.measures': labels('Mean, median and spread', 'Averages and spread', 'Measures of central tendency and dispersion'),
  'stats.box_plot': labels('Box-and-whisker plots', 'Box diagrams of data', 'Five-number summary and box-and-whisker'),
  'stats.ogive': labels('Cumulative frequency', 'Adding up data step by step', 'Cumulative frequency (ogive)'),
  'stats.regression': labels('Line of best fit', 'The trend line through data', 'Scatter plots and the least-squares regression line'),
  'stats.correlation': labels('Correlation', 'How closely two things move together', 'Correlation coefficient'),
  'geom.distance_midpoint_gradient': labels('Distance, midpoint and gradient', 'Lengths, middles and slopes', 'Distance, midpoint and gradient'),
  'geom.straight_line': labels('Equation of a straight line', 'Lines on a grid', 'Equation of a straight line'),
  'geom.inclination': labels('Angle of inclination', 'The angle a line makes', 'Angle of inclination'),
  'geom.circle_equation': labels('Equation of a circle', 'Circles on a grid', 'Equation of a circle'),
  'geom.circle_tangent': labels('Tangent to a circle', 'A line that touches a circle', 'Tangents to circles'),
  'trig.identities': labels('Trig identities', 'Trig rules that are always true', 'Trigonometric identities'),
  'trig.reduction': labels('Reduction formulae', 'Simplifying trig expressions', 'Reduction formulae and special angles'),
  'trig.compound_angles': labels('Compound and double angles', 'Trig of added angles', 'Compound and double angle formulae'),
  'trig.equations': labels('Trig equations', 'Solving trig equations', 'Trigonometric equations (general solution)'),
  'trig.graphs': labels('Trig graphs', 'Wave-shaped graphs', 'Trigonometric graphs'),
  'trig.triangles': labels('Sine, cosine and area rules', 'Working out sides and angles', 'Sine, cosine and area rules'),
  'trig.3d': labels('2D and 3D trig problems', 'Trig in real shapes', '2D and 3D trigonometry'),
  'euclid.circle_theorems': labels('Circle geometry', 'Angles in circles', 'Circle theorems'),
  'euclid.proportion': labels('Proportion in triangles', 'Dividing sides in the same ratio', 'Proportionality theorems'),
  'euclid.similarity': labels('Similar triangles', 'Same-shape triangles', 'Similar triangles'),
  'euclid.proof': labels('Proving a theorem', 'Explaining why a geometry rule holds', 'Theorem proofs'),
}

export const SKILL_LABELS: Readonly<Record<string, SkillLabels>> = { ...CONTENT_PACK_LABELS, ...NSC_LABELS }

/** The ten groups a tag's prefix names, in plain words, for `items.topic` and the library's search. */
export const SKILL_GROUP_LABELS: Readonly<Record<string, string>> = {
  algebra: 'Algebra',
  seq: 'Sequences and series',
  functions: 'Functions and graphs',
  finance: 'Financial mathematics',
  calc: 'Calculus',
  prob: 'Probability',
  stats: 'Statistics',
  geom: 'Analytical geometry',
  trig: 'Trigonometry',
  euclid: 'Euclidean geometry',
}

/** "Algebra" for `algebra.surd_equation`; the fallback words for an unknown prefix. */
export function skillGroupLabel(tag: string): string {
  const group = tag.split('.')[0] ?? tag
  return SKILL_GROUP_LABELS[group] ?? fallbackSkillLabel(group)
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
