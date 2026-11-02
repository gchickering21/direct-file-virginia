// The lines that are Virginia Tax's own records, filled from a stand-in for those records.
//
// Form 760 Lines 20, 21 and 22 (estimated payments, last year's overpayment applied, extension
// payments) are things the state already holds. A state-run filer fills them from its books; this
// prototype fills them from resources/data/virginia-records.json, keyed by last name and date of
// birth, on any Virginia screen.
//
// Once per identity. The identity the stand-in was last applied for is kept in /vaRecordsKey; the
// three lines are written (the record's figures, or $0 when there is none) only when that key
// differs from the identity on the return, and never otherwise. So a correction the filer makes to
// them on the correct-records screen is kept, and a change of name or date of birth, which is a
// different person as far as the records go, is looked up afresh. /vaRecordsMatched says whether a
// record was found, for the card on the what-is-known screen.
import { factGraph, saveFactGraph } from '../vendor/form-builder/flow-runtime/js/fg-fact-graph.js'

const LINES = { estimatedPayments: '/vaEstimatedPayments', priorYearOverpaymentApplied: '/vaPriorYearOverpaymentApplied', extensionPayments: '/vaExtensionPayments' }
const read = (path) => { try { const r = factGraph.get(path); return r.hasValue ? r.get.toString() : null } catch { return null } }

async function apply () {
  if (!/\/your-taxes\/virginia\//.test(location.pathname)) return
  const lastName = read('/primaryFiler/lastName')
  const dateOfBirth = read('/primaryFiler/dateOfBirth')
  if (lastName === null || dateOfBirth === null) return
  const key = `${lastName}|${dateOfBirth}`
  if (read('/vaRecordsKey') === key) return
  let records
  try { records = await (await fetch(new URL('../data/virginia-records.json', import.meta.url))).json() } catch { return }
  // eslint-disable-next-line security/detect-object-injection -- a lookup by the identity key is the whole point
  const record = Object.hasOwn(records, key) ? records[key] : null
  for (const [field, path] of Object.entries(LINES)) {
    // eslint-disable-next-line security/detect-object-injection -- field is one of the three names above
    factGraph.set(path, Number(record ? record[field] || 0 : 0).toFixed(2))
  }
  factGraph.set('/vaRecordsMatched', record !== null)
  factGraph.set('/vaRecordsKey', key)
  saveFactGraph()
  document.dispatchEvent(new CustomEvent('fg-update'))
}
apply()
