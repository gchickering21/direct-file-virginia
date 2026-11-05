// The hand-written Spanish for the Virginia screens, locales/virginia_es.yaml, read and edited as
// text. The file is a plain mapping: a route, then nested keys, each holding one string (plain,
// quoted, or continued over indented lines). Only what the workbench needs is parsed, and edits are
// line splices, so the translator's formatting elsewhere is left alone. Comments are kept; the
// merge script (scripts/merge-virginia-es.py) reads the file with a YAML parser and ignores them.

export class LocaleConflict extends Error { constructor (message) { super(message); this.code = 'CONFLICT' } }

const KEY_RE = /^( *)(?:"([^"]+)"|'([^']+)'|([^\s'"#][^:]*?)):(?:\s+(.*))?$/

/** Every scalar in the file: dotted key → { value, line (index), indent }, plus each route's line span. */
export function parseEs (text) {
  const lines = String(text).split('\n')
  const keys = new Map()
  const routes = new Map()
  const stack = []
  let scalar = null // { indent, key, lines: [] } while reading a continued value
  const finish = () => { if (scalar) { keys.set(scalar.key, { value: joinScalar(scalar.first, scalar.lines), line: scalar.line, indent: scalar.indent }); scalar = null } }
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i]
    const indent = raw.match(/^ */)[0].length
    if (scalar && (raw.trim() === '' || indent > scalar.indent)) { scalar.lines.push(raw); continue }
    finish()
    if (!raw.trim() || /^\s*#/.test(raw)) continue
    const m = raw.match(KEY_RE)
    if (!m) continue
    const key = m[2] ?? m[3] ?? m[4]
    const value = (m[5] || '').trim()
    while (stack.length && stack[stack.length - 1].indent >= indent) {
      const done = stack.pop()
      if (done.indent === 0 && routes.has(done.key)) routes.get(done.key).end = i
    }
    stack.push({ indent, key })
    if (indent === 0) routes.set(key, { line: i, end: lines.length })
    const dotted = stack.map(s => s.key).join('.')
    if (value !== '' && !value.startsWith('#')) scalar = { indent, key: dotted, first: value, lines: [], line: i }
  }
  finish()
  while (stack.length) { const done = stack.pop(); if (done.indent === 0 && routes.has(done.key)) routes.get(done.key).end = lines.length }
  return { keys, routes, lines }
}

function joinScalar (first, rest) {
  const parts = [first, ...rest.map(l => l.trim())].filter(Boolean)
  let s = parts.join(' ')
  if ((s.startsWith("'") && s.endsWith("'")) || (s.startsWith('"') && s.endsWith('"'))) {
    const q = s[0]
    s = s.slice(1, -1)
    s = q === "'" ? s.replace(/''/g, "'") : s.replace(/\\"/g, '"').replace(/\\n/g, '\n')
  }
  return s
}

/** One YAML scalar, single-quoted and on one line, so the merge script reads it back unchanged. */
export const quote = s => `'${String(s ?? '').replace(/\r?\n/g, ' ').replace(/'/g, "''")}'`

/**
 * Set a key under a route, creating the route and any intermediate mappings. `comment`, when given,
 * is written on the line above the key. Returns the new text.
 */
export function setEsKey (text, route, dotted, value, comment) {
  let lines = String(text).split('\n')
  const parsed = parseEs(lines.join('\n'))
  const full = `${route}.${dotted}`
  const existing = parsed.keys.get(full)
  if (existing) {
    const indent = ' '.repeat(existing.indent)
    const leaf = dotted.split('.').pop()
    // Drop any continuation lines of the old value, then any comment the workbench wrote above it.
    let end = existing.line + 1
    while (end < lines.length && (lines[end].trim() === '' ? false : lines[end].match(/^ */)[0].length > existing.indent)) end++
    let start = existing.line
    if (start > 0 && /^\s*# (needs translation|workbench)/i.test(lines[start - 1])) start--
    lines.splice(start, end - start, ...(comment ? [`${indent}# ${comment}`] : []), `${indent}${yamlKey(leaf)}: ${quote(value)}`)
    return lines.join('\n')
  }
  if (!parsed.routes.has(route)) {
    if (lines[lines.length - 1] !== '') lines.push('')
    lines.splice(lines.length - 1, 0, `${yamlKey(route)}:`)
    return setEsKey(lines.join('\n'), route, dotted, value, comment)
  }
  // Walk the dotted path, creating the deepest missing mapping at the end of its parent's block.
  const parts = dotted.split('.')
  let prefix = route
  let depth = 1
  for (let i = 0; i < parts.length; i++) {
    const key = `${prefix}.${parts[i]}`
    const isLeaf = i === parts.length - 1
    if (isLeaf) {
      const at = blockEnd(lines, prefix, parsed)
      const indent = ' '.repeat(depth * 2)
      lines.splice(at, 0, ...(comment ? [`${indent}# ${comment}`] : []), `${indent}${yamlKey(parts[i])}: ${quote(value)}`)
      return lines.join('\n')
    }
    if (!hasMapping(lines, key, parsed)) {
      const at = blockEnd(lines, prefix, parsed)
      lines.splice(at, 0, `${' '.repeat(depth * 2)}${yamlKey(parts[i])}:`)
      return setEsKey(lines.join('\n'), route, dotted, value, comment)
    }
    prefix = key
    depth++
  }
  return lines.join('\n')
}

const yamlKey = k => (/^[A-Za-z0-9/_.-]+$/.test(k) && !/^(true|false|null|yes|no|on|off)$/i.test(k) ? k : `'${k.replace(/'/g, "''")}'`)

/** Whether `dotted` names a mapping (a key with children) in the file. */
function hasMapping (lines, dotted, parsed) {
  const prefix = dotted + '.'
  if ([...parsed.keys.keys()].some(k => k.startsWith(prefix))) return true
  return findKeyLine(lines, dotted) >= 0
}

/** The line index of a key written as `key:` (no value) at the right nesting, or -1. */
function findKeyLine (lines, dotted) {
  const parts = dotted.split('.')
  let depth = 0
  let i = 0
  for (; i < lines.length && depth < parts.length; i++) {
    const m = lines[i].match(KEY_RE)
    if (!m) continue
    const indent = m[1].length
    const key = m[2] ?? m[3] ?? m[4]
    if (indent === depth * 2 && key === parts[depth]) { depth++; if (depth === parts.length) return i } else if (indent < depth * 2 && depth > 0) return -1
  }
  return -1
}

/** The line index just after the last line of a mapping's block. */
function blockEnd (lines, dotted, parsed) {
  const start = findKeyLine(lines, dotted)
  if (start < 0) throw new LocaleConflict(`No mapping ${dotted} in the Spanish file.`)
  const indent = lines[start].match(/^ */)[0].length
  let i = start + 1
  let last = start
  for (; i < lines.length; i++) {
    const l = lines[i]
    if (l.trim() === '') continue
    const ind = l.match(/^ */)[0].length
    if (ind <= indent) break
    last = i
  }
  return last + 1
}

/** Rename a key in place (the English changed, so its hash did), keeping its Spanish and marking it. */
export function renameEsKey (text, route, from, to, comment) {
  const parsed = parseEs(text)
  const full = `${route}.${from}`
  const existing = parsed.keys.get(full)
  if (!existing) return { text, found: false }
  const lines = String(text).split('\n')
  const toLeaf = to.split('.').pop()
  const l = lines[existing.line]
  const m = l.match(KEY_RE)
  const head = m[1] + (m[2] !== undefined ? `"${m[2]}"` : m[3] !== undefined ? `'${m[3]}'` : m[4])
  lines[existing.line] = `${m[1]}${yamlKey(toLeaf)}:` + l.slice(head.length + 1)
  if (comment) {
    if (existing.line > 0 && /^\s*# (needs translation|workbench)/i.test(lines[existing.line - 1])) lines[existing.line - 1] = `${m[1]}# ${comment}`
    else lines.splice(existing.line, 0, `${m[1]}# ${comment}`)
  }
  return { text: lines.join('\n'), found: true, value: existing.value }
}

/** Remove a key the workbench added (and its comment line). */
export function removeEsKey (text, route, dotted) {
  const parsed = parseEs(text)
  const existing = parsed.keys.get(`${route}.${dotted}`)
  if (!existing) return text
  const lines = String(text).split('\n')
  let end = existing.line + 1
  while (end < lines.length && lines[end].trim() !== '' && lines[end].match(/^ */)[0].length > existing.indent) end++
  let start = existing.line
  if (start > 0 && /^\s*# (needs translation|workbench)/i.test(lines[start - 1])) start--
  lines.splice(start, end - start)
  return lines.join('\n')
}
