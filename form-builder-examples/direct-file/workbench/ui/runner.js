// Running the worked examples: the worker that loads a dictionary and runs every example off the
// main thread, the cache of runs keyed on the files' text, and the "impact" of the active draft
// (published versus draft results), repainted into whichever panels are on screen.

import { buildModel } from './model.js'
import { writableFacts } from '/lib/sandbox.js'
import { applyBaselineEdits, applyExampleEdits } from '/lib/xml-edit.js'
import { activeChange, draftFiles, published } from './draft.js'
import { $, S } from './state.js'
import { examplesTable } from './views/examples.js'
import { ruleChecksBody } from './views/rule.js'
import { impactPanelBody } from './views/values.js'

const worker = new Worker('/ui/worker.js', { type: 'module' })
let runSeq = 0
worker.onmessage = ({ data }) => { const p = S.pending.get(data.id); if (p) { S.pending.delete(data.id); p(data) } }
// A worker that fails to load (the engine missing, a syntax error) never answers: settle every
// waiting run with the error, so the panels show it instead of "recalculating" for ever.
worker.onerror = e => {
  const error = `The example runner failed: ${e.message || 'the worker could not start'}${e.filename ? ` (${e.filename.split('/').pop()}:${e.lineno})` : ''}`
  for (const [id, p] of S.pending) { S.pending.delete(id); p({ id, error }) }
  S.runs.clear()
  if (e.preventDefault) e.preventDefault()
}

function outputsFor (files) {
  const m = buildModel({ ...files, federal: S.data.federal, year: S.year })
  return [...m.facts.values()].filter(f => f.line && f.kind !== 'asked' && f.kind !== 'options').map(f => f.path)
}

export function run (files, examples, baseline = S.data.examplesFile.baseline) {
  // The whole text is the key: a dozen entries of a 70 KB file is nothing, and a hash could collide.
  const key = `${Object.keys(files.facts).sort().map(k => files.facts[k]).join('\0')}\0${JSON.stringify(examples)}\0${JSON.stringify(baseline)}`
  if (S.runs.has(key)) return S.runs.get(key)
  const id = ++runSeq
  const schema = { federal: S.data.federal, questions: Object.values(files.facts).flatMap(writableFacts) }
  const p = new Promise(resolve => {
    S.pending.set(id, resolve)
    worker.postMessage({ id, files: { facts: files.facts }, federal: S.data.federal, examples, baseline, schema, outputs: outputsFor(files) })
  })
  p.then(r => { if (r.error && !r.results) S.runs.delete(key) })
  S.runs.set(key, p)
  if (S.runs.size > 12) S.runs.delete(S.runs.keys().next().value)
  return p
}

let impactTimer
export function scheduleImpact () {
  clearTimeout(impactTimer)
  impactTimer = setTimeout(computeImpact, 350)
}

export async function computeImpact () {
  const c = activeChange()
  const baseExamples = S.data.examplesFile.examples
  const base = await run(published(), baseExamples)
  if (!c) { S.impact = { base, change: null }; paintImpact(); return }
  const { files, conflict } = draftFiles(c)
  const examples = applyExampleEdits(baseExamples, c)
  S.impact = { base, change: c, conflict, pending: true, examples }
  paintImpact()
  const draft = await run(files, examples, applyBaselineEdits(S.data.examplesFile.baseline, c))
  if (S.impact.change !== c) return
  S.impact = { base, draft, change: c, conflict, examples }
  paintImpact()
}

/** Per example: the lines whose value differs between published and draft. */
export function differences (base, draft, examples) {
  const out = []
  for (const ex of examples) {
    const a = base.results?.[ex.id]?.values || {}
    const b = draft.results?.[ex.id]?.values || {}
    const lines = Object.keys(b).filter(p => ex.id in (base.results || {}) && String(a[p]) !== String(b[p]))
    if (lines.length || !(ex.id in (base.results || {}))) out.push({ ex, lines, before: a, after: b })
  }
  return out
}


export function paintImpact () {
  const p = $('#impact-panel')
  if (p) p.innerHTML = impactPanelBody()
  const t = $('#examples-table')
  if (t) t.outerHTML = examplesTable()
  const chk = $('#rule-checks')
  if (chk) chk.innerHTML = ruleChecksBody()
}
