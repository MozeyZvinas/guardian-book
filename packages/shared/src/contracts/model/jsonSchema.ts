import { z } from 'zod'

/**
 * Turns a Zod contract into the JSON schema sent to Meta as `response_format.json_schema`,
 * and proves it fits the strict subset before any call is made.
 *
 * Meta, "Structured output" (https://dev.meta.ai/docs/structured-output), read 3 Nov 2026:
 * - "Set `strict: true` to require that the server validates your schema against the
 *   strict subset."
 * - "`additionalProperties`: every object must set `additionalProperties: false`."
 * - "`required`: an object's `required` array must list every key in its `properties`."
 * - Nesting depth: 10 levels. "Recursive schemas aren't supported." (HTTP 400 otherwise.)
 * - Root must be a plain object (no top-level anyOf, oneOf, allOf, enum or not).
 *
 * Zod 4's `toJSONSchema` already emits closed objects with a full `required` list; this
 * module checks that rather than trusting it, so a contract written with `.optional()` or
 * `z.object()` fails here, in a unit test, not at the API.
 */

export const META_MAX_SCHEMA_DEPTH = 10

export interface StrictJsonSchema {
  name: string
  schema: Record<string, unknown>
  strict: true
}

export class SchemaNotStrictError extends Error {
  override readonly name = 'SchemaNotStrictError'
  constructor(
    readonly schemaName: string,
    readonly problems: readonly string[],
  ) {
    super(`JSON schema "${schemaName}" is outside Meta's strict subset: ${problems.join('; ')}`)
  }
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

/** Removes keys that add nothing and that a strict validator might not accept. */
function tidy(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(tidy)
  if (!isRecord(node)) return node
  const out: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(node)) {
    if (key === '$schema') continue
    // Zod adds safe-integer bounds to every `.int()`; they are noise to the model.
    if (key === 'maximum' && value === Number.MAX_SAFE_INTEGER) continue
    if (key === 'minimum' && value === Number.MIN_SAFE_INTEGER) continue
    out[key] = tidy(value)
  }
  return out
}

/** Walks a JSON schema and lists everything outside the strict subset. */
export function strictSubsetProblems(schema: Record<string, unknown>): string[] {
  const problems: string[] = []
  const rootForbidden = ['anyOf', 'oneOf', 'allOf', 'enum', 'not']
  if (schema['type'] !== 'object') problems.push('root must be a plain object')
  for (const key of rootForbidden) {
    if (key in schema) problems.push(`root must not use ${key}`)
  }

  const walk = (node: unknown, path: string, depth: number): void => {
    if (Array.isArray(node)) {
      node.forEach((item, index) => walk(item, `${path}[${index}]`, depth))
      return
    }
    if (!isRecord(node)) return
    if (depth > META_MAX_SCHEMA_DEPTH) {
      problems.push(`${path}: nesting deeper than ${META_MAX_SCHEMA_DEPTH}`)
      return
    }
    if ('$ref' in node) problems.push(`${path}: $ref is not allowed (no recursion or reuse)`)
    if (node['type'] === 'object' || isRecord(node['properties'])) {
      if (node['additionalProperties'] !== false) problems.push(`${path}: additionalProperties must be false`)
      const properties = isRecord(node['properties']) ? Object.keys(node['properties']) : []
      const required = Array.isArray(node['required']) ? node['required'].map(String) : []
      for (const key of properties) {
        if (!required.includes(key)) problems.push(`${path}.${key}: must be required (use .nullable(), not .optional())`)
      }
    }
    for (const [key, value] of Object.entries(node)) {
      if (key === 'properties' && isRecord(value)) {
        for (const [prop, sub] of Object.entries(value)) walk(sub, `${path}.${prop}`, depth + 1)
      } else if (key === 'items' || key === 'prefixItems' || key === 'anyOf' || key === 'oneOf' || key === 'allOf') {
        walk(value, `${path}.${key}`, depth + 1)
      } else if (key === '$defs' || key === 'definitions') {
        problems.push(`${path}: ${key} is not allowed (schemas must inline)`)
      }
    }
  }
  walk(schema, '$', 1)
  return problems
}

/**
 * Exports a contract as `{name, schema, strict: true}` for `response_format.json_schema`.
 * Throws `SchemaNotStrictError` when the contract is outside the strict subset.
 */
export function toStrictJsonSchema(name: string, contract: z.ZodType): StrictJsonSchema {
  const generated = z.toJSONSchema(contract, {
    target: 'draft-2020-12',
    io: 'output',
    unrepresentable: 'throw',
    cycles: 'throw',
    reused: 'inline',
  })
  const schema = tidy(generated)
  if (!isRecord(schema)) throw new SchemaNotStrictError(name, ['generated schema is not an object'])
  const problems = strictSubsetProblems(schema)
  if (problems.length > 0) throw new SchemaNotStrictError(name, problems)
  return { name, schema, strict: true }
}
