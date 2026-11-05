// Node-only helpers shared by server.mjs and check.mjs: where the files are, reading them, and
// loading the engine once.

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { buildSandboxXml, writableFacts } from './sandbox.js'

export const WORKBENCH = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
export const APP = path.resolve(WORKBENCH, '..')
export const RESOURCES = path.join(APP, 'src/main/resources/direct-file')
// A path as the page shows it: repository-relative where it can be, absolute for a copy elsewhere (WORKBENCH_FACTS_DIR).
export const shown = f => { const r = path.relative(APP, f); return r.startsWith('..') ? f : r }

// WORKBENCH_FACTS_DIR points the workbench at a copy of the facts directory, for trying it out
// without touching the real one.
export const FACTS_DIR = process.env.WORKBENCH_FACTS_DIR
  ? path.resolve(process.env.WORKBENCH_FACTS_DIR)
  : path.join(RESOURCES, 'facts')
export const ENGINE = path.join(RESOURCES, 'website-static/vendor/fact-graph/factgraph-3.1.0.js')
export const DATA_DIR = process.env.WORKBENCH_DATA_DIR
  ? path.resolve(process.env.WORKBENCH_DATA_DIR)
  : path.join(WORKBENCH, 'data')
export const EXAMPLES_FILE = process.env.WORKBENCH_EXAMPLES
  ? path.resolve(process.env.WORKBENCH_EXAMPLES)
  : path.join(WORKBENCH, 'examples/virginia.json')

export const FLOW_DIR = process.env.WORKBENCH_FLOW_DIR ? path.resolve(process.env.WORKBENCH_FLOW_DIR) : path.join(RESOURCES, 'flow')
// The Virginia fact modules: every facts/virginia*.xml, keyed by stem (virginiaConstants, virginiaIncome, …),
// in name order, which is the order Form Builder merges them in. A fact lives in exactly one of them.
export const FACT_FILES = Object.fromEntries(fs.readdirSync(FACTS_DIR).filter(f => /^virginia\w*\.xml$/.test(f)).sort().map(f => [f.slice(0, -4), path.join(FACTS_DIR, f)]))
export const FILES = {
  flow: path.join(FLOW_DIR, 'your-taxes-virginia.xml'),
  es: path.join(process.env.WORKBENCH_LOCALES_DIR ? path.resolve(process.env.WORKBENCH_LOCALES_DIR) : path.join(RESOURCES, 'locales'), 'virginia_es.yaml'),
}
export const FLOW_SCHEMA = [path.join(FLOW_DIR, 'FlowConfig.rng'), path.join(RESOURCES, 'flow/FlowConfig.rng')].find(f => fs.existsSync(f)) || null

/** The tax year the site is built for: /taxYear in the federal constants module. */
export function siteYear () {
  const f = path.join(FEDERAL_FACTS_DIR, 'constants.xml')
  if (fs.existsSync(f)) {
    const m = fs.readFileSync(f, 'utf8').match(/<Fact path="\/taxYear">[\s\S]*?<Int>(\d{4})<\/Int>/)
    if (m) return Number(m[1])
  }
  return 2024
}
// The schema the published file must fit. A copy of the facts directory may carry its own; the
// real one is the fallback.
export const SCHEMA = [path.join(FACTS_DIR, 'FactDictionaryModule.rng'), path.join(RESOURCES, 'facts/FactDictionaryModule.rng')].find(f => fs.existsSync(f)) || null
// The federal modules, for the export contract. A copy of the facts directory usually holds only
// the two Virginia files, so the real directory stands in for the federal ones then.
export const FEDERAL_FACTS_DIR = fs.existsSync(FACTS_DIR) && fs.readdirSync(FACTS_DIR).some(f => f.endsWith('.xml') && !f.startsWith('virginia') && f !== 'FactDictionaryModule.rng')
  ? FACTS_DIR
  : path.join(RESOURCES, 'facts')
export const LOCALES_DIR = process.env.WORKBENCH_LOCALES_DIR ? path.resolve(process.env.WORKBENCH_LOCALES_DIR) : path.join(RESOURCES, 'locales')

export const readJson = f => JSON.parse(fs.readFileSync(f, 'utf8'))

export function readSources () {
  return {
    facts: Object.fromEntries(Object.entries(FACT_FILES).map(([k, f]) => [k, fs.readFileSync(f, 'utf8')])),
    // The screens and their Spanish, when the workbench runs beside them; a copy of the facts alone has neither.
    flow: fs.existsSync(FILES.flow) ? fs.readFileSync(FILES.flow, 'utf8') : undefined,
    es: fs.existsSync(FILES.es) ? fs.readFileSync(FILES.es, 'utf8') : undefined,
    federal: readJson(path.join(WORKBENCH, 'federal-inputs.json')),
    examplesFile: readJson(EXAMPLES_FILE),
  }
}

export function schemaFor ({ facts, federal }) {
  return { federal, questions: Object.values(facts).flatMap(writableFacts) }
}

export function sandboxFor (src) {
  return buildSandboxXml(src)
}

let engine
export async function loadEngine () {
  engine ??= await import(pathToFileURL(ENGINE).href)
  return engine
}
