import { describe, expect, it } from 'vitest'
import {
  DEFAULT_LOCAL_DATABASE_URL,
  assertLoopbackDatabaseUrl,
  integrationDatabaseUrl,
  isLoopbackDatabaseUrl,
} from './harness.js'

describe('integration harness', () => {
  it('refuses any non-loopback database host', () => {
    const hosted = [
      'postgres://u:p@containers-us-west-1.railway.app:5432/railway',
      'postgres://u:p@postgres.railway.internal:5432/railway',
      'postgres://u:p@db.example.com/x',
      'postgres://u:p@10.0.0.5:5432/x',
      'postgres://u:p@192.168.1.20:5432/x',
      'postgres://u:p@localhost.evil.example:5432/x',
    ]
    for (const url of hosted) {
      expect(isLoopbackDatabaseUrl(url)).toBe(false)
      expect(() => assertLoopbackDatabaseUrl(url)).toThrow(/refuse/)
      expect(() => integrationDatabaseUrl({ DATABASE_URL: url })).toThrow(/refuse/)
    }
  })

  it('accepts loopback hosts in every spelling', () => {
    for (const url of [
      DEFAULT_LOCAL_DATABASE_URL,
      'postgres://u:p@localhost:5432/x',
      'postgres://u:p@127.0.0.1:5432/x',
      'postgres://u:p@[::1]:5432/x',
      'postgresql://u:p@LOCALHOST/x',
    ]) {
      expect(assertLoopbackDatabaseUrl(url)).toBe(url)
    }
  })

  it('falls back to the docker compose URL when DATABASE_URL is unset', () => {
    expect(integrationDatabaseUrl({})).toBe(DEFAULT_LOCAL_DATABASE_URL)
  })

  it('refuses garbage', () => {
    expect(() => assertLoopbackDatabaseUrl('not a url')).toThrow(/refuse/)
  })
})
