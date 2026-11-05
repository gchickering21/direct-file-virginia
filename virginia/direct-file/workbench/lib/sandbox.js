// The Virginia sandbox: the Virginia fact modules (facts/virginia*.xml, a map of stem → text) loaded
// beside a writable stand-in for each federal fact they read (federal-inputs.json), so a worked
// example is a short list of answers rather than a whole federal return.
//
// Plain string work, no DOM, so the same file runs in the browser's worker and in Node for
// `check.mjs`. The fact dictionary files are regular enough that a <Fact path="…"> … </Fact> scan is
// exact: facts do not nest.

export const PRIMARY_ID = '11111111-1111-4111-8111-111111111111'
export const SECONDARY_ID = '22222222-2222-4222-8222-222222222222'

const FACT_RE = /<Fact path="([^"]+)">([\s\S]*?)<\/Fact>/g
const DEP_RE = /<Dependency (?:module="[^"]*" )?path="([^"]+)"/g

/** Every fact in a module, in file order, with where it sits in the text. */
export function scanFacts (xml) {
  const out = []
  for (const m of xml.matchAll(FACT_RE)) {
    out.push({ path: m[1], body: m[2], start: m.index, end: m.index + m[0].length })
  }
  return out
}

/** The text between <Facts> and </Facts>. */
export function factsInner (xml) {
  const a = xml.indexOf('<Facts>')
  const b = xml.lastIndexOf('</Facts>')
  if (a < 0 || b < 0) throw new Error('Not a FactDictionaryModule: no <Facts> element')
  return xml.slice(a + '<Facts>'.length, b)
}

/** The questions a module asks: its writable facts and their types. */
export function writableFacts (xml) {
  const out = []
  for (const f of scanFacts(xml)) {
    const w = f.body.match(/<Writable>\s*<(\w+)([^>]*)\/?>/)
    if (!w) continue
    const opt = w[2].match(/optionsPath="([^"]+)"/)
    const name = f.body.match(/<Name>([\s\S]*?)<\/Name>/)
    out.push({ path: f.path, type: w[1].toLowerCase(), optionsPath: opt ? opt[1] : null, name: name ? clean(name[1]) : f.path })
  }
  return out
}

/** The module (stem) whose text defines a fact, or null. */
export function fileOfFact (facts, path) {
  for (const [k, xml] of Object.entries(facts)) if (xml.includes(`<Fact path="${path}">`)) return k
  return null
}

/** Paths the modules depend on but do not define: the federal facts they read. */
export function externalDependencies (...xmls) {
  const defined = new Set()
  const used = new Set()
  for (const xml of xmls) {
    for (const f of scanFacts(xml)) {
      defined.add(f.path)
      for (const d of f.body.matchAll(DEP_RE)) if (d[1].startsWith('/')) used.add(d[1])
    }
  }
  return [...used].filter(p => !defined.has(p)).sort()
}

const writable = (path, inner) => `<Fact path="${path}"><Writable>${inner}</Writable></Fact>`
const optionsFact = (path, options) =>
  `<Fact path="${path}"><Derived><EnumOptions>${options.map(o => `<String>${o}</String>`).join('')}</EnumOptions></Derived></Fact>`
const TAG = { dollar: '<Dollar />', boolean: '<Boolean />', day: '<Day />', int: '<Int />' }

// A per-filer federal fact: /primaryFiler/x is the primary filer's /filers/*/x, and the spouse's
// facts, which the filer module reads through its own /vaSpouse (a Find over /filers on the exported
// isPrimaryFiler flag), are the second filer's. Both prefixes land on the one /filers/*/x stand-in.
const FILER_PREFIX = { '/primaryFiler/': PRIMARY_ID, '/vaSpouse/': SECONDARY_ID, '/secondaryFiler/': SECONDARY_ID }
export function filerField (path) {
  for (const [prefix, id] of Object.entries(FILER_PREFIX)) if (path.startsWith(prefix)) return { id, field: path.slice(prefix.length) }
  return null
}

/** The stand-in facts for federal-inputs.json. */
export function federalStubXml (federal) {
  const out = []
  const collections = new Set()
  const filerFields = new Set()
  let filers = false
  for (const input of federal.inputs) {
    const { path, type } = input
    const ff = filerField(path)
    if (ff) {
      filers = true
      if (!filerFields.has(ff.field)) out.push(writable('/filers/*/' + ff.field, TAG[type]))
      filerFields.add(ff.field)
    } else if (type === 'enum') {
      const optionsPath = input.optionsPath || path + 'Options'
      out.push(writable(path, `<Enum optionsPath="${optionsPath}" />`))
      out.push(optionsFact(optionsPath, input.options))
    } else if (type === 'count' || type === 'dollarList') {
      const coll = path.slice(0, path.indexOf('/*/'))
      if (!collections.has(coll)) out.push(writable(coll, '<Collection />'))
      collections.add(coll)
      out.push(writable(path, type === 'count' ? '<Boolean />' : '<Dollar />'))
    } else {
      out.push(writable(path, TAG[type]))
    }
  }
  if (filers) {
    out.push(writable('/filers', '<Collection />'))
    out.push(writable('/filers/*/isPrimaryFiler', '<Boolean />'))
    out.push('<Fact path="/primaryFiler"><Derived><Find path="/filers"><Dependency path="isPrimaryFiler" /></Find></Derived></Fact>')
  }
  return out.join('\n')
}

/**
 * One dictionary: the stand-ins, then the Virginia modules as written. Throws, naming them, when
 * Virginia reads a federal fact federal-inputs.json does not stand in for.
 */
export function buildSandboxXml ({ facts, federal }) {
  const xmls = Object.keys(facts).sort().map(k => facts[k])
  const known = new Set(federal.inputs.map(i => i.path))
  const unknown = externalDependencies(...xmls).filter(p => !known.has(p))
  if (unknown.length) {
    const err = new Error(`Virginia reads federal facts the workbench has no stand-in for: ${unknown.join(', ')}`)
    err.code = 'UNKNOWN_FEDERAL'
    err.paths = unknown
    throw err
  }
  return `<FactDictionaryModule><Facts>\n${federalStubXml(federal)}\n${xmls.map(factsInner).join('\n')}\n</Facts></FactDictionaryModule>`
}

// ---------------------------------------------------------------------------------------------
// Worked examples → a serialized graph

const uuid = (n, i) => `${String(n).repeat(8)}-${String(n).repeat(4)}-4${String(n).repeat(3)}-8${String(n).repeat(3)}-${String(i).padStart(12, '0')}`
const wrap = {
  dollar: v => ({ $type: 'DollarWrapper', item: Number(v).toFixed(2) }),
  boolean: v => ({ $type: 'BooleanWrapper', item: v === true || v === 'true' }),
  day: v => ({ $type: 'DayWrapper', item: { date: String(v) } }),
  int: v => ({ $type: 'IntWrapper', item: Number(v) }),
  string: v => ({ $type: 'StringWrapper', item: String(v) }),
}

/**
 * The graph JSON for one example: the baseline answers, then the example's own on top.
 * `schema` is { federal, questions } where questions is writableFacts() of the Virginia modules.
 */
export function exampleGraphJson (example, baseline, schema) {
  const inputs = { ...baseline, ...example.inputs }
  const g = {
    '/filers': { $type: 'CollectionWrapper', item: { items: [PRIMARY_ID, SECONDARY_ID] } },
    [`/filers/#${PRIMARY_ID}/isPrimaryFiler`]: wrap.boolean(true),
    [`/filers/#${SECONDARY_ID}/isPrimaryFiler`]: wrap.boolean(false),
  }
  for (const input of schema.federal.inputs) {
    const v = inputs[input.path]
    const { path, type } = input
    if (type === 'count' || type === 'dollarList') {
      const coll = path.slice(0, path.indexOf('/*/'))
      const field = path.slice(path.indexOf('/*/') + 3)
      // A count left unsaid on a collection that a list sizes means "all of them": every W-2 carries
      // a state code unless the example says how many do. countFor keeps the oracle on the same rule.
      const list = type === 'count' ? Array.from({ length: countFor(inputs, input, schema.federal.inputs) }, () => true) : (v || [])
      const ids = list.map((_, i) => uuid(coll === '/formW2s' ? 4 : 3, i + 1))
      g[coll] = { $type: 'CollectionWrapper', item: { items: ids } }
      ids.forEach((id, i) => { g[`${coll}/#${id}/${field}`] = (type === 'count' ? wrap.boolean : wrap.dollar)(list[i]) })
      continue
    }
    if (v === undefined || v === null || v === '') continue
    const ff = filerField(path)
    const target = ff ? `/filers/#${ff.id}/${ff.field}` : path
    g[target] = type === 'enum'
      ? { $type: 'EnumWrapper', item: { value: String(v), enumOptionsPath: input.optionsPath || path + 'Options' } }
      : wrap[type](v)
  }
  for (const q of schema.questions) {
    const v = inputs[q.path]
    if (v === undefined || v === null || v === '') continue
    if (q.type === 'enum') g[q.path] = { $type: 'EnumWrapper', item: { value: String(v), enumOptionsPath: q.optionsPath } }
    else if (wrap[q.type]) g[q.path] = wrap[q.type](v)
  }
  return JSON.stringify(g)
}

/** How many items of a collection a count stand-in marks: the example's number, else every item a list on the same collection has. */
export function countFor (inputs, input, federalInputs) {
  const v = inputs[input.path]
  if (v !== undefined && v !== null && v !== '') return Number(v)
  const coll = input.path.slice(0, input.path.indexOf('/*/'))
  const sibling = federalInputs.find(i => i.type === 'dollarList' && i.path.startsWith(coll + '/*/'))
  const list = sibling ? inputs[sibling.path] : null
  return Array.isArray(list) ? list.length : 0
}

/** A fact's value as plain data: a number, a boolean, a string, or null when incomplete. */
export function readFact (graph, path) {
  let r
  try { r = graph.get(path) } catch (e) { return { error: engineMessage(e) } }
  if (!r.complete) return { value: null }
  const v = r.get
  if (v === true || v === false) return { value: v }
  if (v && typeof v === 'object' && 'value' in v && typeof v.value === 'string') return { value: v.value }
  const s = String(v)
  if (/^-?\d+(\.\d+)?$/.test(s)) return { value: Number(s) }
  return { value: s }
}

export function engineMessage (e) {
  return String((e && (e.jl_Throwable__f_s || e.message)) || e).slice(0, 400)
}

export function sameValue (expected, actual) {
  if (actual === null || actual === undefined) return false
  if (typeof actual === 'number') return Math.abs(Number(expected) - actual) < 0.005
  return String(expected) === String(actual)
}

/**
 * Load a dictionary and run every example against it. Returns per-example values for the paths
 * each one expects, plus `outputs` (paths every example reports, for the impact view).
 */
export function runExamples (fg, sandboxXml, { examples, baseline }, schema, outputs = []) {
  let dict
  try { dict = fg.FactDictionaryFactory.importFromXml(sandboxXml) } catch (e) {
    return { error: 'The rules do not load: ' + engineMessage(e) }
  }
  const results = {}
  for (const ex of examples) {
    const r = { values: {}, pass: true, failures: [] }
    let graph
    try { graph = fg.GraphFactory.fromJSON(dict, exampleGraphJson(ex, baseline, schema)) } catch (e) {
      results[ex.id] = { error: 'The example does not load: ' + engineMessage(e), pass: false, values: {}, failures: [] }
      continue
    }
    const paths = new Set([...Object.keys(ex.expect || {}), ...outputs])
    for (const p of paths) {
      const v = readFact(graph, p)
      r.values[p] = v.error ? null : v.value
      if (p in (ex.expect || {})) {
        if (v.error || !sameValue(ex.expect[p], v.value)) {
          r.pass = false
          r.failures.push({ path: p, expected: ex.expect[p], actual: v.error ? v.error : v.value })
        }
      }
    }
    results[ex.id] = r
  }
  return { results }
}

function clean (s) { return s.replace(/\s+/g, ' ').trim() }
