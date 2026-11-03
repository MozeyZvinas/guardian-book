import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { META_MAX_SCHEMA_DEPTH, SchemaNotStrictError, strictSubsetProblems, toStrictJsonSchema } from './jsonSchema.js'

describe('toStrictJsonSchema', () => {
  it('exports a closed object with every key required and strict: true', () => {
    const out = toStrictJsonSchema('demo', z.strictObject({ a: z.string().nullable(), b: z.number().int() }))
    expect(out.strict).toBe(true)
    expect(out.name).toBe('demo')
    expect(out.schema['additionalProperties']).toBe(false)
    expect(out.schema['required']).toEqual(['a', 'b'])
    expect(out.schema).not.toHaveProperty('$schema')
    const b = (out.schema['properties'] as Record<string, Record<string, unknown>>)['b']
    expect(b).not.toHaveProperty('maximum') // the safe-integer bound Zod adds is dropped
  })

  it('rejects optional keys: the strict subset needs every key in required', () => {
    expect(() => toStrictJsonSchema('bad', z.strictObject({ a: z.string().optional() }))).toThrow(SchemaNotStrictError)
  })

  it('rejects a non-object root', () => {
    expect(() => toStrictJsonSchema('bad', z.array(z.string()))).toThrow(/root must be a plain object/)
  })

  it('rejects recursion', () => {
    interface Node {
      children: Node[]
    }
    const node: z.ZodType<Node> = z.lazy(() => z.strictObject({ children: z.array(node) }))
    expect(() => toStrictJsonSchema('bad', z.strictObject({ root: node }))).toThrow()
  })

  it('rejects nesting deeper than 10 levels', () => {
    let leaf: z.ZodType = z.string()
    for (let i = 0; i < META_MAX_SCHEMA_DEPTH + 1; i += 1) leaf = z.strictObject({ n: leaf })
    expect(() => toStrictJsonSchema('deep', leaf)).toThrow(/nesting deeper/)
  })

  it('lists problems on a hand-written schema that is open', () => {
    const problems = strictSubsetProblems({
      type: 'object',
      properties: { a: { type: 'string' }, b: { type: 'object', properties: { c: { type: 'string' } } } },
      required: ['a'],
    })
    expect(problems).toEqual([
      '$: additionalProperties must be false',
      '$.b: must be required (use .nullable(), not .optional())',
      '$.b: additionalProperties must be false',
      '$.b.c: must be required (use .nullable(), not .optional())',
    ])
  })
})
