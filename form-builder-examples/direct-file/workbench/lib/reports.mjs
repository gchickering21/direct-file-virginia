// The read-only reports: which Form 760 lines the rules cover, which federal facts Virginia reads
// and whether the federal dictionary exports them, and which Virginia screens have Spanish. All
// derived from the files at request time, none from a hard-coded list.

import fs from 'node:fs'
import path from 'node:path'
import { scanFacts } from './sandbox.js'

const clean = s => String(s || '').replace(/\s+/g, ' ').trim()
const nameOf = body => clean((body.match(/<Name>([\s\S]*?)<\/Name>/) || [])[1])
const descOf = body => clean((body.match(/<Description>([\s\S]*?)<\/Description>/) || [])[1])

export const LINE_RE = /Form 760 (?:Lines? )?(\d+)([a-z]?)/
const ADJ_RE = /Schedule ADJ (?:Line|code) (\d+[a-z]?)/i

/** The facts that are Form 760 lines or Schedule ADJ items, from their <Name>. `facts` is the map of modules (or one module's text). */
export function lineFacts (facts) {
  const out = []
  const xmls = typeof facts === 'string' ? [facts] : Object.keys(facts).sort().map(k => facts[k])
  for (const f of xmls.flatMap(scanFacts)) {
    const name = nameOf(f.body)
    const line = name.match(LINE_RE)
    const adj = name.match(ADJ_RE)
    if (!line && !adj) continue
    const derived = /<Derived>/.test(f.body)
    const writable = /<Writable>/.test(f.body)
    const placeholder = /<Placeholder>/.test(f.body)
    out.push({
      path: f.path,
      name,
      form: line ? 'Form 760' : 'Schedule ADJ',
      line: line ? line[1] + line[2] : adj[1],
      sort: line ? Number(line[1]) + (line[2] ? (line[2].charCodeAt(0) - 96) / 100 : 0) : 100 + parseFloat(adj[1]),
      status: derived ? 'modelled' : writable && placeholder ? 'records stand-in' : writable ? 'filer question' : 'other',
      citation: (descOf(f.body).match(/§§? ?[\d.]+-[\d.:]+(?:\([A-Za-z0-9]+\))*/) || [''])[0],
    })
  }
  return out.sort((a, b) => a.sort - b.sort || a.path.localeCompare(b.path))
}

/** Each line, how many worked examples assert on it, and the ones none does. */
export function coverage (facts, examples) {
  const lines = lineFacts(facts).map(l => ({ ...l, examples: examples.filter(x => x.expect && l.path in x.expect).map(x => x.id) }))
  const numbers = new Set(lines.filter(l => l.form === 'Form 760').map(l => parseInt(l.line, 10)))
  const max = Math.max(0, ...numbers)
  const noFact = []
  for (let n = 1; n <= max; n++) if (!numbers.has(n)) noFact.push(n)
  const counts = {}
  for (const l of lines) counts[l.status] = (counts[l.status] || 0) + 1
  return {
    lines,
    counts,
    uncovered: lines.filter(l => l.examples.length === 0 && l.status === 'modelled').map(l => l.path),
    noFact,
    examples: examples.length,
  }
}

// ---------------------------------------------------------------------------------------------
// The export contract: what scripts/check-virginia-exports.py checks, as a page

const ALLOWED_GATES = new Set(['/filerResidenceAndIncomeState'])

/** Every (module, path) in the federal dictionary with its <Export …/> attributes and declared type. */
export function federalFacts (federalDir) {
  const flags = new Map()
  if (!federalDir || !fs.existsSync(federalDir)) return flags
  for (const file of fs.readdirSync(federalDir)) {
    if (!file.endsWith('.xml') || file.startsWith('virginia')) continue
    const xml = fs.readFileSync(path.join(federalDir, file), 'utf8')
    const stem = file.slice(0, -4)
    for (const m of xml.matchAll(/<Fact path="([^"]+)"(.*?)<\/Fact>/gs)) {
      const ex = m[2].match(/<Export([^/]*)\/>/)
      const w = m[2].match(/<Writable>\s*<(\w+)/)
      const d = m[2].match(/<Derived>\s*(?:<!--[\s\S]*?-->\s*)?<(Dollar|Int|Rational|Boolean|Day|String|Enum|EnumOptions|Collection)\b/)
      flags.set(`${stem}:${m[1]}`, { attrs: ex ? ex[1].trim() : '', type: w ? w[1].toLowerCase() : d ? d[1].toLowerCase() : null })
    }
  }
  return flags
}

const TYPE_ALIAS = { boolean: 'boolean', dollar: 'dollar', day: 'day', enum: 'enum', int: 'int', string: 'string' }

export function exportContract ({ facts, federal, federalDir }) {
  const flags = federalFacts(federalDir)
  const standIn = new Map(federal.inputs.map(i => [i.path, i]))
  const seen = new Map()
  for (const [file, xml] of Object.entries(facts).sort(([a], [b]) => a.localeCompare(b))) {
    for (const m of xml.matchAll(/<Dependency module="([^"]+)" path="([^"]+)"/g)) {
      const [, module, p] = m
      if (module.startsWith('virginia')) continue
      const key = `${module}:${p}`
      if (!seen.has(key)) seen.set(key, { module, path: p, files: new Set() })
      seen.get(key).files.add(file)
    }
  }
  const rows = [...seen.values()].sort((a, b) => a.module.localeCompare(b.module) || a.path.localeCompare(b.path)).map(d => {
    const lookup = d.path.startsWith('/primaryFiler/') ? d.path.replace('/primaryFiler/', '/filers/*/') : d.path
    const fed = flags.get(`${d.module}:${lookup}`)
    const gate = ALLOWED_GATES.has(d.path)
    const exported = !!fed && (/stateSystems="true"/.test(fed.attrs) || /mef="true"/.test(fed.attrs))
    const s = standIn.get(d.path)
    const sandboxType = s ? (s.type === 'count' ? 'boolean (per item)' : s.type === 'dollarList' ? 'dollar (per item)' : s.type) : null
    const fedType = fed?.type ? TYPE_ALIAS[fed.type] || fed.type : null
    const problems = []
    if (!flags.size) { /* no federal dictionary beside the copy: say nothing about exports */ } else if (!fed) problems.push('not in the federal dictionary')
    else if (!exported && !gate) problems.push(`not exported to states (${fed.attrs || 'no <Export>'})`)
    if (!s) problems.push('no sandbox stand-in in federal-inputs.json')
    else if (s.module && s.module !== d.module) problems.push(`stand-in says module ${s.module}`)
    if (s && fedType && sandboxType && !sandboxType.startsWith(fedType) && !(fedType === 'collection')) problems.push(`federal type ${fedType}, stand-in ${sandboxType}`)
    return {
      module: d.module, path: d.path, files: [...d.files], gate,
      found: !!fed, exported, exportAttrs: fed ? fed.attrs : null, federalType: fedType,
      standIn: s ? { type: s.type, label: s.label, source: s.source } : null,
      problems,
    }
  })
  const used = new Set(rows.map(r => r.path))
  const unused = federal.inputs.filter(i => !used.has(i.path)).map(i => i.path)
  return { rows, unused, federalDictionary: flags.size > 0, gates: [...ALLOWED_GATES] }
}

// ---------------------------------------------------------------------------------------------
// Spanish: the Virginia flow's keys in flow_en.yaml against virginia_es.yaml

/**
 * The dotted leaf keys of a YAML mapping file, the way scripts/merge-virginia-es.py walks it:
 * route, then nested keys joined with dots. Only the structure is read; scalar values, quoted or
 * block, single or multi-line, are skipped by indentation. The locale files are plain mappings
 * with no lists, which is all this reads.
 */
export function yamlKeys (text) {
  const keys = []
  const stack = [] // { indent, key }
  let skipAbove = -1 // inside a scalar value: ignore lines indented deeper than this
  for (const raw of String(text).split('\n')) {
    if (!raw.trim() || /^\s*#/.test(raw)) continue
    const indent = raw.match(/^ */)[0].length
    if (skipAbove >= 0 && indent > skipAbove) continue
    skipAbove = -1
    const m = raw.match(/^ *(?:"([^"]+)"|'([^']+)'|([^\s'"#][^:]*?)):(?:\s+(.*))?$/)
    if (!m) continue
    const key = m[1] ?? m[2] ?? m[3]
    const value = (m[4] || '').trim()
    while (stack.length && stack[stack.length - 1].indent >= indent) stack.pop()
    stack.push({ indent, key })
    if (value !== '' && !value.startsWith('#')) {
      keys.push(stack.map(s => s.key).join('.'))
      skipAbove = indent
    }
  }
  return keys
}

export function spanishStatus ({ flowEn, virginiaEs, prefix = '/your-taxes/virginia/' }) {
  const en = yamlKeys(flowEn).filter(k => k.startsWith(prefix))
  const es = yamlKeys(virginiaEs)
  const enSet = new Set(en)
  const esSet = new Set(es)
  const routes = {}
  for (const k of en) {
    const route = k.split('.')[0]
    routes[route] ??= { route, keys: 0, translated: 0, missing: [] }
    routes[route].keys++
    if (esSet.has(k)) routes[route].translated++
    else routes[route].missing.push(k.slice(route.length + 1))
  }
  const stale = es.filter(k => !enSet.has(k))
  return {
    prefix,
    english: en.length,
    translated: en.filter(k => esSet.has(k)).length,
    missing: en.filter(k => !esSet.has(k)),
    stale,
    routes: Object.values(routes),
  }
}
