#!/usr/bin/env node
/**
 * Apply Front Desk SQL migration.
 * Requires DATABASE_URL or SUPABASE_DB_PASSWORD (Postgres password — not the service_role JWT).
 * Usage:
 *   SUPABASE_DB_PASSWORD=... node scripts/apply-migration.mjs
 *   DATABASE_URL=postgres://... node scripts/apply-migration.mjs
 */
import 'dotenv/config'
import fs from 'node:fs'
import path from 'node:path'
import pg from 'pg'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.join(__dirname, '..')
const sqlPath = path.join(root, 'supabase/migrations/20251101000000_init_frontdesk.sql')

function buildConnectionString() {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL
  const password = process.env.SUPABASE_DB_PASSWORD
  const url = process.env.SUPABASE_URL
  if (!password || !url) return null
  const ref = new URL(url).hostname.split('.')[0]
  // Direct DB host
  return `postgresql://postgres:${encodeURIComponent(password)}@db.${ref}.supabase.co:5432/postgres`
}

const cs = buildConnectionString()
if (!cs) {
  console.error('Missing DATABASE_URL or SUPABASE_DB_PASSWORD. Service role JWT cannot run DDL.')
  process.exit(2)
}

const sql = fs.readFileSync(sqlPath, 'utf8')
const client = new pg.Client({ connectionString: cs, ssl: { rejectUnauthorized: false } })
await client.connect()
try {
  await client.query('begin')
  await client.query(sql)
  await client.query('commit')
  const tables = await client.query(`
    select tablename from pg_tables
    where schemaname='public'
      and tablename in ('owners','owner_codes','owner_clients','owner_tasks','owner_task_assignments','owner_email_campaigns')
    order by 1`)
  console.log('applied_ok tables', tables.rows.map(r => r.tablename).join(','))
  const rls = await client.query(`
    select c.relname, c.relrowsecurity
    from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='public'
      and c.relname in ('owners','owner_codes','owner_clients','owner_tasks','owner_task_assignments','owner_email_campaigns')
    order by 1`)
  for (const row of rls.rows) console.log('rls', row.relname, row.relrowsecurity)
} catch (e) {
  await client.query('rollback')
  console.error('apply_failed', e.message)
  process.exit(1)
} finally {
  await client.end()
}
