// The lines that are Virginia Tax's own records, filled from a stand-in for those records.
//
// Form 760 Lines 20, 21 and 22 (estimated payments, last year's overpayment applied, extension
// payments) are things the state already holds. A state-run filer fills them from its books; this
// prototype fills them from resources/data/virginia-records.json, keyed by last name and date of
// birth, on any Virginia screen. The facts stay writable, so the filer can still correct them. If
// no record matches, the $0 placeholders stand.
import { factGraph, saveFactGraph } from '../vendor/form-builder/flow-runtime/js/fg-fact-graph.js'

const LINES = { estimatedPayments: '/vaEstimatedPayments', priorYearOverpaymentApplied: '/vaPriorYearOverpaymentApplied', extensionPayments: '/vaExtensionPayments' }
const read = (path) => { try { const r = factGraph.get(path); return r.hasValue ? r.get.toString() : null } catch { return null } }

async function apply () {
  if (!/\/your-taxes\/virginia\//.test(location.pathname)) return
  const key = `${read('/primaryFiler/lastName')}|${read('/primaryFiler/dateOfBirth')}`
  let records
  try { records = await (await fetch(new URL('../data/virginia-records.json', import.meta.url))).json() } catch { return }
  const record = records[key]
  if (!record) return
  let changed = false
  for (const [field, path] of Object.entries(LINES)) {
    const want = Number(record[field] || 0)
    if (Number(read(path) || 0) !== want) { factGraph.set(path, want.toFixed(2)); changed = true }
  }
  if (changed) { saveFactGraph(); document.dispatchEvent(new CustomEvent('fg-update')) }
}
apply()
