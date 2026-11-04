import { describe, expect, it } from 'vitest'
import {
  DEFAULT_META_BASE_URL,
  DEFAULT_META_MODEL,
  configuredFlags,
  describeConfig,
  loadConfig,
} from './config.js'

const fullEnv = {
  PORT: '9090',
  DATABASE_URL: 'postgres://u:p@127.0.0.1:5433/guardian',
  BETTER_AUTH_SECRET: 'test-secret-value-not-real',
  BETTER_AUTH_URL: 'http://localhost:8080',
  META_API_KEY: 'test-meta-key-not-real',
  META_BASE_URL: 'https://example.invalid/v1',
  META_MODEL: 'muse-spark-1.3',
  MODEL_DAILY_BUDGET_USD: '12.5',
  MODEL_USER_DAILY_CALLS: '40',
  BUCKET_ENDPOINT: 'https://bucket.example.invalid',
  BUCKET_NAME: 'guardian-book-test',
  BUCKET_ACCESS_KEY_ID: 'test-bucket-key-id',
  BUCKET_SECRET_ACCESS_KEY: 'test-bucket-secret-not-real',
  BUCKET_REGION: 'auto',
  SENTRY_DSN: 'https://public@sentry.example.invalid/1',
}

describe('loadConfig', () => {
  it('boots with zero env: nothing configured, nothing thrown', () => {
    const config = loadConfig({})
    expect(config.port).toBe(8080)
    expect(configuredFlags(config)).toEqual({
      db: false,
      auth: false,
      meta: false,
      bucket: false,
      sentry: false,
    })
    expect(config.meta.baseUrl).toBe(DEFAULT_META_BASE_URL)
    expect(config.meta.model).toBe(DEFAULT_META_MODEL)
    expect(config.meta.refusedModel).toBe(false)
    expect(config.notes).toEqual([])
  })

  it('reads the try-it group (B09) and defaults the cap to 6', () => {
    expect(loadConfig({}).tryIt).toEqual({ configured: false, classCode: null, userDailyCalls: 6 })
    const config = loadConfig({ PUBLIC_TRY_CLASS_CODE: 'ABCDEFGH', TRY_USER_DAILY_CALLS: '3' })
    expect(config.tryIt).toEqual({ configured: true, classCode: 'ABCDEFGH', userDailyCalls: 3 })
    expect(loadConfig({ TRY_USER_DAILY_CALLS: '0' }).tryIt.userDailyCalls).toBe(6)
    expect(loadConfig({ TRY_USER_DAILY_CALLS: '0' }).notes).toEqual(['TRY_USER_DAILY_CALLS: invalid value ignored'])
  })

  it('treats blank strings as unset', () => {
    const config = loadConfig({ DATABASE_URL: '   ', META_API_KEY: '', SENTRY_DSN: '' })
    expect(configuredFlags(config)).toEqual({
      db: false,
      auth: false,
      meta: false,
      bucket: false,
      sentry: false,
    })
  })

  it('marks every group configured when its variables are present', () => {
    const config = loadConfig(fullEnv)
    expect(config.port).toBe(9090)
    expect(configuredFlags(config)).toEqual({
      db: true,
      auth: true,
      meta: true,
      bucket: true,
      sentry: true,
    })
    expect(config.meta.dailyBudgetUsd).toBe(12.5)
    expect(config.meta.userDailyCalls).toBe(40)
    expect(config.meta.baseUrl).toBe('https://example.invalid/v1')
    expect(config.notes).toEqual([])
  })

  it('needs both auth variables and all five bucket variables', () => {
    const { BETTER_AUTH_URL: _url, BUCKET_REGION: _region, ...partial } = fullEnv
    const config = loadConfig(partial)
    expect(config.auth.configured).toBe(false)
    expect(config.bucket.configured).toBe(false)
  })

  it('refuses Contributor-tier model IDs (D24) without naming them', () => {
    const refusedId = 'muse-spark-1.3-Contributor'
    const config = loadConfig({ META_API_KEY: 'k', META_MODEL: refusedId })
    expect(config.meta.configured).toBe(false)
    expect(config.meta.refusedModel).toBe(true)
    expect(config.meta.model).toBe(DEFAULT_META_MODEL)
    expect(config.notes.some((note) => note.includes('D24'))).toBe(true)
    // The note explains the rule without repeating the configured value.
    expect(JSON.stringify(describeConfig(config))).not.toContain(refusedId)
  })

  it('ignores an invalid number instead of throwing', () => {
    const config = loadConfig({ PORT: 'eighty', MODEL_DAILY_BUDGET_USD: 'lots', META_API_KEY: 'k' })
    expect(config.port).toBe(8080)
    expect(config.meta.dailyBudgetUsd).toBeNull()
    expect(config.meta.configured).toBe(true)
    expect(config.notes).toEqual(['PORT: invalid value ignored', 'MODEL_DAILY_BUDGET_USD: invalid value ignored'])
  })

  it('describeConfig never includes a value', () => {
    const summary = JSON.stringify(describeConfig(loadConfig(fullEnv)))
    for (const value of Object.values(fullEnv)) {
      if (value === 'auto') continue // a plain word that could legitimately appear elsewhere
      expect(summary).not.toContain(value)
    }
    expect(summary).toContain('"configured"')
  })
})
