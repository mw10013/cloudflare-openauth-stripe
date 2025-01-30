import { $, glob } from 'zx'

/**
 * Reset the local d1 database violently.
 * Run any migrations and seed.
 */

await $`rm -rf ./.wrangler`

// Create db.
// await $`pnpm wrangler d1 execute d1-local --local --command "select datetime('now');"`;
// https://github.com/cloudflare/workers-sdk/issues/5092
await $`pnpm wrangler d1 execute d1-local --local --command "pragma foreign_keys = ON;"`

const migrationFiles = await glob('./migrations/*.sql')
console.log({ migrationFiles })
if (migrationFiles.length > 0) {
  await $`wrangler d1 migrations apply d1-local --local`
  // await $`pnpm d1:seed`
}

const sqliteFiles = await glob('./.wrangler/state/v3/d1/**/*.sqlite')
console.log({ sqliteFiles })
if (sqliteFiles.length !== 1) {
  console.error('Expected exactly one sqlite file under .wrangler')
  process.exit(1)
}

const statements = `
.schema
pragma table_list`
await $`echo ${statements} | sqlite3 ${sqliteFiles[0]}`

console.log(`sqlite3 ${sqliteFiles[0]}`)