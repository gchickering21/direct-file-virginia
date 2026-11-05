// What the server will accept from the page before it splices anything into the fact modules: the
// shape of a change, the value a literal may take, the XML a rule may be, and (after splicing) the
// whole file against the RELAX NG schema, with xmllint when it is installed.

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'

export class ValidationError extends Error { constructor (message) { super(message); this.status = 400 } }

export const FACT_PATH_RE = /^\/[A-Za-z0-9_/*]+$/
export const ROUTE_RE = /^\/your-taxes\/virginia\/[a-z0-9-]+$/
export const TEXT_TAGS = new Set(['p', 'h2', 'h3', 'h4', 'li', 'th', 'td', 'caption', 'label', 'legend'])
const INLINE_TAGS = new Set(['fg-show', 'strong', 'em', 'span', 'a', 'br', 'code', 'b', 'i'])

/** Text with no markup at all: a heading, a question, a title. */
export function checkPlain (s) {
  if (/[<>]/.test(s)) throw new ValidationError('Headings and questions are plain words, no markup.')
  return s
}

/** A paragraph's markup: inline elements only, each well-formed, no scripts, no event attributes. */
export function checkInline (s) {
  const body = String(s)
  const stack = []
  const tag = /<(\/?)([A-Za-z][\w-]*)((?:\s+[\w-]+="[^"<>]*")*)\s*(\/?)>/g
  let last = 0
  let m
  while ((m = tag.exec(body))) {
    if (/[<>]/.test(body.slice(last, m.index))) throw new ValidationError('The text has a stray < or >.')
    last = m.index + m[0].length
    const [, close, name, attrs, selfClose] = m
    if (!INLINE_TAGS.has(name)) throw new ValidationError(`<${name}> is not allowed in screen text. Use fg-show, strong, em, span, a, br or code.`)
    if (close) { if (stack.pop() !== name) throw new ValidationError(`Mismatched </${name}>.`); continue }
    for (const a of attrs.matchAll(/([\w-]+)="([^"]*)"/g)) {
      if (!['path', 'class', 'href', 'rel', 'target', 'title', 'lang'].includes(a[1])) throw new ValidationError(`<${name}> may not have a ${a[1]} attribute.`)
      if (a[1] === 'path' && !FACT_PATH_RE.test(a[2])) throw new ValidationError(`“${a[2]}” is not a fact path.`)
      if (a[1] === 'href' && !/^(https?:\/\/|#|\/)/.test(a[2])) throw new ValidationError('Links are http(s), # or a path.')
    }
    if (name === 'fg-show' && !/path="/.test(attrs)) throw new ValidationError('<fg-show> needs a path.')
    if (!selfClose && name !== 'br') stack.push(name)
  }
  if (/[<>]/.test(body.slice(last))) throw new ValidationError('The text has a stray < or >.')
  if (stack.length) throw new ValidationError(`<${stack[stack.length - 1]}> is never closed.`)
  return body
}

/** What each literal type may hold in the file. */
export const LITERAL_RE = {
  Dollar: /^-?\d+(\.\d\d?)?$/,
  Rational: /^\d+\/[1-9]\d*$/,
  Int: /^-?\d+$/,
  Decimal: /^-?\d+(\.\d+)?$/,
  Day: /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/,
}

export function checkLiteral (tag, value) {
  const re = LITERAL_RE[tag]
  if (!re) throw new ValidationError(`${tag} is not a value the workbench edits.`)
  if (!re.test(String(value ?? '').trim())) {
    const hint = { Dollar: 'dollars, like 8500 or 8500.50', Rational: 'a fraction, like 575/10000', Int: 'a whole number', Decimal: 'a decimal number', Day: 'a date, like 2025-01-01' }[tag]
    throw new ValidationError(`“${String(value).slice(0, 40)}” is not ${hint}.`)
  }
  return String(value).trim()
}

// Every operator the Fact Graph knows that a Virginia rule could reasonably use. The tags found in
// the files as they stand are added at check time, so a module that already uses an operator can
// keep using it.
export const COMMON_TAGS = [
  'Derived', 'Switch', 'Case', 'When', 'Then', 'True', 'False', 'Dependency', 'Dollar', 'Int', 'Rational', 'Decimal',
  'Day', 'Boolean', 'Enum', 'String', 'Add', 'Subtract', 'Minuend', 'Subtrahends', 'Multiply', 'Divide', 'Dividend',
  'Divisors', 'Minuends', 'GreaterOf', 'LesserOf', 'LessThan', 'LessThanOrEqual', 'GreaterThan', 'GreaterThanOrEqual',
  'Equal', 'NotEqual', 'Left', 'Right', 'Not', 'Any', 'All', 'Round', 'RoundToInt', 'Truncate', 'Count', 'CollectionSum',
  'Filter', 'Paste', 'Find', 'MaximumOf', 'MinimumOf', 'AsDecimal', 'AsString', 'TrimDollar', 'Length', 'Days', 'Condition',
  'Placeholder', 'EnumOptions', 'Optional', 'IsComplete', 'Index', 'StepwiseMultiply', 'Rate', 'FirstNCollectionItems', 'Regex',
  'ToUpper', 'Trim', 'AddressFields', 'Address', 'Tin', 'Ein', 'Pin', 'IpPin', 'PhoneNumber', 'BankAccount', 'EmailAddress', 'Multiple',
]
const ATTRS = new Set(['path', 'module', 'optionsPath', 'scale', 'places', 'operation', 'format'])

/** The element names a module uses. */
export function tagsIn (xml) {
  const out = new Set()
  for (const m of String(xml).replace(/<!--[\s\S]*?-->/g, '').matchAll(/<([A-Za-z][\w.-]*)/g)) out.add(m[1])
  return out
}

/**
 * A rule's XML must be one well-formed <Derived> element of allowed operators and nothing else:
 * no processing instructions, no doctype, no CDATA, no unknown attributes, no stray text.
 */
export function checkDerived (xml, allowed = new Set(COMMON_TAGS)) {
  const s = String(xml ?? '')
  if (s.length > 200000) throw new ValidationError('The rule is too long.')
  if (/<\?|<!DOCTYPE|<!\[CDATA\[/i.test(s)) throw new ValidationError('A rule may not hold processing instructions, a doctype or CDATA.')
  const body = s.replace(/<!--[\s\S]*?-->/g, '')
  const stack = []
  let roots = 0
  let last = 0
  const tag = /<(\/?)([A-Za-z][\w.-]*)((?:\s+[\w:-]+="[^"<>]*")*)\s*(\/?)>/g
  let m
  while ((m = tag.exec(body))) {
    const between = body.slice(last, m.index)
    if (/[<>]/.test(between) || (/&(?!(amp|lt|gt|quot|apos|#\d+|#x[0-9a-fA-F]+);)/.test(between))) throw new ValidationError('The rule is not well-formed XML.')
    if (between.trim() && !stack.length) throw new ValidationError('Text outside the <Derived> element.')
    last = m.index + m[0].length
    const [, close, name, attrs, selfClose] = m
    if (close) {
      if (selfClose || attrs.trim()) throw new ValidationError('The rule is not well-formed XML.')
      if (stack.pop() !== name) throw new ValidationError(`Mismatched closing tag </${name}>.`)
      continue
    }
    if (!allowed.has(name)) throw new ValidationError(`<${name}> is not an operator a rule may use.`)
    for (const a of attrs.matchAll(/([\w:-]+)="([^"]*)"/g)) {
      if (!ATTRS.has(a[1])) throw new ValidationError(`<${name}> may not have a ${a[1]} attribute.`)
      if ((a[1] === 'path' || a[1] === 'optionsPath') && !/^(\/[A-Za-z0-9_/*]+|\.\.?\/[A-Za-z0-9_/*.]*|[A-Za-z0-9_]+(\/[A-Za-z0-9_*]+)*)$/.test(a[2])) throw new ValidationError(`“${a[2]}” is not a fact path.`)
      if (a[1] === 'module' && !/^[A-Za-z0-9_]+$/.test(a[2])) throw new ValidationError(`“${a[2]}” is not a module name.`)
    }
    if (!stack.length) {
      if (name !== 'Derived') throw new ValidationError('A rule is one <Derived> element.')
      if (++roots > 1) throw new ValidationError('A rule is one <Derived> element, not several.')
    }
    if (!selfClose) stack.push(name)
  }
  const tail = body.slice(last)
  if (/[<>]/.test(tail) || tail.trim()) throw new ValidationError('The rule is not well-formed XML.')
  if (stack.length) throw new ValidationError(`<${stack[stack.length - 1]}> is never closed.`)
  if (roots !== 1) throw new ValidationError('A rule is one <Derived> element.')
  return s
}

/** The shape of a change as the page may save it. Returns the cleaned fields. */
export function checkChangeFields (body, { literalTag, allowedTags }) {
  const out = {}
  const str = (v, max) => { if (v !== undefined && typeof v !== 'string') throw new ValidationError('Expected text.'); return v === undefined ? undefined : v.slice(0, max) }
  if ('title' in body) out.title = str(body.title, 200) || 'Untitled change'
  if ('summary' in body) out.summary = str(body.summary, 4000) || ''
  if ('source' in body) {
    if (!body.source || typeof body.source !== 'object') throw new ValidationError('The source is a citation and an effective date.')
    out.source = { citation: str(body.source.citation, 500) || '', effective: str(body.source.effective, 200) || '' }
  }
  if ('law' in body) {
    const l = body.law
    if (!l || typeof l !== 'object') throw new ValidationError('The law is an object.')
    const year = l.effectiveYear === undefined || l.effectiveYear === null || l.effectiveYear === '' ? null : Number(l.effectiveYear)
    if (year !== null && !(Number.isInteger(year) && year >= 2000 && year <= 2100)) throw new ValidationError('The effective tax year is a four-digit year.')
    const ends = l.endsAfter === undefined || l.endsAfter === null || l.endsAfter === '' ? null : Number(l.endsAfter)
    if (ends !== null && !(Number.isInteger(ends) && ends >= 2000 && ends <= 2100)) throw new ValidationError('“Ends after” is a four-digit year.')
    out.law = { kind: str(l.kind, 60) || '', citation: str(l.citation, 500) || '', text: str(l.text, 20000) || '', effectiveYear: year, endsAfter: ends }
  }
  if ('spanish' in body) {
    if (!body.spanish || typeof body.spanish !== 'object' || Array.isArray(body.spanish)) throw new ValidationError('The Spanish is a map of key to text.')
    out.spanish = {}
    for (const [k, v] of Object.entries(body.spanish)) {
      if (!/^\/your-taxes\/virginia\/[a-z0-9-]+\|[^|]{1,200}$/.test(k)) throw new ValidationError(`“${k.slice(0, 60)}” is not a screen and key.`)
      if (typeof v !== 'string') throw new ValidationError('Spanish is text.')
      if (v.trim()) out.spanish[k] = checkInline(v.slice(0, 4000))
    }
  }
  if ('proposals' in body) {
    if (body.proposals !== null && (typeof body.proposals !== 'object')) throw new ValidationError('proposals is an object.')
    const pj = body.proposals ? JSON.stringify(body.proposals) : null
    if (pj && pj.length > 200000) throw new ValidationError('The proposals are too large.')
    out.proposals = pj ? JSON.parse(pj) : null
  }
  if ('requestIds' in body) {
    if (!Array.isArray(body.requestIds) || !body.requestIds.every(n => Number.isInteger(n) && n > 0)) throw new ValidationError('requestIds must be request numbers.')
    out.requestIds = [...new Set(body.requestIds)]
  }
  if ('edits' in body) {
    if (!Array.isArray(body.edits) || body.edits.length > 500) throw new ValidationError('edits must be a list.')
    out.edits = body.edits.map(e => {
      if (!e || typeof e !== 'object') throw new ValidationError('Each edit is an object.')
      if (['value', 'rule', 'schedule'].includes(e.type) && !FACT_PATH_RE.test(e.path || '')) throw new ValidationError(`“${String(e.path).slice(0, 60)}” is not a fact path.`)
      // The module is a hint for the reader; the edit is applied to whichever module holds the fact.
      const file = e.file === undefined ? undefined : String(e.file)
      if (file !== undefined && !/^virginia[A-Za-z0-9]*$/.test(file)) throw new ValidationError('An edit names a Virginia module (virginia…) or none.')
      if (e.type === 'value') {
        const tag = literalTag(file, e.path)
        if (tag) { checkLiteral(tag, e.from); checkLiteral(tag, e.to) } else if (!/^[-\d./]{1,40}$/.test(String(e.to)) || !/^[-\d./]{1,40}$/.test(String(e.from))) throw new ValidationError('A value is a number, a fraction or a date.')
        return { type: 'value', file, path: e.path, from: String(e.from).trim(), to: String(e.to).trim() }
      }
      if (e.type === 'rule') {
        if (typeof e.before !== 'string' || typeof e.derived !== 'string') throw new ValidationError('A rule edit carries the rule before and after.')
        checkDerived(e.derived, allowedTags)
        return { type: 'rule', file, path: e.path, before: e.before.slice(0, 200000), derived: e.derived, because: str(e.because, 2000) || '' }
      }
      if (e.type === 'schedule') {
        if (typeof e.before !== 'string') throw new ValidationError('A schedule edit carries the rule before.')
        if (!['Dollar', 'Int', 'Rational', 'Decimal'].includes(e.tag)) throw new ValidationError('A scheduled value is dollars, a rate or a number.')
        const steps = Array.isArray(e.steps) ? e.steps : []
        if (steps.length > 40) throw new ValidationError('Too many years.')
        const step = x => { if (!x || !Number.isInteger(Number(x.year)) || Number(x.year) < 2000 || Number(x.year) > 2100) throw new ValidationError('Each step is a year and a value.'); return { year: Number(x.year), value: checkLiteral(e.tag, x.value) } }
        return { type: 'schedule', file, path: e.path, before: e.before.slice(0, 200000), tag: e.tag, base: checkLiteral(e.tag, e.base), steps: steps.map(step), fromBase: e.fromBase === undefined ? undefined : checkLiteral(e.tag, e.fromBase), fromSteps: Array.isArray(e.fromSteps) ? e.fromSteps.map(step) : [] }
      }
      if (e.type === 'question') {
        if (!/^\/va[A-Z][A-Za-z0-9]*$/.test(e.path)) throw new ValidationError('A Virginia question is named like /vaSomethingNew.')
        if (!['boolean', 'dollar', 'day', 'int'].includes(e.answerType)) throw new ValidationError('An answer is yes/no, dollars, a date or a number.')
        if (!String(e.question || '').trim()) throw new ValidationError('The question needs wording.')
        if (!FACT_PATH_RE.test(e.condition || '')) throw new ValidationError('“Who gets asked” is a fact path.')
        if (!ROUTE_RE.test(e.route || '')) throw new ValidationError('The screen is a Virginia route.')
        const placement = e.placement === 'own-screen' ? 'own-screen' : 'follow-up'
        if (placement === 'own-screen' && !ROUTE_RE.test(e.pageRoute || '')) throw new ValidationError('A new screen needs a route like /your-taxes/virginia/virginia-something.')
        const dflt = e.answerType === 'boolean' ? e.default === true : e.answerType === 'day' ? (e.default ? checkLiteral('Day', e.default) : undefined) : Number(e.default || 0)
        return { type: 'question', path: e.path, name: str(e.name, 200) || '', law: checkPlain(str(e.law, 2000) || ''), answerType: e.answerType, question: checkPlain(str(e.question, 300).trim()), help: checkInline(str(e.help, 2000) || ''), condition: e.condition, route: e.route, placement, pageTitle: checkPlain(str(e.pageTitle, 120) || ''), pageRoute: placement === 'own-screen' ? e.pageRoute : '', yes: checkPlain(str(e.yes, 60) || 'Yes'), no: checkPlain(str(e.no, 60) || 'No'), default: dflt }
      }
      if (e.type === 'text') {
        if (!ROUTE_RE.test(e.route || '')) throw new ValidationError('The screen is a Virginia route.')
        if (!TEXT_TAGS.has(e.tag)) throw new ValidationError('Not a text element the workbench edits.')
        if (typeof e.before !== 'string' || typeof e.after !== 'string' || !e.after.trim()) throw new ValidationError('A text edit carries the words before and after.')
        return { type: 'text', route: e.route, tag: e.tag, before: e.before.slice(0, 8000), after: checkInline(e.after.slice(0, 8000)) }
      }
      if (e.type === 'remove-question') {
        if (!FACT_PATH_RE.test(e.path || '') || typeof e.marker !== 'string') throw new ValidationError('A removal names the question and its marker.')
        return { type: 'remove-question', path: e.path, marker: e.marker.slice(0, 200), placement: e.placement === 'own-screen' ? 'own-screen' : 'follow-up', route: str(e.route, 200) || '', pageRoute: str(e.pageRoute, 200) || '', keys: Array.isArray(e.keys) ? e.keys.map(k => String(k).slice(0, 200)).slice(0, 20) : [] }
      }
      throw new ValidationError(`Unknown edit type ${String(e.type).slice(0, 20)}.`)
    })
  }
  if ('exampleEdits' in body) {
    if (!Array.isArray(body.exampleEdits) || body.exampleEdits.length > 200) throw new ValidationError('exampleEdits must be a list.')
    out.exampleEdits = body.exampleEdits.map(e => {
      if (!e || typeof e !== 'object') throw new ValidationError('Each example edit is an object.')
      if (e.op === 'remove') {
        if (typeof e.id !== 'string' || !/^[a-z0-9-]{1,80}$/.test(e.id)) throw new ValidationError('An example id is a slug.')
        return { op: 'remove', id: e.id }
      }
      if (e.op !== 'add' && e.op !== 'update') throw new ValidationError('An example edit adds, updates or removes.')
      const x = e.example
      if (!x || typeof x !== 'object' || typeof x.id !== 'string' || !/^[a-z0-9-]{1,80}$/.test(x.id)) throw new ValidationError('An example needs a slug id.')
      if (!x.inputs || typeof x.inputs !== 'object' || !x.expect || typeof x.expect !== 'object') throw new ValidationError('An example has inputs and expected lines.')
      for (const k of [...Object.keys(x.inputs), ...Object.keys(x.expect)]) if (!FACT_PATH_RE.test(k)) throw new ValidationError(`“${k.slice(0, 60)}” is not a fact path.`)
      for (const v of Object.values(x.inputs)) if (!['number', 'string', 'boolean'].includes(typeof v) && !(Array.isArray(v) && v.every(n => typeof n === 'number'))) throw new ValidationError('An example input is a number, text, yes/no or a list of numbers.')
      for (const v of Object.values(x.expect)) if (!['number', 'string', 'boolean'].includes(typeof v)) throw new ValidationError('An expected value is a number, text or yes/no.')
      return {
        op: e.op,
        example: { id: x.id, title: str(x.title, 200) || x.id, household: str(x.household, 2000) || '', author: str(x.author, 100) || '', created: str(x.created, 40) || '', inputs: x.inputs, expect: x.expect },
      }
    })
  }
  return out
}

// ---------------------------------------------------------------------------------------------
// The schema, through xmllint

let xmllint
export function haveXmllint () {
  if (xmllint === undefined) {
    const r = spawnSync('xmllint', ['--version'], { encoding: 'utf8' })
    xmllint = !r.error && r.status === 0
  }
  return xmllint
}

/** null when the file validates (or xmllint is not installed), else the first lines of the complaint. */
export function schemaError (xml, schemaPath, label = 'module') {
  if (!haveXmllint() || !schemaPath || !fs.existsSync(schemaPath)) return null
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wb-'))
  const file = path.join(dir, `${label}.xml`)
  try {
    fs.writeFileSync(file, xml)
    const r = spawnSync('xmllint', ['--noout', '--relaxng', schemaPath, file], { encoding: 'utf8' })
    if (r.status === 0) return null
    const text = `${r.stderr || ''}${r.stdout || ''}`.split('\n').filter(l => l && !/validates$/.test(l)).map(l => l.replace(file, label + '.xml')).slice(0, 6).join('\n')
    return `The ${label} module does not fit FactDictionaryModule.rng: ${text || 'xmllint failed'}`
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
}
