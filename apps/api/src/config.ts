import { z } from 'zod'

/**
 * Configuration (spec 03 §7), read once from env into named groups.
 *
 * Rules:
 * - Zero-env boot: nothing here throws. An unset or invalid variable leaves its group
 *   `configured: false` and adds a note; the app then shows a "not configured" state.
 * - Values are never logged. `describeConfig()` is the only thing the startup log prints.
 * - Standard model tier only (D24): a model ID ending in "-contributor" is refused.
 */

export const DEFAULT_PORT = 8080
export const DEFAULT_META_BASE_URL = 'https://api.meta.ai/v1'
export const DEFAULT_META_MODEL = 'muse-spark-1.3'
export const REFUSED_MODEL_SUFFIX = '-contributor'

const blankToUndefined = (value: unknown): unknown =>
  typeof value === 'string' && value.trim() === '' ? undefined : value

const optionalString = z.preprocess(blankToUndefined, z.string().trim().optional())
const optionalNumber = z.preprocess(blankToUndefined, z.coerce.number().finite().optional())
const optionalPositiveInt = z.preprocess(
  blankToUndefined,
  z.coerce.number().int().positive().optional(),
)

const envSchema = z.object({
  PORT: optionalPositiveInt,
  DATABASE_URL: optionalString,
  BETTER_AUTH_SECRET: optionalString,
  BETTER_AUTH_URL: optionalString,
  META_API_KEY: optionalString,
  META_BASE_URL: optionalString,
  META_MODEL: optionalString,
  MODEL_DAILY_BUDGET_USD: optionalNumber,
  MODEL_USER_DAILY_CALLS: optionalPositiveInt,
  BUCKET_ENDPOINT: optionalString,
  BUCKET_NAME: optionalString,
  BUCKET_ACCESS_KEY_ID: optionalString,
  BUCKET_SECRET_ACCESS_KEY: optionalString,
  BUCKET_REGION: optionalString,
  SENTRY_DSN: optionalString,
})

type Env = z.infer<typeof envSchema>

export interface DbConfig {
  configured: boolean
  url: string | null
}

export interface AuthConfig {
  configured: boolean
  secret: string | null
  url: string | null
}

export interface MetaConfig {
  configured: boolean
  apiKey: string | null
  baseUrl: string
  model: string
  dailyBudgetUsd: number | null
  userDailyCalls: number | null
  /** True when META_MODEL named a Contributor-tier model and was refused (D24). */
  refusedModel: boolean
}

export interface BucketConfig {
  configured: boolean
  endpoint: string | null
  name: string | null
  accessKeyId: string | null
  secretAccessKey: string | null
  region: string | null
}

export interface SentryConfig {
  configured: boolean
  dsn: string | null
}

export interface AppConfig {
  port: number
  db: DbConfig
  auth: AuthConfig
  meta: MetaConfig
  bucket: BucketConfig
  sentry: SentryConfig
  /** Problems found while reading env, in plain words. Never contain values. */
  notes: string[]
}

export type ConfigGroup = 'db' | 'auth' | 'meta' | 'bucket' | 'sentry'
export type ConfiguredFlags = Record<ConfigGroup, boolean>

function parseEnv(env: NodeJS.ProcessEnv): { values: Env; notes: string[] } {
  const first = envSchema.safeParse(env)
  if (first.success) return { values: first.data, notes: [] }

  // Drop each offending variable and parse again, so one bad value never blocks boot.
  const notes: string[] = []
  const copy: Record<string, unknown> = { ...env }
  for (const issue of first.error.issues) {
    const key = issue.path[0]
    if (typeof key === 'string' && key in copy) {
      notes.push(`${key}: invalid value ignored`)
      delete copy[key]
    }
  }
  const second = envSchema.safeParse(copy)
  return { values: second.success ? second.data : {}, notes }
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const { values, notes } = parseEnv(env)

  const requestedModel = values.META_MODEL ?? DEFAULT_META_MODEL
  const refusedModel = requestedModel.toLowerCase().endsWith(REFUSED_MODEL_SUFFIX)
  if (refusedModel) {
    notes.push('META_MODEL: refused, Contributor-tier model IDs are not allowed (D24)')
  }

  const bucket: BucketConfig = {
    configured: false,
    endpoint: values.BUCKET_ENDPOINT ?? null,
    name: values.BUCKET_NAME ?? null,
    accessKeyId: values.BUCKET_ACCESS_KEY_ID ?? null,
    secretAccessKey: values.BUCKET_SECRET_ACCESS_KEY ?? null,
    region: values.BUCKET_REGION ?? null,
  }
  bucket.configured = Boolean(
    bucket.endpoint && bucket.name && bucket.accessKeyId && bucket.secretAccessKey && bucket.region,
  )

  return {
    port: values.PORT ?? DEFAULT_PORT,
    db: {
      configured: Boolean(values.DATABASE_URL),
      url: values.DATABASE_URL ?? null,
    },
    auth: {
      configured: Boolean(values.BETTER_AUTH_SECRET && values.BETTER_AUTH_URL),
      secret: values.BETTER_AUTH_SECRET ?? null,
      url: values.BETTER_AUTH_URL ?? null,
    },
    meta: {
      configured: Boolean(values.META_API_KEY) && !refusedModel,
      apiKey: values.META_API_KEY ?? null,
      baseUrl: values.META_BASE_URL ?? DEFAULT_META_BASE_URL,
      model: refusedModel ? DEFAULT_META_MODEL : requestedModel,
      dailyBudgetUsd: values.MODEL_DAILY_BUDGET_USD ?? null,
      userDailyCalls: values.MODEL_USER_DAILY_CALLS ?? null,
      refusedModel,
    },
    bucket,
    sentry: {
      configured: Boolean(values.SENTRY_DSN),
      dsn: values.SENTRY_DSN ?? null,
    },
    notes,
  }
}

export function configuredFlags(config: AppConfig): ConfiguredFlags {
  return {
    db: config.db.configured,
    auth: config.auth.configured,
    meta: config.meta.configured,
    bucket: config.bucket.configured,
    sentry: config.sentry.configured,
  }
}

/** The startup summary. Safe to log: group names and flags only, never a value. */
export function describeConfig(config: AppConfig): { configured: ConfiguredFlags; notes: string[] } {
  return { configured: configuredFlags(config), notes: [...config.notes] }
}
