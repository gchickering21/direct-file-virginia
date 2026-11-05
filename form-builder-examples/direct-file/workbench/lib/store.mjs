// The workflow's store: changes and requests as JSON files under data/, the people who can act, the
// audit trail, and the per-change lock. In a real deployment these are branches, pull requests,
// accounts and an issue tracker; here they are local files, one per change.

import fs from 'node:fs'
import path from 'node:path'
import { DATA_DIR, WORKBENCH, readJson } from './node.mjs'

const dir = kind => path.join(DATA_DIR, kind)
for (const k of ['changes', 'requests']) fs.mkdirSync(dir(k), { recursive: true })
export const AUDIT_FILE = path.join(DATA_DIR, 'audit.jsonl')

export const people = () => readJson(path.join(WORKBENCH, 'data/people.json')).people
export const person = id => people().find(p => p.id === id)
export const list = kind => fs.readdirSync(dir(kind)).filter(f => /^\d+\.json$/.test(f)).map(f => readJson(path.join(dir(kind), f))).sort((a, b) => a.id - b.id)
export const load = (kind, id) => { const f = path.join(dir(kind), `${Number(id)}.json`); return fs.existsSync(f) ? readJson(f) : null }
export const save = (kind, obj) => fs.writeFileSync(path.join(dir(kind), `${obj.id}.json`), JSON.stringify(obj, null, 2) + '\n')
export const nextId = kind => Math.max(0, ...list(kind).map(x => x.id)) + 1
export const now = () => new Date().toISOString()
export const OPEN = ['draft', 'review', 'approved']

export class HttpError extends Error { constructor (status, message, extra) { super(message); this.status = status; this.extra = extra } }

// One thing at a time per change, and one publish at a time: load → check → save must not
// interleave with another request's, or two writes race for the same file.
const locks = new Map()
export async function withLock (key, fn) {
  const prev = locks.get(key) || Promise.resolve()
  let release
  const mine = new Promise(resolve => { release = resolve })
  const chain = prev.then(() => mine)
  locks.set(key, chain)
  await prev
  try { return await fn() } finally {
    release()
    if (locks.get(key) === chain) locks.delete(key)
  }
}

export function audit (entry) {
  fs.appendFileSync(AUDIT_FILE, JSON.stringify(entry) + '\n')
}

export function auditEntries (n = 20) {
  if (!fs.existsSync(AUDIT_FILE)) return []
  return fs.readFileSync(AUDIT_FILE, 'utf8').split('\n').filter(Boolean).map(l => { try { return JSON.parse(l) } catch { return null } }).filter(Boolean).slice(-n).reverse()
}

