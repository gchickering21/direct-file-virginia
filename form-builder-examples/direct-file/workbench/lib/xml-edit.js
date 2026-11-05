// Applying a change to the fact files as text, and diffing the result.
//
// Edits are spliced into the file as it stands, never by re-serializing the whole module: a value
// edit replaces one number, a rule edit replaces one fact's <Derived> block. Everything else in
// the module, its comments and its hand formatting, is left byte-for-byte alone, so the diff a
// reviewer reads is exactly the change and nothing more.
//
// Each edit carries what it expected to find (`from` for a value, `before` for a rule). When the
// file has moved on since the draft was made, applying it fails with a conflict instead of writing
// over someone else's work.

import { fileOfFact, scanFacts } from './sandbox.js'
import { insertScreen, keyFor, pages, questionBlock, questionKeys, removeMarked, renumberEyebrows, replaceText } from './flow.js'
import { removeEsKey, renameEsKey, setEsKey } from './locale.js'

export class EditConflict extends Error {
  constructor (message, edit) { super(message); this.code = 'CONFLICT'; this.edit = edit }
}

const LITERAL_RE = /<(Dollar|Int|Rational|Decimal)>([^<]*)<\/\1>/

/** The one literal a value fact derives, or null when the fact is not a plain value. */
export function valueLiteral (body) {
  const d = body.match(/<Derived>([\s\S]*?)<\/Derived>/)
  if (!d) return null
  const inner = d[1].replace(/<!--[\s\S]*?-->/g, '').trim()
  const m = inner.match(new RegExp('^' + LITERAL_RE.source + '$'))
  return m ? { tag: m[1], value: m[2].trim() } : null
}

/** The <Derived>…</Derived> text of a fact, exactly as written. */
export function derivedBlock (body) {
  const a = body.indexOf('<Derived>')
  const b = body.lastIndexOf('</Derived>')
  return a < 0 || b < 0 ? null : body.slice(a, b + '</Derived>'.length)
}

function findFact (xml, path, edit) {
  const f = scanFacts(xml).find(x => x.path === path)
  if (!f) throw new EditConflict(`The fact ${path} is no longer in the file.`, edit)
  return f
}

function indentAt (text, index) {
  const lineStart = text.lastIndexOf('\n', index - 1) + 1
  return text.slice(lineStart, index).match(/^\s*/)[0]
}

/** Re-indent a block written at column 0 so it sits where the old block sat. */
function reindent (block, indent) {
  return block.split('\n').map((l, i) => (i === 0 || l === '' ? l : indent + l)).join('\n')
}

/** A literal's value in a form that compares: "20/100" and "1/5" are the same rate. */
export function literalKey (tag, value) {
  const v = String(value ?? '').trim()
  if (tag === 'Rational') {
    const m = v.match(/^(-?\d+)\/(\d+)$/)
    if (m && Number(m[2]) !== 0) return 'r' + (Number(m[1]) / Number(m[2]))
    const n = Number(v)
    return Number.isFinite(n) ? 'r' + n : 's' + v
  }
  if (tag === 'Day') return 's' + v
  const n = Number(v)
  return Number.isFinite(n) && v !== '' ? 'n' + n : 's' + v
}

/** Whether two literals of one type mean the same thing, by normalised string or by number. */
export function sameLiteral (tag, a, b) {
  const sa = String(a ?? '').trim()
  const sb = String(b ?? '').trim()
  if (sa === sb) return true
  return literalKey(tag, sa) === literalKey(tag, sb) && !literalKey(tag, sa).startsWith('s')
}

const SOURCE_RE = /\s*Source: [^()]*\(workbench change #\d+, \d{4}-\d{2}-\d{2}(?:; was [^)]*)?\)\./g
const WB_COMMENT_RE = /[ \t]*<!-- Workbench change #\d+[^>]*-->\n?/g

/** The one trailing "Source: … (workbench change #N, date; was X)." sentence a value edit writes. */
function sourceSentence (edit, ctx) {
  const cite = String(ctx.source?.citation || '').trim()
  const eff = String(ctx.source?.effective || '').trim()
  const bits = [cite || 'not given yet', eff ? `effective ${eff}` : ''].filter(Boolean).join(', ')
  return `Source: ${escapeText(bits).replace(/[()]/g, '')} (workbench change #${ctx.id}, ${ctx.date}; was ${edit.from}).`
}

/** Put the source into the fact's <Description>, replacing any sentence a previous change wrote. */
function withSource (factText, edit, ctx) {
  const sentence = sourceSentence(edit, ctx)
  const m = factText.match(/<Description>([\s\S]*?)<\/Description>/)
  if (m) {
    const body = m[1].replace(SOURCE_RE, '').replace(/\s+$/, '')
    return factText.replace(m[0], `<Description>${body} ${sentence}</Description>`)
  }
  // No description yet: one goes after <Name>, or first in the fact, where the schema wants it.
  const i = factText.indexOf('</Name>')
  const at = i >= 0 ? i + '</Name>'.length : factText.indexOf('>') + 1
  return factText.slice(0, at) + `\n${indentAt(factText, factText.indexOf('<Derived>'))}<Description>${sentence}</Description>` + factText.slice(at)
}

/**
 * Apply one edit to a module's text. `ctx` is { id, source, date } of the change, which a value edit
 * writes into the fact's <Description> as its source sentence.
 */
export function applyEdit (xml, edit, ctx = {}) {
  const f = findFact(xml, edit.path, edit)
  const factText = xml.slice(f.start, f.end)
  let next
  if (edit.type === 'value') {
    const lit = valueLiteral(f.body)
    if (!lit) throw new EditConflict(`${edit.path} is no longer a plain value.`, edit)
    if (!sameLiteral(lit.tag, lit.value, edit.from)) {
      throw new EditConflict(`${edit.path} was ${edit.from} when the draft started and is ${lit.value} now.`, edit)
    }
    const d = derivedBlock(factText)
    const to = String(edit.to).trim()
    // A function replacement, so "$&" or "$'" in the value cannot expand into the pattern.
    const newDerived = d.replace(LITERAL_RE, () => `<${lit.tag}>${to}</${lit.tag}>`)
    const di = factText.indexOf(d)
    next = factText.slice(0, di) + newDerived + factText.slice(di + d.length)
    // The source lives in the Description, not in a trail of comments: drop any comment an earlier
    // version of the workbench left, and write the sentence once.
    next = next.replace(WB_COMMENT_RE, '')
    next = withSource(next, edit, { id: ctx.id ?? edit.changeId ?? '?', source: ctx.source || {}, date: ctx.date || new Date().toISOString().slice(0, 10) })
  } else if (edit.type === 'rule') {
    const d = derivedBlock(factText)
    if (!d) throw new EditConflict(`${edit.path} has no <Derived> block.`, edit)
    if (normalize(d) !== normalize(edit.before)) {
      throw new EditConflict(`Someone changed the rule for ${edit.path} after this draft started.`, edit)
    }
    const i = factText.indexOf('<Derived>')
    const block = reindent(String(edit.derived).trim(), indentAt(factText, i))
    next = factText.slice(0, i) + block + factText.slice(i + d.length)
  } else if (edit.type === 'schedule') {
    const d = derivedBlock(factText)
    if (!d) throw new EditConflict(`${edit.path} has no <Derived> block.`, edit)
    if (normalize(d) !== normalize(edit.before)) {
      throw new EditConflict(`Someone changed ${edit.path} after this draft started.`, edit)
    }
    const i = factText.indexOf('<Derived>')
    const block = reindent(scheduleDerived({ tag: edit.tag, base: edit.base, steps: edit.steps || [] }), indentAt(factText, i))
    next = factText.slice(0, i) + block + factText.slice(i + d.length)
    next = next.replace(WB_COMMENT_RE, '')
    const was = scheduleLabel({ tag: edit.tag, base: edit.fromBase ?? edit.base, steps: edit.fromSteps || [] })
    next = withSource(next, { ...edit, from: was }, { id: ctx.id ?? edit.changeId ?? '?', source: ctx.source || {}, date: ctx.date || new Date().toISOString().slice(0, 10) })
  } else {
    throw new Error(`Unknown edit type ${edit.type}`)
  }
  return xml.slice(0, f.start) + next + xml.slice(f.end)
}

function normalize (s) { return String(s || '').replace(/\s+/g, ' ').replace(/> </g, '><').trim() }
function escapeText (s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/--/g, '—') }

// ---------------------------------------------------------------------------------------------
// A line diff, unified-style, for the review screen.

export function lineDiff (a, b, context = 3) {
  const A = a.split('\n')
  const B = b.split('\n')
  let pre = 0
  while (pre < A.length && pre < B.length && A[pre] === B[pre]) pre++
  let suf = 0
  while (suf < A.length - pre && suf < B.length - pre && A[A.length - 1 - suf] === B[B.length - 1 - suf]) suf++
  const a2 = A.slice(pre, A.length - suf)
  const b2 = B.slice(pre, B.length - suf)
  // LCS over the middle, which is small for a real change.
  const n = a2.length
  const m = b2.length
  if (n * m > 4e6) return [{ header: 'The change is too large to show line by line.', lines: [] }]
  const L = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1))
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) L[i][j] = a2[i] === b2[j] ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1])
  const ops = []
  let i = 0
  let j = 0
  while (i < n || j < m) {
    if (i < n && j < m && a2[i] === b2[j]) { ops.push([' ', a2[i]]); i++; j++ } else if (j < m && (i === n || L[i][j + 1] >= L[i + 1][j])) { ops.push(['+', b2[j]]); j++ } else { ops.push(['-', a2[i]]); i++ }
  }
  if (!ops.some(o => o[0] !== ' ')) return []
  const full = [...A.slice(0, pre).map(l => [' ', l]), ...ops, ...A.slice(A.length - suf).map(l => [' ', l])]
  // Number each line by its place in the old file, then cut hunks around the changed lines.
  let oldNo = 0
  const numbered = full.map(([op, text]) => { if (op !== '+') oldNo++; return { op, text, oldNo } })
  const changed = numbered.map((x, k) => (x.op === ' ' ? -1 : k)).filter(k => k >= 0)
  const hunks = []
  let start = -1
  let end = -1
  for (const k of changed) {
    if (start >= 0 && k - context <= end + context) { end = k; continue }
    if (start >= 0) hunks.push([start, end])
    start = k
    end = k
  }
  hunks.push([start, end])
  return hunks.map(([s0, e0]) => {
    const from = Math.max(0, s0 - context)
    const to = Math.min(numbered.length, e0 + context + 1)
    return { header: `@@ line ${numbered[from].oldNo} @@`, lines: numbered.slice(from, to).map(x => [x.op, x.text]) }
  })
}

// ---------------------------------------------------------------------------------------------
// Values by tax year.
//
// A value that changes by year is written as the engine already understands it: a <Switch> on the
// return's /taxYear, newest year first, with the oldest value as the "otherwise". No build step
// has to know about years; the site built for a season has that season's /taxYear in
// constants.xml and the rule picks the right figure. The <TaxYear> tag the dictionary spec offers
// is left as documentation, since nothing reads it.

const TAX_YEAR_DEP = '<Dependency module="constants" path="/taxYear" />'
const STEP_RE = /^<Case><When><GreaterThanOrEqual><Left><Dependency module="constants" path="\/taxYear"\/><\/Left><Right><Int>(\d{4})<\/Int><\/Right><\/GreaterThanOrEqual><\/When><Then><(Dollar|Int|Rational|Decimal)>([^<]*)<\/\2><\/Then><\/Case>/

function tight (xml) {
  return String(xml).replace(/<!--[\s\S]*?-->/g, '').replace(/\s+/g, ' ').replace(/>\s+</g, '><').replace(/\s+\/>/g, '/>').trim()
}

/**
 * A value fact's figures by year: { tag, base, steps: [{ year, value }] } (steps newest first), or
 * null when the fact is neither a plain literal nor a year switch. A plain literal has no steps.
 */
export function valueSchedule (body) {
  const lit = valueLiteral(body)
  if (lit) return { tag: lit.tag, base: lit.value, steps: [] }
  const d = derivedBlock(body)
  if (!d) return null
  let s = tight(d)
  if (!s.startsWith('<Derived><Switch>') || !s.endsWith('</Switch></Derived>')) return null
  s = s.slice('<Derived><Switch>'.length, -'</Switch></Derived>'.length)
  const steps = []
  let tag = null
  let m
  while ((m = s.match(STEP_RE))) {
    if (tag && m[2] !== tag) return null
    tag = m[2]
    steps.push({ year: Number(m[1]), value: m[3].trim() })
    s = s.slice(m[0].length)
  }
  const last = s.match(/^<Case><When><True\/><\/When><Then><(Dollar|Int|Rational|Decimal)>([^<]*)<\/\1><\/Then><\/Case>$/)
  if (!last || !steps.length || (tag && last[1] !== tag)) return null
  return { tag: last[1], base: last[2].trim(), steps }
}

/** The figure a schedule gives for a tax year. */
export function valueAt (schedule, year) {
  for (const s of [...schedule.steps].sort((a, b) => b.year - a.year)) if (Number(year) >= s.year) return s.value
  return schedule.base
}

/** The <Derived> block for a schedule, in the file's style. */
export function scheduleDerived ({ tag, base, steps }) {
  const sorted = [...steps].filter(s => s.value !== undefined && s.value !== null && String(s.value) !== '').sort((a, b) => b.year - a.year)
  // Steps that do not change the figure are dropped: a carry-forward is the default.
  const kept = []
  for (let i = sorted.length - 1; i >= 0; i--) {
    const prev = i === sorted.length - 1 ? base : sorted[i + 1].value
    if (!sameLiteral(tag, prev, sorted[i].value)) kept.unshift(sorted[i])
  }
  if (!kept.length) return `<Derived><${tag}>${base}</${tag}></Derived>`
  const cases = kept.map(s => [
    '  <Case>',
    `    <When><GreaterThanOrEqual><Left>${TAX_YEAR_DEP}</Left><Right><Int>${s.year}</Int></Right></GreaterThanOrEqual></When>`,
    `    <Then><${tag}>${s.value}</${tag}></Then>`,
    '  </Case>',
  ].join('\n'))
  return ['<Derived>', '  <Switch>', ...cases.map(c => c.replace(/^/gm, '  ')), '    <Case>', '      <When><True /></When>', `      <Then><${tag}>${base}</${tag}></Then>`, '    </Case>', '  </Switch>', '</Derived>'].join('\n')
}

/** "$4,000; from 2026 $5,000" for a source sentence. */
export function scheduleLabel (schedule) {
  if (!schedule) return ''
  const steps = [...schedule.steps].sort((a, b) => a.year - b.year)
  return [schedule.base, ...steps.map(s => `from ${s.year} ${s.value}`)].join('; ')
}

// ---------------------------------------------------------------------------------------------
// Edits that reach past the fact files: a new question (fact + screen + words), a change to the
// words on a screen, and their reversal. `files` carries { facts: { <module>: xml }, flow, es }.

/**
 * The module a new question's fact goes into: the one that holds the fact gating it, else the one
 * that holds a question already on the same screen, else the screens module. Shared with the
 * question builder's "files it writes" panel so the two agree.
 */
export const DEFAULT_QUESTIONS_MODULE = 'virginiaScreens'
export function questionTargetModule (facts, e, flow) {
  const byGate = e.condition && e.condition !== '/vaIsResident' ? fileOfFact(facts, e.condition) : null
  if (byGate) return byGate
  if (flow !== undefined && e.route) {
    try {
      const page = pages(flow).find(p => p.route === e.route)
      for (const q of page?.questions || []) { const k = fileOfFact(facts, q.path); if (k) return k }
    } catch { /* an unreadable flow is reported by the flow edit itself */ }
  }
  return DEFAULT_QUESTIONS_MODULE in facts ? DEFAULT_QUESTIONS_MODULE : Object.keys(facts).sort()[0]
}

export const MARK = (change, what) => `workbench change #${change.id ?? '?'}: ${what}`

function factXmlFor (e, ctx) {
  const t = { boolean: '<Boolean />', dollar: '<Dollar />', day: '<Day />', int: '<Int />' }[e.answerType] || '<Dollar />'
  return [
    `<!-- ${MARK(ctx, e.path)} -->`,
    `<Fact path="${attr(e.path)}">`,
    `  <Name>${text(e.name || e.question)}</Name>`,
    `  <Description>${text(e.law || '')}${e.law ? ' ' : ''}Asked of the filer${e.condition && e.condition !== '/vaIsResident' ? `, only when ${text(e.condition)} is yes` : ''}.</Description>`,
    `  <Writable>${t}</Writable>`,
    '</Fact>',
  ].join('\n')
}

const attr = s => String(s ?? '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;')
const text = s => String(s ?? '').replace(/&(?!(amp|lt|gt|quot|apos|#\d+|#x[0-9a-fA-F]+);)/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

/** Insert a fact after the fact `after` (or before </Facts>), re-indented to match. */
function insertFact (xml, factXml, afterPath) {
  const facts = scanFacts(xml)
  if (facts.some(f => f.path === factXml.match(/<Fact path="([^"]+)"/)[1])) throw new EditConflict(`${factXml.match(/<Fact path="([^"]+)"/)[1]} is already in the file.`)
  const anchor = afterPath ? facts.find(f => f.path === afterPath) : null
  const at = anchor ? anchor.end : xml.lastIndexOf('</Facts>')
  const indent = anchor ? indentAt(xml, anchor.start) : '    '
  const block = factXml.split('\n').map(l => (l ? indent + l : l)).join('\n')
  return xml.slice(0, at) + '\n\n' + block + xml.slice(at)
}

function removeFactMarked (xml, marker) {
  const i = xml.indexOf(`<!-- ${marker} -->`)
  if (i < 0) throw new EditConflict('The fact this change added is no longer in the file.')
  const f = scanFacts(xml).find(x => x.start > i)
  if (!f) throw new EditConflict('The fact this change added is no longer in the file.')
  const ls = xml.lastIndexOf('\n', i - 1)
  return xml.slice(0, ls).replace(/\n+$/, '\n') + xml.slice(f.end).replace(/^\n+/, '\n')
}

/** The Spanish a change supplies for a key, or null. Keys are "<route>|<dotted key>". */
const spanishFor = (change, route, key) => (change.spanish && change.spanish[`${route}|${key}`]) || null
const needsNote = change => `needs translation (workbench change #${change.id ?? '?'})`
const changedNote = change => `needs translation: the English changed (workbench change #${change.id ?? '?'})`

/** "Question 3 of 5" → "Pregunta 3 de 5": the one string the workbench translates itself. */
export function autoSpanish (en) {
  const m = String(en).match(/^Question (\d+) of (\d+)$/)
  return m ? `Pregunta ${m[1]} de ${m[2]}` : null
}

function applyTextRename (files, change, route, tag, before, after, note) {
  const fromKey = keyFor(tag, before)
  const toKey = keyFor(tag, after)
  const given = spanishFor(change, route, toKey) || autoSpanish(after)
  if (files.es === undefined) return
  const r = renameEsKey(files.es, route, fromKey, toKey, given ? undefined : note)
  files.es = r.text
  if (given) files.es = setEsKey(files.es, route, toKey, given)
  else if (!r.found) files.es = setEsKey(files.es, route, toKey, after, note)
}

/** Apply one edit that may touch any of the files. Returns nothing; mutates `files`. */
function applyWideEdit (files, e, change) {
  if (e.type === 'text') {
    if (files.flow === undefined) throw new Error('This change edits the flow, which is not loaded.')
    files.flow = replaceText(files.flow, e.route, e.before, e.after)
    applyTextRename(files, change, e.route, e.tag || 'p', e.before, e.after, changedNote(change))
    return
  }
  if (e.type === 'question') {
    if (files.flow === undefined) throw new Error('This change adds a question to the flow, which is not loaded.')
    const marker = MARK(change, e.path)
    const target = questionTargetModule(files.facts, e, files.flow)
    const after = e.condition && e.condition !== '/vaIsResident' && fileOfFact(files.facts, e.condition) === target ? e.condition : null
    files.facts = { ...files.facts, [target]: insertFact(files.facts[target], factXmlFor(e, change), after) }
    const route = e.placement === 'own-screen' ? e.pageRoute : e.route
    let block = questionBlock({ ...e, marker })
    if (e.placement === 'own-screen') {
      // The eyebrow sits inside the screen block, after its opening tag; renumbering names it.
      block = block.replace(/(<div class="df-screen"[^>]*>(?:<!--[^>]*-->)?)\n/, `$1\n  <p class="va-eyebrow">Question 0 of 0</p>\n`)
      files.flow = insertScreen(files.flow, e.route, block, 'own-screen', { title: e.pageTitle || e.question, route: e.pageRoute })
      const rn = renumberEyebrows(files.flow)
      files.flow = rn.xml
      for (const r of rn.renames) if (r.before !== 'Question 0 of 0') applyTextRename(files, change, r.route, 'p', r.before, r.after, changedNote(change))
      const mine = pages(files.flow).find(p => p.route === e.pageRoute)?.texts.find(t => /\bva-eyebrow\b/.test(t.class))
      if (mine && files.es !== undefined) files.es = setEsKey(files.es, route, mine.key, autoSpanish(mine.inner) || mine.inner)
    } else {
      files.flow = insertScreen(files.flow, e.route, block, 'follow-up')
    }
    if (files.es !== undefined) {
      if (e.placement === 'own-screen') files.es = setEsKey(files.es, route, 'title', spanishFor(change, route, 'title') || e.pageTitle || e.question, spanishFor(change, route, 'title') ? undefined : needsNote(change))
      for (const k of questionKeys(e)) {
        const given = spanishFor(change, route, k.key)
        files.es = setEsKey(files.es, route, k.key, given || k.en, given ? undefined : needsNote(change))
      }
    }
    return
  }
  if (e.type === 'remove-question') {
    const k = Object.keys(files.facts).find(k => files.facts[k].includes(`<!-- ${e.marker} -->`))
    if (!k) throw new EditConflict('The fact this change added is no longer in the files.')
    files.facts = { ...files.facts, [k]: removeFactMarked(files.facts[k], e.marker) }
    if (files.flow !== undefined) {
      files.flow = removeMarked(files.flow, e.marker, e.placement === 'own-screen' ? 'page' : 'div')
      if (e.placement === 'own-screen') {
        const rn = renumberEyebrows(files.flow)
        files.flow = rn.xml
        for (const r of rn.renames) applyTextRename(files, change, r.route, 'p', r.before, r.after, changedNote(change))
      }
    }
    if (files.es !== undefined) {
      const route = e.placement === 'own-screen' ? e.pageRoute : e.route
      for (const k of e.keys || []) files.es = removeEsKey(files.es, route, k)
      if (e.placement === 'own-screen') files.es = removeEsKey(files.es, route, 'title')
    }
    return
  }
  throw new Error(`Unknown edit type ${e.type}`)
}

/**
 * Apply every edit of a change. `files` is { facts: { <module>: xml } } and, for a change that
 * touches screens, also { flow, es }. Returns the new texts (same keys). An edit finds its module by
 * the fact's path, so a fact that moved between modules since the draft was made is still found;
 * `edit.file` is only a hint for the reader.
 */
export function applyChange (files, change, date) {
  const out = { ...files, facts: { ...files.facts } }
  const ctx = { id: change.id, source: change.source || {}, date: date || (change.published?.at || new Date().toISOString()).slice(0, 10) }
  for (const e of change.edits || []) {
    if (e.type === 'value' || e.type === 'rule' || e.type === 'schedule') {
      const key = fileOfFact(out.facts, e.path)
      if (!key) throw new EditConflict(`The fact ${e.path} is no longer in the files.`, e)
      out.facts[key] = applyEdit(out.facts[key], e, ctx)
    } else applyWideEdit(out, e, change)
  }
  return out
}

/** Apply a change's example edits (and baseline edits) to the examples file's data. */
export function applyExampleEdits (examples, change) {
  let list = examples.map(x => ({ ...x }))
  for (const e of change.exampleEdits || []) {
    if (e.op === 'add') list.push(e.example)
    else if (e.op === 'update') list = list.map(x => (x.id === e.example.id ? e.example : x))
    else if (e.op === 'remove') list = list.filter(x => x.id !== e.id)
  }
  return list
}

/** The baseline answers after a change: a new question gets its default, a removed one is dropped. */
export function applyBaselineEdits (baseline, change) {
  const out = { ...baseline }
  for (const e of change.edits || []) {
    if (e.type === 'question' && e.default !== undefined) out[e.path] = e.default
    if (e.type === 'remove-question') delete out[e.path]
  }
  return out
}

/**
 * The words a change adds or changes, with the Spanish it has for each: for the translator's
 * list and the translation check. Each is { route, key, en, es, auto }.
 */
export function translationNeeds (change, files) {
  const out = []
  const add = (route, key, en) => {
    const es = spanishFor(change, route, key)
    const auto = autoSpanish(en)
    out.push({ route, key, en, es: es || auto || null, auto: !!auto && !es })
  }
  for (const e of change.edits || []) {
    if (e.type === 'text') add(e.route, keyFor(e.tag || 'p', e.after), e.after)
    if (e.type === 'question') {
      const route = e.placement === 'own-screen' ? e.pageRoute : e.route
      if (e.placement === 'own-screen') add(route, 'title', e.pageTitle || e.question)
      for (const k of questionKeys(e)) add(route, k.key, k.en)
    }
  }
  if (files?.flow !== undefined) {
    // Renumbered eyebrows are translated by the tool; they are listed so the reviewer sees them.
    try {
      const before = pages(files.flow)
      const after = pages(applyChange(files, change).flow)
      for (const p of after) {
        const old = before.find(x => x.route === p.route)
        for (const t of p.texts) if (/\bva-eyebrow\b/.test(t.class) && autoSpanish(t.inner) && !old?.texts.some(x => x.key === t.key)) add(p.route, t.key, t.inner)
      }
    } catch { /* a conflict is reported elsewhere */ }
  }
  return out
}

/** Whether every word a change touches has Spanish. */
export const fullyTranslated = (change, files) => translationNeeds(change, files).every(n => n.es)

/** The edits that undo a published change, as a new change's edits. */
export function revertEdits (change, published) {
  const out = []
  for (const e of change.edits || []) {
    if (e.type === 'value') out.push({ type: 'value', file: e.file, path: e.path, from: e.to, to: e.from })
    else if (e.type === 'rule') out.push({ type: 'rule', file: e.file, path: e.path, before: e.derived, derived: e.before, because: `Reverts change #${change.id}: ${e.because || ''}`.trim() })
    else if (e.type === 'schedule') out.push({ type: 'schedule', file: e.file, path: e.path, before: scheduleDerived({ tag: e.tag, base: e.base, steps: e.steps }), tag: e.tag, base: e.fromBase, steps: e.fromSteps || [], fromBase: e.base, fromSteps: e.steps })
    else if (e.type === 'text') out.push({ type: 'text', route: e.route, tag: e.tag, before: e.after, after: e.before })
    else if (e.type === 'question') out.push({ type: 'remove-question', path: e.path, marker: MARK(change, e.path), placement: e.placement, route: e.route, pageRoute: e.pageRoute, keys: questionKeys(e).map(k => k.key) })
  }
  void published
  return out
}
