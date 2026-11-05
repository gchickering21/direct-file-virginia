// Shared state and the small helpers every part of the page uses: `S`, the one object the views
// read and write; the DOM and escaping helpers; who the person is; the server calls; the toast.
// Nothing here knows about any view.

import { published } from './draft.js'
import { route } from './shell.js'

export const S = {
  data: null,
  model: null,
  draftModel: null, // the model with the active draft applied: new questions show up in pickers
  me: localStorage.getItem('wb-me') || 'mt',
  year: Number(localStorage.getItem('wb-year')) || null,
  route: [],
  rule: {}, // path → { tree, because, tab, xmlText, xmlError }
  runs: new Map(),
  pending: new Map(),
  impact: null,
  impactFor: null,
  filter: 'all',
}

export const $ = sel => document.querySelector(sel)
export const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
// Escaped text with each "§ 58.1-3xx" linked to the Code of Virginia. Chapter 3 of Title 58.1 is
// the income tax (§§ 58.1-300 to 58.1-3xx); other chapters are left as text.
const STATUTE_RE = /\b58\.1-(3\d\d(?:\.\d+)?)\b/g
export const cite = s => esc(s).replace(STATUTE_RE, (m, sec) => `<a class="statute" href="https://law.lis.virginia.gov/vacode/title58.1/chapter3/section58.1-${sec}/" target="_blank" rel="noopener">${m}</a>`)
export const me = () => S.data.people.find(p => p.id === S.me) || S.data.people[0]
export const personName = id => S.data.people.find(p => p.id === id)?.name || id
export const ROLE = { 'policy-author': 'Policy author', 'policy-reviewer': 'Policy reviewer', engineer: 'Engineer', translator: 'Translator' }
export const STATUS = { draft: ['Draft', 'warn'], review: ['In review', 'blue'], approved: ['Approved', 'ok'], published: ['Published', ''], discarded: ['Discarded', ''] }
// The read-only copy: workbench/snapshot.mjs writes the page and every GET answer as files, for a
// static host (docs/hosting.md). The page it writes sets window.WB_STATIC; then reads come from
// those files, nothing can be edited, and a write is refused here before it is attempted.
export const STATIC = typeof window !== 'undefined' && window.WB_STATIC ? window.WB_STATIC : null
export const canEdit = () => !STATIC && ['policy-author', 'engineer'].includes(me().role)

const STATIC_READS = [[/^\/api\/state$/, () => 'api/state.json'], [/^\/api\/reports\/(\w+)$/, m => `api/reports/${m[1]}.json`], [/^\/api\/changes\/(\d+)\/verify$/, m => `api/changes/${m[1]}/verify.json`]]
export const READ_ONLY_MESSAGE = 'This is the read-only copy of the Workbench: nothing can be saved here. To make a change, run it on your own machine: make workbench.'

export async function api (method, url, body) {
  if (STATIC) {
    if (method !== 'GET') throw new Error(READ_ONLY_MESSAGE)
    let file
    for (const [re, to] of STATIC_READS) { const m = url.match(re); if (m) { file = to(m); break } }
    if (!file) throw new Error(`The read-only copy has no ${url}.`)
    const res = await fetch(file)
    const json = await res.json().catch(() => ({}))
    if (!res.ok || json.error) { const e = new Error(json.error || res.statusText); e.extra = json; throw e }
    return json
  }
  // X-Workbench marks the call as the page's own; the server refuses a write without it.
  const res = await fetch(url, { method, headers: { 'content-type': 'application/json', 'x-workbench': '1' }, body: body ? JSON.stringify({ by: S.me, ...body }) : undefined })
  const json = await res.json().catch(() => ({}))
  if (!res.ok) { const e = new Error(json.error || res.statusText); e.extra = json; throw e }
  return json
}

export function toast (msg, bad) {
  const t = $('#toast')
  t.textContent = msg
  t.className = bad ? 'bad' : ''
  t.hidden = false
  clearTimeout(toast.t)
  toast.t = setTimeout(() => { t.hidden = true }, bad ? 7000 : 3500)
}

export function validAmount (tag, v) {
  if (tag === 'Rational') return /^\d+\/\d+$/.test(v) || /^\d*\.?\d+$/.test(v)
  return /^-?\d+(\.\d+)?$/.test(v.replace(/[$,]/g, ''))
}
export function normalizeAmount (tag, v) {
  v = v.replace(/[$,\s]/g, '')
  if (tag === 'Rational' && !v.includes('/')) {
    const dec = (v.split('.')[1] || '').length
    const den = 10 ** dec
    return `${Math.round(Number(v) * den)}/${den}`
  }
  if (tag === 'Int') return String(Math.round(Number(v)))
  return v
}

/** A literal as a number: a fraction like 575/10000, or a decimal. */
export const fractionValue = v => (String(v).includes('/') ? Number(v.split('/')[0]) / Number(v.split('/')[1]) : Number(v))

export function setYear (y) { S.year = y; localStorage.setItem('wb-year', y) }
