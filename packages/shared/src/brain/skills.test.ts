import { describe, expect, it } from 'vitest'
import { KNOWN_SKILL_TAGS, SKILL_AUDIENCES, SKILL_LABELS, fallbackSkillLabel, isKnownSkill, skillGroupLabel, skillLabel, skillLabels } from './skills.js'

describe('skill labels', () => {
  it('covers the eighteen content-pack tags and the fifty NSC tags with three non-empty wordings each', () => {
    expect(KNOWN_SKILL_TAGS).toHaveLength(18 + 50)
    expect(KNOWN_SKILL_TAGS.slice(0, 18)).toContain('algebra.factorising')
    expect(new Set(KNOWN_SKILL_TAGS).size).toBe(KNOWN_SKILL_TAGS.length)
    for (const tag of KNOWN_SKILL_TAGS) {
      for (const audience of SKILL_AUDIENCES) {
        const label = skillLabel(tag, audience)
        expect(label.length).toBeGreaterThan(0)
        expect(label).not.toBe(tag)
        expect(label).not.toMatch(/[._]/) // never a raw tag
      }
    }
    expect(SKILL_LABELS['algebra.factorising']).toEqual({
      learner: 'Factorising into two brackets',
      guardian: 'Factorising (splitting an expression into two brackets)',
      teacher: 'Factorising trinomials',
    })
  })

  it('turns any unknown tag into plain words', () => {
    expect(fallbackSkillLabel('factorise-trinomial')).toBe('Factorise trinomial')
    expect(fallbackSkillLabel('calc.chain_rule')).toBe('Chain rule')
    expect(fallbackSkillLabel('nature-of-roots')).toBe('Nature of roots')
    expect(fallbackSkillLabel('')).toBe('Skill')
    expect(skillLabel('solve-quadratic-by-factors', 'guardian')).toBe('Solve quadratic by factors')
    expect(isKnownSkill('solve-quadratic-by-factors')).toBe(false)
    expect(skillLabels('discriminant')).toEqual({ learner: 'Discriminant', guardian: 'Discriminant', teacher: 'Discriminant' })
  })

  it('names the group of every NSC tag in plain words', () => {
    expect(skillGroupLabel('algebra.surd_equation')).toBe('Algebra')
    expect(skillGroupLabel('euclid.proof')).toBe('Euclidean geometry')
    expect(skillGroupLabel('unknown-thing')).toBe('Unknown thing')
    for (const tag of KNOWN_SKILL_TAGS) expect(skillGroupLabel(tag)).not.toMatch(/[._]/)
  })
})
