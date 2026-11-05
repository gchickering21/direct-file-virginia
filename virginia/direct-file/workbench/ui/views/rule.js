// The rule editor: a line's <Derived> as a tree, drawn as plain language (If … then … otherwise) or
// as XML, edited in place; the checks beside it; and the handlers for every edit to the tree.

import { derivedTree, derivedXml, el, elementKids, feedsLines, humanize, lit, literalLabel } from '../model.js'
import { chip, describeAny, lineStatus } from '../chips.js'
import { activeChange, ensureDraft, published, saveSoon } from '../draft.js'
import { run } from '../runner.js'
import { render } from '../shell.js'
import { S, STATUS, canEdit, cite, esc } from '../state.js'
import { impactPanelBody } from './values.js'

export function ruleState (fact) {
  if (!S.rule[fact.path]) {
    const c = activeChange()
    const e = c?.edits.find(x => x.type === 'rule' && x.path === fact.path)
    let tree = derivedTree(fact)
    if (e) { try { tree = derivedTree(e.derived) } catch { /* keep published */ } }
    S.rule[fact.path] = { tree, because: e?.because || '', tab: 'plain', xmlText: null, xmlError: null }
  }
  return S.rule[fact.path]
}

export function viewRule (path) {
  const f = S.model.facts.get(path)
  if (!f) return `<p>No fact ${esc(path)}. <a href="#/">Back to Form 760</a></p>`
  if (f.kind === 'value') { location.hash = '#/values'; return '' }
  const c = activeChange()
  const st = f.kind === 'rule' ? ruleState(f) : null
  const editable = canEdit() && f.kind === 'rule'
  const other = lineStatus(f.path)
  const edited = c?.edits.some(e => e.path === f.path)
  let body
  if (f.kind === 'asked') {
    body = `<p>This is a question the filer answers${f.writable.type ? ` (${esc(humanize(f.writable.type))})` : ''}. Its wording is on <a href="#/screens">its screen</a>; a new question is added with the <a href="#/question/new">question builder</a>, and anything the return cannot model yet is a request to engineering.</p><button class="btn sec sm" data-act="new-request">Ask engineering →</button>`
  } else if (f.kind === 'options') {
    body = '<p>A fixed list of choices. Engineering maintains these.</p>'
  } else if (st.tab === 'xml') {
    const text = st.xmlText ?? stripMarks(derivedXml(st.tree))
    body = `<p class="cite">The same rule as code. ${editable ? 'Edit it here and apply; the plain-language view updates from it.' : ''}</p>
      <textarea class="code" id="xml-text" ${editable ? '' : 'readonly'} spellcheck="false" aria-label="Rule XML">${esc(text)}</textarea>
      ${st.xmlError ? `<p class="err">${esc(st.xmlError)}</p>` : ''}
      ${editable ? '<div class="add-row"><button class="btn sm" data-act="xml-apply">Apply XML</button><button class="btn quiet sm" data-act="xml-reset">Reset to the plain view</button></div>' : ''}`
  } else if (st.tab === 'used') {
    const users = (S.model.usedBy.get(f.path) || []).map(p => S.model.facts.get(p)).filter(Boolean)
    body = `<p>Feeds Form 760 ${feedsLines(S.model, f.path, 20).map(l => 'Line ' + l).join(', ') || '(no line directly)'}.</p>
      <p><b>Used directly by</b></p><div class="expr" style="display:grid;gap:6px">${users.map(u => chip(u.path)).join('') || '<span class="muted">Nothing</span>'}</div>`
  } else {
    body = `${renderRoot(st.tree, editable)}
      <div class="legend"><span><span class="ty asked">Asked</span> the filer answers it</span><span><span class="ty federal">Federal</span> from the federal return</span><span><span class="ty calc">Calc</span> another rule</span><span><span class="ty value">Value</span> from the values table</span><span><span class="ty req">Requested</span> engineering is adding it</span></div>`
  }
  return `
    <div class="crumb"><a href="#/">Form 760</a> › ${f.line ? `Line ${esc(f.line.label)}` : esc(f.name)}</div>
    ${other && other !== c ? `<p class="pill warn" style="display:inline-block;margin-bottom:10px">Change #${other.id} (${STATUS[other.status][0].toLowerCase()}) already edits this rule. <a href="#/change/${other.id}">Open it</a></p>` : ''}
    <div class="split">
      <div class="stack">
        <div class="card">
          <div class="card-h">
            <div><h2>${esc(f.name)}</h2>
              <div class="cite">${cite(f.description)}</div>
              <div class="cite" style="margin-top:2px"><code>${esc(f.path)}</code> in <code title="${esc(S.data.paths.facts[f.file])}">${esc((S.data.paths.facts[f.file] || f.file).split('/').pop())}</code></div>
            </div>
            ${f.kind === 'rule' ? `<div class="tabs" role="tablist">${[['plain', 'Plain language'], ['xml', 'XML'], ['used', 'Used by']].map(([k, l]) => `<button role="tab" aria-selected="${st.tab === k}" data-act="tab" data-tab="${k}">${l}</button>`).join('')}</div>` : ''}
          </div>
          <div class="card-b">${body}</div>
        </div>
        ${f.kind === 'rule' && editable && edited ? `<div class="panel"><div class="panel-h">Why this change <span class="req-mark">required</span></div><div class="panel-b"><input type="text" id="because" data-act="because" value="${esc(st.because)}" style="width:100%" placeholder="Say what the law requires, and cite it. The reviewer reads this first."></div></div>` : ''}
      </div>
      <div class="stack">
        ${f.kind === 'rule' ? `<div class="panel"><div class="panel-h">Checks</div><div class="panel-b" id="rule-checks">${ruleChecksBody()}</div></div>` : ''}
        <div class="panel" id="impact-panel">${impactPanelBody()}</div>
        ${editable ? `<div class="panel"><div class="panel-h">Need something the return doesn't know?</div><div class="panel-b"><p style="margin:0 0 8px">If the rule turns on something only the filer can say, add the question: the tool writes the fact, the screen and the words, and it is in the picker at once. If the return cannot model it at all, ask engineering.</p><div class="add-row"><a class="btn sm" href="#/question/new">+ Add a question</a><button class="btn sec sm" data-act="new-request">Ask engineering →</button></div></div></div>` : ''}
      </div>
    </div>`
}

export function currentRuleFact () { return S.route[0] === 'rule' ? S.model.facts.get(decodeURIComponent(S.route[1])) : null }


export function ruleChecksBody () {
  const f = currentRuleFact()
  if (!f || f.kind !== 'rule') return ''
  const st = ruleState(f)
  const all = []
  walk(st.tree, n => { if (n.tag === 'Dependency') all.push(n.attrs.path || '') })
  const blanks = all.filter(p => !p).length
  const unknown = all.filter(p => p && describeAny(p).kind === 'missing')
  const requested = unknown.filter(p => S.data.requests.some(r => r.factPath === p && r.status === 'open'))
  const bad = unknown.filter(p => !requested.includes(p))
  const self = reaches(all.filter(Boolean), f.path)
  const I = S.impact
  const c = activeChange()
  const edited = c?.edits.some(e => e.path === f.path)
  const li = (cls, sym, text) => `<li><span class="dot ${cls}">${sym}</span><span>${text}</span></li>`
  const rows = [
    blanks ? li('bad', '!', `${blanks} blank${blanks > 1 ? 's' : ''} to fill (“choose…”).`) : li('ok', '✓', 'Every blank is filled'),
    bad.length ? li('bad', '!', `Uses something that does not exist: ${bad.map(esc).join(', ')}`) : null,
    requested.length ? li('req', '#', `Uses something engineering is still building. You can save, but not send for review yet.`) : null,
    self ? li('bad', '!', 'This rule would depend on itself.') : li('ok', '✓', 'No rule depends on itself'),
    edited && !st.because.trim() ? li('bad', '!', 'Say why (below the rule).') : null,
  ].filter(Boolean)
  let ex = li('wait', '…', 'Worked examples: running')
  if (I?.draft && I.change === c && !I.draft.error) {
    const n = I.examples.length
    const pass = I.examples.filter(x => I.draft.results[x.id]?.pass).length
    ex = pass === n ? li('ok', '✓', `Worked examples: all ${n} pass`) : li('bad', '!', `Worked examples: ${pass} of ${n} pass. <a href="#/examples">See which</a>`)
  } else if (I?.draft?.error && requested.length) ex = li('req', '#', 'Worked examples run once the request is built.')
  else if (I?.draft?.error) ex = li('bad', '!', 'The rules do not load with this draft (see below).')
  else if (!c && I?.base) ex = li('ok', '✓', 'Worked examples: run on the published rules')
  return `<ul class="checks">${rows.join('')}${ex}</ul>`
}

function walk (n, fn) { if (!n) return; fn(n); for (const c of n.children || []) walk(c, fn) }

function reaches (starts, target) {
  const seen = new Set()
  const stack = [...starts]
  while (stack.length) {
    const p = stack.pop()
    if (p === target) return true
    if (seen.has(p)) continue
    seen.add(p)
    stack.push(...((S.model.facts.get(p) || S.draftModel?.facts.get(p))?.deps || []))
  }
  return false
}

// --- plain-language rendering of the tree ---

export const CMP = { GreaterThan: 'is more than', GreaterThanOrEqual: 'is at least', LessThan: 'is less than', LessThanOrEqual: 'is at most', Equal: 'is', NotEqual: 'is not' }
const JOIN = { Add: 'plus', Multiply: 'times', All: 'and', Any: 'or' }

export function renderRoot (tree, editable) {
  const ctx = { editable }
  if (tree.tag === 'Switch') return renderSwitch(tree, '', ctx)
  return `<div class="clause"><span class="kw">Equals</span><div class="body">${renderExpr(tree, '', ctx)}</div><span></span></div>${editable ? limitButtons('') : ''}`
}

export const at = (base, i) => (base === '' ? String(i) : `${base}.${i}`)

function renderSwitch (sw, path, ctx) {
  const items = []
  let because = null
  sw.children.forEach((c, i) => {
    if (c.tag === '#comment') { because = { text: c.text, i }; return }
    if (c.tag !== 'Case') return
    items.push({ node: c, i, because })
    because = null
  })
  const last = items.length - 1
  const out = items.map((it, k) => {
    const [when, then] = elementKids(it.node)
    const whenExpr = elementKids(when)[0]
    const always = whenExpr?.tag === 'True'
    const kw = always ? (k === 0 ? 'Always' : 'Otherwise') : k === 0 ? 'If' : 'Else if'
    const isNew = it.node.attrs['data-new'] !== undefined
    const tools = ctx.editable ? `<span class="tools">${k > 0 && !always ? `<button class="x" title="Check earlier" aria-label="Move up" data-act="case-up" data-at="${at(path, it.i)}">↑</button>` : ''}${k < last && !(items[k + 1] && elementKids(elementKids(items[k + 1].node)[0])[0]?.tag === 'True') ? `<button class="x" title="Check later" aria-label="Move down" data-act="case-down" data-at="${at(path, it.i)}">↓</button>` : ''}${items.length > 1 && !always ? `<button class="x" title="Remove this case" aria-label="Remove case" data-act="case-rm" data-at="${at(path, it.i)}">✕</button>` : ''}</span>` : '<span></span>'
    const whenPath = at(at(path, it.i), it.node.children.indexOf(when))
    const thenPath = at(at(path, it.i), it.node.children.indexOf(then))
    const thenExpr = elementKids(then)[0]
    const thenAt = at(thenPath, then.children.indexOf(thenExpr))
    const note = it.because ? it.because.text.replace(/^Because:\s*/i, '') : ''
    return `<div class="clause ${isNew ? 'new' : ''}">
      <span class="kw">${kw}</span>
      <div class="body">${always ? '<span class="muted">(every other case)</span>' : renderCondition(whenExpr, at(whenPath, when.children.indexOf(whenExpr)), ctx)}</div>
      ${tools}
      <span class="kw" style="padding-top:2px">Then</span>
      <div class="body">→ ${renderExpr(thenExpr, thenAt, ctx)}</div>
      <span>${ctx.editable ? limitButtons(thenAt, true) : ''}</span>
      ${ctx.editable && (isNew || it.because) ? `<span class="kw" style="padding-top:2px">Because</span><div class="because"><input type="text" data-act="case-because" data-at="${at(path, it.i)}" value="${esc(note)}" placeholder="Why this case exists, with the law (becomes a comment in the code)"></div>` : note ? `<span class="kw" style="padding-top:2px">Because</span><div class="body muted">${esc(note)}</div><span></span>` : ''}
    </div>`
  })
  return out.join('') + (ctx.editable ? `<div class="add-row"><button class="btn sec sm" data-act="add-case" data-at="${path}">+ Add an exception (checked first)</button></div>` : '')
}

function limitButtons (p, small) {
  return `<span class="add-row" style="margin:0"><button class="btn quiet sm" data-act="limit" data-kind="GreaterOf" data-at="${p}" title="Wrap in: no less than">+ no less than</button><button class="btn quiet sm" data-act="limit" data-kind="LesserOf" data-at="${p}" title="Wrap in: no more than">+ no more than</button></span>`
}

function renderCondition (n, p, ctx) {
  if (!n) return '<span class="muted">—</span>'
  if (CMP[n.tag]) {
    const [l, r] = elementKids(n)
    const li = n.children.indexOf(l)
    const ri = n.children.indexOf(r)
    const L = elementKids(l)[0]
    const R = elementKids(r)[0]
    return `${renderExpr(L, at(at(p, li), l.children.indexOf(L)), ctx)} ${opSelect(n.tag, p, ctx)} ${renderExpr(R, at(at(p, ri), r.children.indexOf(R)), ctx)}`
  }
  if (n.tag === 'Dependency' || n.tag === 'True' || n.tag === 'False') {
    return `${renderExpr(n, p, ctx)} ${opSelect('IsYes', p, ctx)}`
  }
  return renderExpr(n, p, ctx)
}

function opSelect (tag, p, ctx) {
  const label = tag === 'IsYes' ? 'is yes' : CMP[tag]
  if (!ctx.editable) return `<span class="op">${label}</span>`
  const opts = [['IsYes', 'is yes'], ...Object.entries(CMP)]
  return `<select class="op-select" data-act="cmp" data-at="${p}" aria-label="Comparison">${opts.map(([k, l]) => `<option value="${k}" ${k === tag ? 'selected' : ''}>${l}</option>`).join('')}</select>`
}

function renderExpr (n, p, ctx) {
  if (!n) return '<span class="muted">—</span>'
  const kids = elementKids(n)
  const idx = c => at(p, n.children.indexOf(c))
  switch (n.tag) {
    case 'Dependency':
      return chip(n.attrs.path, { at: p, editable: ctx.editable })
    case 'Dollar': case 'Int': case 'Rational': case 'Decimal':
      return ctx.editable ? `<button class="chip num" data-act="pick" data-at="${p}"><span class="ty value">Amount</span> ${esc(literalLabel(n.tag, n.text))} <span class="caret">▾</span></button>` : `<span class="chip num">${esc(literalLabel(n.tag, n.text))}</span>`
    case 'True': return '<span class="op">yes</span>'
    case 'False': return '<span class="op">no</span>'
    case 'Enum': return `<span class="chip">“${esc(humanize(n.text))}”</span>`
    case 'String': return `<span class="chip">“${esc(n.text)}”</span>`
    case 'Day': return `<span class="chip">${esc(n.text)}</span>`
    case 'Switch': return `<div class="expr group" style="flex-basis:100%">${renderSwitch(n, p, ctx)}</div>`
    case 'Not': return `<span class="op">not</span> ${renderCondition(kids[0], idx(kids[0]), ctx)}`
    case 'Round': return `${renderExpr(kids[0], idx(kids[0]), ctx)} <span class="op">rounded to the dollar</span>`
    case 'Count': return `<span class="op">the number of</span> ${renderExpr(kids[0], idx(kids[0]), ctx)}`
    case 'CollectionSum': return `<span class="op">the total of every</span> ${renderExpr(kids[0], idx(kids[0]), ctx)}`
    case 'GreaterOf': case 'LesserOf': {
      const word = n.tag === 'GreaterOf' ? 'no less than' : 'no more than'
      if (kids.length === 2 && /^(Dollar|Int|Rational|Decimal)$/.test(kids[1].tag)) {
        return `<span class="expr">${renderExpr(kids[0], idx(kids[0]), ctx)} <span class="op">but ${word}</span> ${renderExpr(kids[1], idx(kids[1]), ctx)}${ctx.editable ? `<button class="x" title="Remove the limit" aria-label="Remove limit" data-act="unlimit" data-at="${p}">✕</button>` : ''}</span>`
      }
      return `<span class="op">the ${n.tag === 'GreaterOf' ? 'larger' : 'smaller'} of</span> ${operands(n, p, ctx, 'and')}`
    }
    case 'Add': case 'Multiply': case 'All': case 'Any':
      return operands(n, p, ctx, JOIN[n.tag], n.tag === 'All' ? 'all of:' : n.tag === 'Any' ? 'any of:' : '')
    case 'Subtract': {
      const min = kids.find(k => k.tag === 'Minuend')
      const subs = kids.find(k => k.tag === 'Subtrahends')
      const m0 = elementKids(min)[0]
      return `<span class="expr">${renderExpr(m0, at(idx(min), min.children.indexOf(m0)), ctx)} <span class="op">minus</span> ${operands(subs, idx(subs), ctx, 'minus')}</span>`
    }
    default: {
      if (CMP[n.tag]) return renderCondition(n, p, ctx)
      // An operator the plain view has no sentence for: show it, and its parts, read-only. Editing a
      // chip inside it would write a tree the plain view cannot check, so that goes through the XML tab.
      const ro = { ...ctx, editable: false }
      return `<span class="expr group"><span class="raw" title="${esc(n.tag)}: not editable in plain language">${esc(n.tag)}</span> ${kids.map(k => renderExpr(k, idx(k), ro)).join(' ')}${ctx.editable ? ' <button class="btn quiet sm" data-act="tab" data-tab="xml" title="This operator has no plain-language form">edit in XML</button>' : ''}</span>`
    }
  }
}

function operands (n, p, ctx, word, lead = '') {
  const kids = elementKids(n)
  const parts = kids.map(k => {
    const kp = at(p, n.children.indexOf(k))
    const rm = ctx.editable && kids.length > 1 ? `<button class="x" title="Remove" aria-label="Remove" data-act="rm" data-at="${kp}">✕</button>` : ''
    const inner = ['Add', 'Subtract', 'Multiply', 'All', 'Any', 'Switch', 'GreaterOf', 'LesserOf'].includes(k.tag) ? `<span class="expr group">${renderExpr(k, kp, ctx)}</span>` : (CMP[k.tag] || k.tag === 'Not') ? renderCondition(k, kp, ctx) : renderExpr(k, kp, ctx)
    return `${inner}${rm}`
  })
  const add = ctx.editable && ['Add', 'Subtrahends', 'All', 'Any'].includes(n.tag) ? ` <button class="btn quiet sm" data-act="add-operand" data-at="${p}">+ ${word === 'and' || word === 'or' ? 'condition' : word}</button>` : ''
  return `<span class="expr">${lead ? `<span class="op">${lead}</span> ` : ''}${parts.join(` <span class="op">${word}</span> `)}${add}</span>`
}

// --- what kind of thing an operand is, so a new comparison gets a literal of the right type ---

const NUMERIC = { Dollar: 'dollar', Int: 'int', Rational: 'rational', Decimal: 'decimal', Day: 'day', Enum: 'enum', String: 'string', True: 'boolean', False: 'boolean' }
const BOOL_OPS = new Set(['All', 'Any', 'Not', 'Equal', 'NotEqual', 'LessThan', 'LessThanOrEqual', 'GreaterThan', 'GreaterThanOrEqual', 'IsComplete'])
const DOLLAR_OPS = new Set(['Add', 'Subtract', 'Multiply', 'GreaterOf', 'LesserOf', 'Round', 'CollectionSum', 'TrimDollar'])

/** 'dollar' | 'int' | 'rational' | 'day' | 'enum' | 'boolean' | 'string' | null for an expression. */
export function operandType (n, depth = 0) {
  if (!n || depth > 8) return null
  if (NUMERIC[n.tag]) return NUMERIC[n.tag]
  if (BOOL_OPS.has(n.tag)) return 'boolean'
  if (DOLLAR_OPS.has(n.tag)) return 'dollar'
  if (n.tag === 'Count') return 'int'
  if (n.tag === 'Switch') { const kase = elementKids(n)[0]; const then = kase && elementKids(kase)[1]; return operandType(then && elementKids(then)[0], depth + 1) }
  if (n.tag === 'Dependency') return pathType(n.attrs.path, depth + 1)
  return null
}

function pathType (path, depth = 0) {
  const f = S.model.facts.get(path) || S.draftModel?.facts.get(path)
  if (f) {
    if (f.writable) return f.writable.type
    if (f.literal) return NUMERIC[f.literal.tag] || null
    if (f.kind === 'rule') { try { return operandType(derivedTree(f), depth + 1) } catch { return null } }
    return null
  }
  const fed = S.model.federalByPath.get(path)
  if (fed) return { count: 'int', dollarList: 'dollar' }[fed.type] || fed.type
  const req = S.data.requests.find(r => r.factPath === path && r.status === 'open')
  return req ? req.answerType : null
}

/** A literal to compare an expression with: zero of its own type, today for a date, the first option for a list. */
export function defaultLiteral (n) {
  const type = operandType(n)
  if (type === 'int') return lit('Int', 0)
  if (type === 'rational') return lit('Rational', '0/1')
  if (type === 'day') return lit('Day', new Date().toISOString().slice(0, 10))
  if (type === 'boolean') return el('True')
  if (type === 'enum') {
    const f = n?.tag === 'Dependency' ? S.model.facts.get(n.attrs.path) : null
    const opts = f?.writable?.optionsPath ? S.model.facts.get(f.writable.optionsPath) : null
    const first = opts?.derivedText?.match(/<String>([^<]+)<\/String>/)?.[1]
    const fed = n?.tag === 'Dependency' ? S.model.federalByPath.get(n.attrs.path) : null
    return lit('Enum', first || fed?.options?.[0] || '')
  }
  if (type === 'string') return lit('String', '')
  return lit('Dollar', 0)
}

// --- tree edits ---

export function nodeAt (tree, p) {
  if (p === '') return { node: tree, parent: null, index: -1 }
  const idx = p.split('.').map(Number)
  let parent = null
  let node = tree
  for (const i of idx) { parent = node; node = node.children[i] }
  return { node, parent, index: idx[idx.length - 1] }
}

export function replaceAt (st, p, fn) {
  if (p === '') { st.tree = fn(st.tree); return }
  const { parent, index } = nodeAt(st.tree, p)
  parent.children[index] = fn(parent.children[index])
}

export async function treeChanged (fact) {
  const st = ruleState(fact)
  st.xmlText = null
  const c = await ensureDraft()
  if (!c) { delete S.rule[fact.path]; render(); return }
  const derived = derivedXml(st.tree)
  const same = stripMarks(derived).replace(/\s+/g, '') === derivedXml(derivedTree(fact)).replace(/\s+/g, '')
  c.edits = c.edits.filter(e => !(e.type === 'rule' && e.path === fact.path))
  if (!same) c.edits.push({ type: 'rule', file: fact.file, path: fact.path, before: fact.derivedText, derived: stripMarks(derived), because: st.because })
  // Requested facts the rule now uses.
  const used = []
  for (const e of c.edits.filter(x => x.type === 'rule')) for (const m of e.derived.matchAll(/path="([^"]+)"/g)) used.push(m[1])
  c.requestIds = S.data.requests.filter(r => r.status === 'open' && used.includes(r.factPath)).map(r => r.id)
  saveSoon(c)
  render()
}

export const stripMarks = xml => xml.replace(/ data-new=""/g, '')
