#!/usr/bin/env node
// Runs every worked example against the Virginia rules, the way CI would.
//
//   node workbench/check.mjs                      the rules as they are on disk
//   node workbench/check.mjs --change <id>        the rules with a workbench change applied
//
// Exits 1 when the rules do not load, the file does not fit its schema (when xmllint is there),
// Virginia reads a federal fact the sandbox has no stand-in for, or any example's expected answer
// is not what the rules produce. When scripts/lib/virginia-model.cjs exists, lines where that
// independent model disagrees with the engine are printed as warnings; they do not fail the run.

import path from 'node:path'
import { EditConflict, applyBaselineEdits, applyChange, applyExampleEdits } from './lib/xml-edit.js'
import { runExamples } from './lib/sandbox.js'
import { DATA_DIR, FLOW_SCHEMA, SCHEMA, loadEngine, readJson, readSources, sandboxFor, schemaFor } from './lib/node.mjs'
import { pages } from './lib/flow.js'
import { schemaError } from './lib/validate.mjs'
import { lineFacts } from './lib/reports.mjs'
import { oracleWarnings } from './lib/oracle.mjs'

const args = process.argv.slice(2)
const changeId = args.includes('--change') ? args[args.indexOf('--change') + 1] : null

const src = readSources()
let files = { virginia: src.virginia, localities: src.localities, flow: src.flow, es: src.es }
let examples = src.examplesFile.examples
let baseline = src.examplesFile.baseline
if (changeId) {
  const change = readJson(path.join(DATA_DIR, 'changes', `${changeId}.json`))
  try { files = applyChange(files, change) } catch (e) {
    if (e.code !== 'CONFLICT') throw e
    console.error(`FAIL conflict: ${e.message} Start a fresh draft from the current rules.`)
    process.exit(1)
  }
  examples = applyExampleEdits(examples, change)
  baseline = applyBaselineEdits(baseline, change)
  console.log(`With change #${change.id}: ${change.title}\n`)
}

for (const k of ['virginia', 'localities']) {
  const bad = schemaError(files[k], SCHEMA, k)
  if (bad) { console.error(`FAIL ${bad}`); process.exit(1) }
}
if (files.flow !== undefined && files.flow !== src.flow) {
  try { pages(files.flow) } catch (e) { console.error(`FAIL ${e.message}`); process.exit(1) }
  const bad = schemaError(files.flow, FLOW_SCHEMA, 'flow')
  if (bad) { console.error(`FAIL ${bad.replace('FactDictionaryModule.rng', 'FlowConfig.rng')}`); process.exit(1) }
}

let xml
try {
  xml = sandboxFor({ ...files, federal: src.federal })
} catch (e) {
  console.error(`FAIL ${e.message}`)
  if (e.code === 'UNKNOWN_FEDERAL') console.error('     Add each one to workbench/federal-inputs.json, with its type.')
  process.exit(1)
}

const fg = await loadEngine()
const schema = schemaFor({ ...files, federal: src.federal })
const run = runExamples(fg, xml, { examples, baseline }, schema, lineFacts(files.virginia).map(l => l.path))
if (run.error) { console.error(`FAIL ${run.error}`); process.exit(1) }

let failed = 0
for (const ex of examples) {
  const r = run.results[ex.id]
  if (r.pass) { console.log(`PASS ${ex.title}`); continue }
  failed++
  console.log(`FAIL ${ex.title}`)
  if (r.error) console.log(`     ${r.error}`)
  for (const f of r.failures) console.log(`     ${f.path}: expected ${f.expected}, the rules give ${f.actual ?? 'nothing (incomplete)'}`)
}
console.log(failed ? `\n${failed} of ${examples.length} examples fail` : `\nall ${examples.length} examples pass`)

let oracle = { available: false, warnings: [] }
try { oracle = oracleWarnings({ virginia: files.virginia, examples, baseline, results: run.results }) } catch (e) { console.log(`WARN the independent model could not run: ${e.message}`) }
if (oracle.error) console.log(`WARN ${oracle.error}`)
for (const w of oracle.warnings) console.log(`WARN ${w.title}: ${w.path} is ${w.engine} by the rules, ${w.model} by the independent model`)
if (oracle.available && !oracle.error && !oracle.warnings.length) console.log('the independent model agrees on every line it computes')
process.exit(failed ? 1 : 0)
