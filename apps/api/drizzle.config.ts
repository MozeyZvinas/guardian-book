import { defineConfig } from 'drizzle-kit'

// `pnpm db:generate` diffs src/db/schema.ts against the snapshot and writes a numbered SQL
// migration under drizzle/. Migrations are additive only (spec 03 §2). The URL is only
// read by drizzle-kit's push/studio commands, which this project does not use.
export default defineConfig({
  dialect: 'postgresql',
  schema: './src/db/schema.ts',
  out: './drizzle',
  casing: 'snake_case',
  strict: true,
  verbose: true,
  dbCredentials: {
    url: process.env['DATABASE_URL'] ?? 'postgres://guardian:guardian_dev_only@127.0.0.1:5433/guardian',
  },
})
