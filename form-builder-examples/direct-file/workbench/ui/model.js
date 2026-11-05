// The rules as the workbench sees them: every fact in the Virginia modules, what kind of thing it
// is (a question, a value, a rule), which Form 760 line it is, and its <Derived> logic as a small
// tree that the plain-language view renders and edits and that serializes back to XML.
//
// The tree is the single thing both views edit. The plain view walks it to draw sentences; the XML
// tab serializes it; pasting XML into that tab parses back into it. Neither view has its own copy.

import { scanFacts, writableFacts } from '../lib/sandbox.js'
import { derivedBlock, valueLiteral, valueSchedule, valueAt } from '../lib/xml-edit.js'

// ---------------------------------------------------------------------------------------------
// Tree: { tag, attrs, children, text } for elements, { tag: '#comment', text } for comments.

export function parseXmlFragment (xml) {
  const doc = new DOMParser().parseFromString(`<root>${xml}</root>`, 'application/xml')
  const err = doc.querySelector('parsererror')
  if (err) throw new Error(err.textContent.split('\n').filter(Boolean).slice(0, 2).join(' '))
  return [...doc.documentElement.childNodes].map(fromDom).filter(Boolean)
}

function fromDom (n) {
  if (n.nodeType === 8) return { tag: '#comment', text: n.textContent.trim() }
  if (n.nodeType !== 1) return null
  const attrs = {}
  for (const a of n.attributes) attrs[a.name] = a.value
  const kids = [...n.childNodes].map(fromDom).filter(Boolean)
  const text = kids.length === 0 ? n.textContent.trim() : undefined
  return { tag: n.tagName, attrs, children: kids, text: text || undefined }
}

const attrStr = attrs => Object.entries(attrs || {}).map(([k, v]) => ` ${k}="${escAttr(v)}"`).join('')
const escAttr = v => String(v).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;')
const escText = v => String(v).replace(/&/g, '&amp;').replace(/</g, '&lt;')

function inline (n) {
  if (n.tag === '#comment') return null
  if (n.children.length === 0) return n.text !== undefined ? `<${n.tag}${attrStr(n.attrs)}>${escText(n.text)}</${n.tag}>` : `<${n.tag}${attrStr(n.attrs)} />`
  const parts = n.children.map(inline)
  if (parts.some(p => p === null)) return null
  return `<${n.tag}${attrStr(n.attrs)}>${parts.join('')}</${n.tag}>`
}

/** Serialize in the file's own style: short elements on one line, longer ones indented by two. */
export function serialize (n, indent = '') {
  if (n.tag === '#comment') return `${indent}<!-- ${n.text.replace(/--/g, '—')} -->`
  const one = inline(n)
  if (one !== null && indent.length + one.length <= 100) return indent + one
  return [
    `${indent}<${n.tag}${attrStr(n.attrs)}>`,
    ...n.children.map(c => serialize(c, indent + '  ')),
    `${indent}</${n.tag}>`,
  ].join('\n')
}

export const clone = n => JSON.parse(JSON.stringify(n))
export const el = (tag, children = [], attrs = {}, text) => ({ tag, attrs, children, text })
export const dep = (path, module) => el('Dependency', [], module ? { module, path } : { path })
export const lit = (tag, value) => el(tag, [], {}, String(value))
export const elementKids = n => n.children.filter(c => c.tag !== '#comment')

// ---------------------------------------------------------------------------------------------
// The model

const LINE_RE = /Form 760 (?:Lines? )?(\d+)([a-z]?)/
const SECTION_RE = /<!-- =+ ([\s\S]*?) =+ -->/g
const CITE_RE = /(?:Va\. Code )?§§? ?[\d.]+-[\d.:]+(?:\([A-Za-z0-9]+\))*/

export function buildModel ({ facts: modules, federal, year }) {
  const facts = new Map()
  for (const [file, xml] of Object.entries(modules).sort(([a], [b]) => a.localeCompare(b))) {
    const sections = [...xml.matchAll(SECTION_RE)].map(m => ({ at: m.index, title: m[1].trim() }))
    const writable = new Map(writableFacts(xml).map(w => [w.path, w]))
    for (const f of scanFacts(xml)) {
      const name = (f.body.match(/<Name>([\s\S]*?)<\/Name>/) || [])[1]
      const description = (f.body.match(/<Description>([\s\S]*?)<\/Description>/) || [])[1]
      const desc = clean(description || '')
      const line = (clean(name || '').match(LINE_RE) || null)
      const derived = derivedBlock(f.body)
      const section = sections.filter(s => s.at < f.start).pop()
      const fact = {
        path: f.path,
        file,
        name: clean(name || '') || f.path,
        description: desc,
        citation: (desc.match(CITE_RE) || [''])[0].replace(/^Va\. Code /, ''),
        taxYear: (f.body.match(/<TaxYear>(\d+)<\/TaxYear>/) || [])[1] || null,
        section: section ? section.title : '',
        writable: writable.get(f.path) || null,
        // A value is a plain figure or a schedule by tax year; `literal` is the figure for `year`.
        schedule: valueSchedule(f.body),
        literal: null,
        derivedText: derived,
        deps: [...new Set([...f.body.matchAll(/<Dependency (?:module="[^"]*" )?path="([^"]+)"/g)].map(m => m[1]))],
        line: line ? { label: line[1] + line[2], sort: Number(line[1]) + (line[2] ? (line[2].charCodeAt(0) - 96) / 100 : 0) } : null,
      }
      if (fact.schedule) fact.literal = { tag: fact.schedule.tag, value: valueAt(fact.schedule, year || 2024) }
      fact.kind = fact.writable ? 'asked' : fact.schedule ? 'value' : derived ? 'rule' : 'other'
      if (/EnumOptions/.test(derived || '')) fact.kind = 'options'
      facts.set(f.path, fact)
    }
  }
  const federalByPath = new Map(federal.inputs.map(i => [i.path, i]))
  // Who uses each fact, for "used by" and "what this touches".
  const usedBy = new Map()
  for (const f of facts.values()) for (const d of f.deps) { if (!usedBy.has(d)) usedBy.set(d, []); usedBy.get(d).push(f.path) }
  return { facts, federalByPath, usedBy }
}

/** What a dependency path refers to, for chips: its label and its kind. */
export function describePath (model, path) {
  const f = model.facts.get(path)
  if (f) return { label: f.name, kind: f.kind === 'value' ? 'value' : f.kind === 'asked' ? 'asked' : 'calc', fact: f }
  const fed = model.federalByPath.get(path)
  if (fed) return { label: fed.label, kind: 'federal', federal: fed }
  return { label: path, kind: 'missing' }
}

/** Form 760 lines that a fact feeds, following "used by" upward. */
export function feedsLines (model, path, limit = 6) {
  const out = []
  const seen = new Set([path])
  const queue = [...(model.usedBy.get(path) || [])]
  while (queue.length && out.length < limit) {
    const p = queue.shift()
    if (seen.has(p)) continue
    seen.add(p)
    const f = model.facts.get(p)
    if (f?.line && !out.includes(f.line.label)) out.push(f.line.label)
    queue.push(...(model.usedBy.get(p) || []))
  }
  return out.sort((a, b) => parseFloat(a) - parseFloat(b))
}

/** The expression inside a fact's <Derived> (or inside any <Derived>…</Derived> text). */
export function derivedTree (factOrText) {
  const text = typeof factOrText === 'string' ? factOrText : factOrText.derivedText
  if (!text) return null
  const [derived] = parseXmlFragment(text).filter(n => n.tag !== '#comment')
  return derived?.tag === 'Derived' ? elementKids(derived)[0] : derived
}

/** The <Derived> block for an expression, as it goes into the file. */
export const derivedXml = tree => serialize({ tag: 'Derived', attrs: {}, children: [tree] })

/** A line's own words: "Form 760 Line 11, standard deduction" → "Standard deduction". */
export function shortName (name) {
  const s = name.replace(/^Form 760 (?:Lines? [\dA-Za-z]+(?: (?:to|and) [\dA-Za-z]+)?|locality code)(?: \(Schedule ADJ\))?,?\s*/, '')
  return s ? s[0].toUpperCase() + s.slice(1) : name
}

// ---------------------------------------------------------------------------------------------
// Formatting values

export function money (v) {
  const n = Number(v)
  if (!isFinite(n)) return String(v)
  return (n < 0 ? '−$' : '$') + Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: Number.isInteger(n) ? 0 : 2, maximumFractionDigits: 2 })
}

export function literalLabel (tag, value) {
  if (tag === 'Dollar') return money(value)
  if (tag === 'Rational') {
    const [a, b] = String(value).split('/').map(Number)
    if (b) { const pct = (a / b) * 100; return `${+pct.toFixed(4)}%` }
  }
  if (tag === 'Int' || tag === 'Decimal') return Number(value).toLocaleString('en-US')
  return String(value)
}

export function formatResult (v) {
  if (v === null || v === undefined) return '—'
  if (v === true) return 'Yes'
  if (v === false) return 'No'
  if (typeof v === 'number') return money(v)
  return String(v)
}

export const humanize = s => String(s).replace(/([a-z])([A-Z])/g, '$1 $2').replace(/[-_]/g, ' ').replace(/^./, c => c.toUpperCase())

function clean (s) { return s.replace(/\s+/g, ' ').trim() }
