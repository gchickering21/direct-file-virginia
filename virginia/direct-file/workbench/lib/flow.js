// The Virginia flow file as the workbench reads and edits it: its pages, the screens on each page,
// the text the filer reads, the questions asked, and the locale key form-builder gives each one.
//
// Plain string work, no DOM, shared by the browser and Node. A small tokenizer builds a tree of the
// file; the key rules follow form-builder's parser (parser/Html.scala, FgSet.scala,
// TranslationContext.scala): a leaf element's key is `tag-<md5 of its inner markup>`, an element
// with block children is a level named `tag-N` (N counting within its parent), `div`, `details`,
// `summary` and `section` add no level, and an `<fg-set>` is keyed by its fact path. Edits are
// text splices on the file, so hand formatting elsewhere is left alone.

import { hashKey } from './md5.js'

const INLINE = new Set(['fg-show', 'span', 'strong', 'em', 'a', 'br', 'b', 'i', 'code', 'abbr', 'sup', 'sub', 'small'])
const IGNORED = new Set(['div', 'details', 'summary', 'section'])
const TEXT_TAGS = new Set(['p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'li', 'th', 'td', 'caption', 'label', 'legend', 'dt', 'dd', 'figcaption', 'blockquote'])

// ---------------------------------------------------------------------------------------------
// A tree of the file: { tag, attrs, start, end, innerStart, innerEnd, children }

const TAG_RE = /<!--[\s\S]*?-->|<\?[\s\S]*?\?>|<(\/?)([A-Za-z][\w:.-]*)((?:\s+[\w:.-]+="[^"]*")*)\s*(\/?)>/g

export function parseTree (xml) {
  const root = { tag: '#root', attrs: {}, start: 0, end: xml.length, innerStart: 0, innerEnd: xml.length, children: [] }
  const stack = [root]
  for (const m of xml.matchAll(TAG_RE)) {
    if (m[0].startsWith('<!--') || m[0].startsWith('<?')) continue
    const [, close, name, attrText, selfClose] = m
    const top = stack[stack.length - 1]
    if (close) {
      if (top.tag !== name) throw new Error(`The flow file is not well-formed near "${xml.slice(m.index, m.index + 40)}": expected </${top.tag}>.`)
      top.innerEnd = m.index
      top.end = m.index + m[0].length
      stack.pop()
      continue
    }
    const attrs = {}
    for (const a of attrText.matchAll(/([\w:.-]+)="([^"]*)"/g)) attrs[a[1]] = a[2]
    const node = { tag: name, attrs, start: m.index, end: m.index + m[0].length, innerStart: m.index + m[0].length, innerEnd: m.index + m[0].length, children: [] }
    top.children.push(node)
    if (!selfClose) stack.push(node)
  }
  if (stack.length > 1) throw new Error(`The flow file is not well-formed: <${stack[stack.length - 1].tag}> is never closed.`)
  return root
}

const isLeaf = n => n.children.every(c => INLINE.has(c.tag))

/**
 * Inner markup the way scala-xml re-serializes it, which is what form-builder hashes: text nodes
 * have `"` and `>` escaped (`&quot;`, `&gt;`); tags are left as written.
 */
export function canonical (inner) {
  return String(inner).split(/(<[^>]*>)/).map((part, i) => (i % 2 ? part : part.replace(/"/g, '&quot;').replace(/>/g, '&gt;'))).join('')
}
/** The key for a leaf element's inner markup, as form-builder would write it. */
export const keyFor = (tag, inner) => hashKey(tag, canonical(inner))

/**
 * Every page in the file: route, title, where it sits, its screens (the df-screen blocks with their
 * conditions), the text elements the filer reads with their locale keys, and the questions asked.
 */
export function pages (xml) {
  const root = parseTree(xml)
  const flow = root.children.find(c => c.tag === 'FlowConfig') || root
  return flow.children.filter(c => c.tag === 'page').map(p => {
    const texts = []
    const questions = []
    const screens = []
    const walk = (n, ctx, counts, screen) => {
      for (const c of n.children) {
        if (c.tag === 'fg-set') {
          const q = c.children.find(k => k.tag === 'question')
          const input = c.children.find(k => k.tag === 'input')
          questions.push({ path: c.attrs.path, key: [...ctx, c.attrs.path].join('.'), question: q ? xml.slice(q.innerStart, q.innerEnd).trim() : '', type: input?.attrs.type || '', screen, start: c.start, end: c.end })
          continue
        }
        if (c.tag === 'fg-collection' || c.tag === 'fg-show') continue
        const condition = c.attrs.condition ? { path: c.attrs.condition, operator: c.attrs.operator || 'isTrue' } : null
        let here = screen
        if (c.tag === 'div' && /\bdf-screen\b/.test(c.attrs.class || '')) {
          here = { condition, start: c.start, end: c.end, innerStart: c.innerStart, innerEnd: c.innerEnd, texts: [], questions: [] }
          screens.push(here)
        }
        if (TEXT_TAGS.has(c.tag) && isLeaf(c)) {
          const inner = xml.slice(c.innerStart, c.innerEnd)
          const key = [...ctx, hashKey(c.tag, canonical(inner))].join('.')
          const t = { tag: c.tag, key, inner: inner.trim(), raw: inner, start: c.innerStart, end: c.innerEnd, condition, class: c.attrs.class || '', screen: here }
          texts.push(t)
          if (here) here.texts.push(t)
          continue
        }
        if (IGNORED.has(c.tag)) { walk(c, ctx, counts, here); continue }
        if (isLeaf(c)) continue
        const n0 = (counts[c.tag] ?? -1) + 1
        counts[c.tag] = n0
        walk(c, [...ctx, `${c.tag}-${n0}`], {}, here)
      }
    }
    walk(p, [], {}, null)
    for (const q of questions) if (q.screen) q.screen.questions.push(q)
    const section = p.children.find(c => c.tag === 'section')
    return { route: p.attrs.route, title: p.attrs.title, start: p.start, end: p.end, innerStart: p.innerStart, innerEnd: p.innerEnd, sectionEnd: section ? section.innerEnd : p.innerEnd, screens, texts, questions }
  })
}

// ---------------------------------------------------------------------------------------------
// Edits

export class FlowConflict extends Error { constructor (message) { super(message); this.code = 'CONFLICT' } }

function indentOfLine (xml, index) {
  const ls = xml.lastIndexOf('\n', index - 1) + 1
  return xml.slice(ls, index).match(/^\s*/)[0]
}

/** Replace one text element's inner markup on one page. `before` must occur exactly once on the page. */
export function replaceText (xml, route, before, after) {
  const page = pages(xml).find(p => p.route === route)
  if (!page) throw new FlowConflict(`No page ${route} in the flow.`)
  const hits = page.texts.filter(t => t.inner === String(before).trim())
  if (hits.length !== 1) throw new FlowConflict(hits.length ? `“${String(before).slice(0, 60)}…” appears ${hits.length} times on ${route}; the edit is ambiguous.` : `The text “${String(before).slice(0, 60)}” is no longer on ${route}; someone changed it.`)
  const t = hits[0]
  const lead = t.raw.match(/^\s*/)[0]
  const trail = t.raw.match(/\s*$/)[0]
  return xml.slice(0, t.start) + lead + String(after).trim() + trail + xml.slice(t.end)
}

/**
 * Add a screen. `placement` is "follow-up" (a df-screen block at the end of the page's section) or
 * "own-screen" (a new page right after it). `block` is written at column 0 and re-indented.
 */
export function insertScreen (xml, route, block, placement = 'follow-up', newPage = null) {
  const page = pages(xml).find(p => p.route === route)
  if (!page) throw new FlowConflict(`No page ${route} in the flow.`)
  const reindent = (text, indent) => text.trim().split('\n').map(l => (l ? indent + l : l)).join('\n')
  if (placement === 'own-screen') {
    const indent = indentOfLine(xml, page.start)
    const pageXml = `${indent}<page title="${escAttr(newPage.title)}" route="${escAttr(newPage.route)}">\n${indent}  <section>\n${reindent(block, indent + '    ')}\n${indent}  </section>\n${indent}</page>`
    return xml.slice(0, page.end) + '\n' + pageXml + xml.slice(page.end)
  }
  const at = page.sectionEnd
  const lastScreen = page.screens[page.screens.length - 1]
  const indent = lastScreen ? indentOfLine(xml, lastScreen.start) : indentOfLine(xml, at) + '  '
  const before = xml.slice(0, at).replace(/\s+$/, '')
  return before + '\n' + reindent(block, indent) + '\n' + indentOfLine(xml, at) + xml.slice(at)
}

/** Remove the element (`level`: "div" or "page") holding the marker comment a change wrote. */
export function removeMarked (xml, marker, level = 'div') {
  const i = xml.indexOf(marker)
  if (i < 0) throw new FlowConflict('The block this change added is no longer in the flow.')
  const root = parseTree(xml)
  let target = null
  const walk = n => { for (const c of n.children) { if (c.start <= i && i < c.end) { if (c.tag === level) target = c; walk(c) } } }
  walk(root)
  if (!target) throw new FlowConflict('The block this change added is no longer in the flow.')
  const ls = xml.lastIndexOf('\n', target.start - 1) + 1
  const le = xml.indexOf('\n', target.end)
  return xml.slice(0, ls) + xml.slice(le < 0 ? xml.length : le + 1)
}

/** Renumber "Question N of M" eyebrows across the Virginia question pages, in page order. */
export function renumberEyebrows (xml) {
  const ps = pages(xml)
  const eyebrows = []
  for (const p of ps) for (const t of p.texts) if (/\bva-eyebrow\b/.test(t.class) && /^Question \d+ of \d+$/.test(t.inner)) eyebrows.push({ page: p, t })
  const n = eyebrows.length
  const renames = []
  let out = xml
  // Right to left so earlier offsets stay valid.
  eyebrows.slice().reverse().forEach(({ page, t }, k) => {
    const i = n - 1 - k
    const text = `Question ${i + 1} of ${n}`
    if (text === t.inner) return
    out = out.slice(0, t.start) + text + out.slice(t.end)
    renames.push({ route: page.route, before: t.inner, after: text, tag: 'p' })
  })
  return { xml: out, renames: renames.reverse() }
}

/** The block for a new question, in the file's own style. */
export function questionBlock ({ path, question, help, condition, answerType, yes = 'Yes', no = 'No', marker }) {
  const input = answerType === 'boolean'
    ? `<input type="boolean">\n    <option value="true">${escText(yes)}</option>\n    <option value="false">${escText(no)}</option>\n  </input>`
    : `<input type="${answerType === 'day' ? 'date' : answerType}"/>`
  return [
    `<div class="df-screen" condition="${escAttr(condition)}" operator="isTrue">${marker ? `<!-- ${marker} -->` : ''}`,
    `  <h2>${escText(question)}</h2>`,
    help ? `  <p>${escText(help)}</p>` : null,
    `  <fg-set path="${escAttr(path)}">`,
    `    <question>${escText(question)}</question>`,
    `    ${input.replace(/\n/g, '\n    ')}`,
    '  </fg-set>',
    '</div>',
  ].filter(Boolean).join('\n')
}

/** The locale keys a question block creates, with their English, for the Spanish file. */
export function questionKeys ({ path, question, help, answerType, yes = 'Yes', no = 'No' }) {
  const keys = [{ key: keyFor('h2', escText(question)), en: escText(question) }]
  if (help) keys.push({ key: keyFor('p', escText(help)), en: escText(help) })
  keys.push({ key: `${path}.question`, en: escText(question) })
  if (answerType === 'boolean') keys.push({ key: `${path}.options.true.name`, en: yes }, { key: `${path}.options.false.name`, en: no })
  return keys
}

export const escText = s => String(s ?? '').replace(/&(?!(amp|lt|gt|quot|apos|#\d+|#x[0-9a-fA-F]+);)/g, '&amp;').replace(/</g, '&lt;')
export const escAttr = s => escText(s).replace(/"/g, '&quot;')

/** The dollar amounts and whole numbers written in a text, as numbers ("$4,000" → 4000). */
export function amountsIn (text) {
  return [...String(text).matchAll(/\$\s?(\d{1,3}(?:,\d{3})+|\d+)(?:\.\d\d)?/g)].map(m => ({ text: m[0], value: Number(m[1].replace(/,/g, '')), index: m.index }))
}
