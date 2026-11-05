// The review workflow: what a change is, who may do what to it, and the checks that run before it
// goes to review and again before it is published. The rules live here, not in the browser, so they
// cannot be clicked around:
//   - only a draft can be edited, and only by its author (or an engineer helping);
//   - the author cannot approve their own change: the policy approval comes from a reviewer, the
//     engineering approval from an engineer who is not the author;
//   - a draft cannot go to review while another open change edits the same fact;
//   - everything the page saves is checked here: a value must fit its type, a rule must be one
//     well-formed <Derived> of known operators, and the spliced file must fit the schema;
//   - publishing re-applies the change to the files as they are at that moment (a conflict if they
//     moved), re-runs every worked example in Node, and writes nothing unless all of them pass.
// Also the requests to engineering and the read-only reports.

import fs from 'node:fs'
import path from 'node:path'
import { pages } from './flow.js'
import { gitCommit, gitPullRequest } from './git.mjs'
import { proposeParts } from './law.mjs'
import { parseEs } from './locale.js'
import { EXAMPLES_FILE, FACTS_DIR, FACT_FILES, FEDERAL_FACTS_DIR, FILES, FLOW_SCHEMA, LOCALES_DIR, SCHEMA, loadEngine, readSources, sandboxFor, schemaFor, shown, siteYear } from './node.mjs'
import { MODEL_FILE, oracleAvailable, oracleWarnings } from './oracle.mjs'
import { coverage, exportContract, lineFacts, spanishStatus } from './reports.mjs'
import { runExamples, scanFacts } from './sandbox.js'
import { AUDIT_FILE, HttpError, OPEN, audit, auditEntries, list, load, nextId, now, people, person, save, withLock } from './store.mjs'
import { FACT_PATH_RE, ValidationError, checkChangeFields, checkDerived, haveXmllint, schemaError, tagsIn } from './validate.mjs'
import { applyBaselineEdits, applyChange, applyExampleEdits, fullyTranslated, lineDiff, revertEdits, translationNeeds, valueLiteral } from './xml-edit.js'

export const GIT_COMMIT = process.env.WORKBENCH_GIT_COMMIT === '1'
// WORKBENCH_GIT_PR=1: each publish goes on its own branch, is pushed, and opens a pull request with gh.
export const GIT_PR = process.env.WORKBENCH_GIT_PR === '1'
const TRANSLATED_TYPES = new Set(['question', 'text'])
const touchesWords = c => (c.edits || []).some(e => TRANSLATED_TYPES.has(e.type))
export const requiredApprovals = c => ['policy', 'engineering', ...(touchesWords(c) ? ['translation'] : [])]

export function actor (body) {
  const p = person(body.by)
  if (!p) throw new HttpError(400, 'Pick who you are first.')
  return p
}

export function state () {
  const src = readSources()
  return {
    facts: src.facts,
    flow: src.flow,
    es: src.es,
    siteYear: siteYear(),
    federal: src.federal,
    examplesFile: src.examplesFile,
    changes: list('changes'),
    requests: list('requests'),
    people: people(),
    paths: {
      facts: Object.fromEntries(Object.entries(FACT_FILES).map(([k, f]) => [k, shown(f)])),
      examples: shown(EXAMPLES_FILE),
      flow: shown(FILES.flow),
      es: shown(FILES.es),
    },
    tools: { xmllint: haveXmllint(), oracle: oracleAvailable(), gitCommit: GIT_COMMIT, gitPr: GIT_PR },
  }
}

// ---------------------------------------------------------------------------------------------
// Changes

export function createChange (body) {
  const p = actor(body)
  if (!['policy-author', 'engineer'].includes(p.role)) throw new HttpError(403, 'An author or an engineer starts a change; reviewers and translators review.')
  const fields = checkChangeFields({ ...(body.law ? { law: body.law } : {}), ...(body.title ? { title: body.title } : {}) }, { literalTag: () => null })
  const law = fields.law || null
  const c = {
    id: nextId('changes'),
    title: String(fields.title || (law?.citation ? law.citation : 'Untitled change')).slice(0, 200),
    summary: '',
    author: p.id,
    status: 'draft',
    created: now(),
    updated: now(),
    source: { citation: law?.citation || '', effective: law?.effectiveYear ? `taxable years beginning on or after January 1, ${law.effectiveYear}${law.endsAfter ? ` and ending with ${law.endsAfter}` : ''}` : '' },
    law,
    proposals: null,
    spanish: {},
    edits: [],
    exampleEdits: [],
    requestIds: [],
    approvals: [],
    comments: [],
    history: [{ at: now(), by: p.id, what: law ? `started the draft from ${law.kind || 'the law'}: ${law.citation || 'no citation'}` : 'started the draft' }],
  }
  if (law && (law.text || law.citation)) {
    const src = readSources()
    try { c.proposals = proposeParts(law, src, law.effectiveYear || siteYear()) } catch (e) { c.proposals = { error: e.message } }
  }
  // A revert: a new draft whose edits undo a published change, through the same review.
  if (body.revertOf) {
    const orig = load('changes', body.revertOf)
    if (!orig || orig.status !== 'published') throw new HttpError(409, 'Only a published change can be reverted.')
    c.title = `Revert #${orig.id}: ${orig.title}`.slice(0, 200)
    c.edits = revertEdits(orig)
    // Examples the change added go too; ones it updated are left for the reviewer, since their old answers are gone.
    c.exampleEdits = (orig.exampleEdits || []).filter(e => e.op === 'add').map(e => ({ op: 'remove', id: e.example.id }))
    c.source = { citation: `Reverts workbench change #${orig.id}`, effective: orig.source?.effective || '' }
    c.revertOf = orig.id
    c.history.push({ at: now(), by: p.id, what: `drafted the reversal of change #${orig.id}` })
  }
  save('changes', c)
  return c
}

/** The literal type of a value fact as the file stands, for checking what an edit may write. */
function literalTagIn (src) {
  return (file, factPath) => {
    const f = Object.values(src.facts).flatMap(scanFacts).find(x => x.path === factPath)
    return f ? valueLiteral(f.body)?.tag || null : null
  }
}

export function updateChange (id, body) {
  const c = load('changes', id)
  if (!c) throw new HttpError(404, 'No such change.')
  const p = actor(body)
  if (c.status !== 'draft') throw new HttpError(409, 'Only a draft can be edited. Ask for changes to send it back.')
  if (p.id !== c.author && p.role !== 'engineer') throw new HttpError(403, 'Only the author, or an engineer helping, can edit this draft.')
  if (!body.change || typeof body.change !== 'object') throw new HttpError(400, 'Nothing to save.')
  const src = readSources()
  const fields = checkChangeFields(body.change, { literalTag: literalTagIn(src) })
  for (const e of fields.edits || []) if (e.type === 'rule') checkDerivedAgainst(src, e.derived)
  Object.assign(c, fields)
  c.updated = now()
  save('changes', c)
  return c
}

/** A rule may use the common operators and any the files already use. */
function checkDerivedAgainst (src, derived) {
  const allowed = new Set([...COMMON_TAGS, ...Object.values(src.facts).flatMap(tagsIn)])
  for (const t of ['Fact', 'Facts', 'FactDictionaryModule', 'Name', 'Description', 'Writable', 'TaxYear', 'Export']) allowed.delete(t)
  try { return checkDerived(derived, allowed) } catch (e) {
    if (e instanceof ValidationError) throw new HttpError(400, e.message)
    throw e
  }
}

/** Other open changes that edit any of the same facts. */
export function overlapping (c) {
  const mine = new Set((c.edits || []).map(e => e.path))
  return list('changes').filter(o => o.id !== c.id && OPEN.includes(o.status) && (o.edits || []).some(e => mine.has(e.path)))
}

export async function verify (change, src = readSources()) {
  let files
  const base = { facts: src.facts, flow: src.flow, es: src.es }
  try {
    for (const e of change.edits || []) if (e.type === 'rule') checkDerivedAgainst(src, e.derived)
    if (touchesWords(change) && src.flow === undefined) throw new HttpError(422, `This change edits the screens, but ${shown(FILES.flow)} is not beside the rules.`)
    files = applyChange(base, change)
  } catch (e) {
    if (e.code === 'CONFLICT') return { ok: false, conflict: e.message, blocked: [] }
    if (e instanceof HttpError) return { ok: false, error: e.message, blocked: [], src }
    throw e
  }
  const examples = applyExampleEdits(src.examplesFile.examples, change)
  const baseline = applyBaselineEdits(src.examplesFile.baseline, change)
  const translations = translationNeeds(change, base)
  const season = { siteYear: siteYear(), effectiveYear: change.law?.effectiveYear || null }
  // Every check below reports `blocked` too: a change that uses a question engineering has not built
  // yet will not load, and that is the reason to give, not the load error.
  const blocked = (change.requestIds || []).map(id => load('requests', id)).filter(r => r && r.status !== 'done').map(r => r.id)
  const base2 = { files, examples, baseline, src, blocked, count: examples.length, translations, untranslated: translations.filter(t => !t.es), required: requiredApprovals(change), season }
  for (const k of Object.keys(files.facts)) {
    if (files.facts[k] === src.facts[k]) continue
    const bad = schemaError(files.facts[k], SCHEMA, k)
    if (bad) return { ...base2, ok: false, error: bad }
  }
  if (files.flow !== undefined && files.flow !== src.flow) {
    try { pages(files.flow) } catch (e) { return { ...base2, ok: false, error: e.message } }
    const bad = schemaError(files.flow, FLOW_SCHEMA, 'flow')
    if (bad) return { ...base2, ok: false, error: bad.replace('FactDictionaryModule.rng', 'FlowConfig.rng') }
  }
  if (files.es !== undefined && files.es !== src.es) {
    try { parseEs(files.es) } catch (e) { return { ...base2, ok: false, error: `The Spanish file would not read back: ${e.message}` } }
  }
  let xml
  try { xml = sandboxFor({ ...files, federal: src.federal }) } catch (e) { return { ...base2, ok: false, error: e.message } }
  const fg = await loadEngine()
  const outputs = lineFacts(files.facts).map(l => l.path)
  const run = runExamples(fg, xml, { examples, baseline }, schemaFor({ ...files, federal: src.federal }), outputs)
  if (run.error) return { ...base2, ok: false, error: run.error }
  const failing = examples.filter(x => !run.results[x.id].pass).map(x => ({ id: x.id, title: x.title, ...run.results[x.id] }))
  let oracle = null
  try { oracle = oracleWarnings({ facts: files.facts, examples, baseline, results: run.results }) } catch (e) { oracle = { available: true, error: e.message, warnings: [] } }
  const untranslated = translations.filter(t => !t.es)
  return { ...base2, ok: failing.length === 0 && blocked.length === 0, failing, oracle, untranslated }
}


export async function act (id, body) {
  return withLock(`change:${Number(id)}`, async () => {
    const c = load('changes', id)
    if (!c) throw new HttpError(404, 'No such change.')
    const p = actor(body)
    const note = String(body.note || '').slice(0, 4000)
    const log = what => c.history.push({ at: now(), by: p.id, what })
    switch (body.action) {
      case 'comment':
        if (!note) throw new HttpError(400, 'Write something first.')
        c.comments.push({ at: now(), by: p.id, text: note })
        break
      case 'submit': {
        if (c.status !== 'draft') throw new HttpError(409, 'Only a draft can be sent for review.')
        if (p.id !== c.author) throw new HttpError(403, 'The author sends their own draft for review.')
        if (!(c.edits.length || c.exampleEdits.length)) throw new HttpError(400, 'There is nothing in this change yet.')
        if (c.edits.some(e => e.type === 'value' || e.type === 'schedule') && !c.source?.citation?.trim()) throw new HttpError(400, 'Say where the new values come from (the source) before sending.')
        if (c.edits.some(e => e.type === 'rule' && !String(e.because || '').trim())) throw new HttpError(400, 'Every rule edit needs a “because”.')
        if (c.edits.some(e => e.type === 'question' && !String(e.law || '').trim())) throw new HttpError(400, 'Every new question needs the law it comes from.')
        const others = overlapping(c)
        if (others.length) throw new HttpError(409, `Change #${others[0].id} (${others[0].status}) already edits ${c.edits.find(e => others[0].edits.some(o => o.path === e.path)).path}. One change per fact at a time: wait for it, or take that fact out of this draft.`, { overlaps: others.map(o => o.id) })
        const v = await verify(c)
        if (v.conflict) throw new HttpError(409, v.conflict)
        if (v.blocked.length) throw new HttpError(409, `This change waits on request${v.blocked.length > 1 ? 's' : ''} #${v.blocked.join(', #')}. It can go to review once engineering has built it.`)
        if (v.error) throw new HttpError(422, v.error)
        if (v.failing.length) throw new HttpError(422, `Worked examples do not match yet: ${v.failing.map(f => f.title).join(', ')}. Update the expected answer if the law now says so, or fix the rule.`, { failing: v.failing })
        c.status = 'review'
        c.approvals = []
        log('sent it for review')
        break
      }
      case 'approve': {
        if (c.status !== 'review') throw new HttpError(409, 'Only a change in review can be approved.')
        if (p.id === c.author) throw new HttpError(403, 'You cannot approve your own change. The engineering approval comes from an engineer who did not write it.')
        const kind = p.role === 'engineer' ? 'engineering' : p.role === 'policy-reviewer' ? 'policy' : p.role === 'translator' ? 'translation' : null
        if (!kind) throw new HttpError(403, 'Approvals come from a policy reviewer, an engineer who is not the author, and a translator when words change.')
        if (kind === 'translation') {
          if (!touchesWords(c)) throw new HttpError(409, 'This change touches no words on the screens, so it needs no translation approval.')
          const src = readSources()
          if (!fullyTranslated(c, { facts: src.facts, flow: src.flow, es: src.es })) throw new HttpError(409, 'Some words still have no Spanish. Enter it on the change page first.')
        }
        if (c.approvals.some(a => a.kind === kind)) throw new HttpError(409, `This change already has its ${kind} approval.`)
        c.approvals.push({ kind, by: p.id, at: now(), note })
        if (note) c.comments.push({ at: now(), by: p.id, text: note })
        log(`approved it (${kind})`)
        if (requiredApprovals(c).every(k => c.approvals.some(a => a.kind === k))) c.status = 'approved'
        break
      }
      case 'spanish': {
        // The translator (or the author, while drafting) supplies the Spanish for the words a change touches.
        if (!['draft', 'review'].includes(c.status)) throw new HttpError(409, 'Spanish is entered while a change is a draft or in review.')
        if (p.role !== 'translator' && p.id !== c.author && p.role !== 'engineer') throw new HttpError(403, 'The translator, the author or an engineer enters the Spanish.')
        const fields = checkChangeFields({ spanish: body.spanish || {} }, { literalTag: () => null })
        c.spanish = { ...(c.spanish || {}), ...fields.spanish }
        for (const k of Object.keys(body.spanish || {})) if (!String(body.spanish[k] || '').trim()) delete c.spanish[k]
        c.approvals = c.approvals.filter(a => a.kind !== 'translation')
        log('entered Spanish')
        break
      }
      case 'request-changes':
        if (!['review', 'approved'].includes(c.status)) throw new HttpError(409, 'Only a change in review can be sent back.')
        if (p.id === c.author) throw new HttpError(403, 'Withdraw it instead.')
        if (!note) throw new HttpError(400, 'Say what needs to change.')
        c.status = 'draft'
        c.approvals = []
        c.comments.push({ at: now(), by: p.id, text: note })
        log('asked for changes')
        break
      case 'withdraw':
        if (p.id !== c.author) throw new HttpError(403, 'Only the author can withdraw a change.')
        if (c.status === 'published') throw new HttpError(409, 'A published change cannot be withdrawn; start a new one that undoes it.')
        c.status = body.discard ? 'discarded' : 'draft'
        c.approvals = []
        log(body.discard ? 'discarded it' : 'took it back to draft')
        break
      case 'publish':
        if (c.status !== 'approved') throw new HttpError(409, `A change needs ${requiredApprovals(c).length === 3 ? 'all three approvals' : 'both approvals'} before it is published.`)
        if (p.role !== 'engineer') throw new HttpError(403, 'An engineer publishes.')
        await withLock('publish', async () => {
          const v = await verify(c)
          if (v.conflict) throw new HttpError(409, v.conflict)
          if (!v.ok) throw new HttpError(422, v.blocked.length ? `Waits on request #${v.blocked.join(', #')}; nothing was written.` : v.error || 'The checks do not pass, so nothing was written.', { failing: v.failing, blocked: v.blocked })
          // The engine ran for a while: read the files again right before writing, and refuse if
          // anything moved in the meantime rather than write over it.
          if (v.untranslated?.length) throw new HttpError(422, `${v.untranslated.length} string${v.untranslated.length === 1 ? ' has' : 's have'} no Spanish yet; nothing was written.`)
          const again = readSources()
          const sameFacts = Object.keys(again.facts).length === Object.keys(v.src.facts).length && Object.keys(again.facts).every(k => again.facts[k] === v.src.facts[k])
          if (!sameFacts || ['flow', 'es'].some(k => again[k] !== v.src[k]) || JSON.stringify(again.examplesFile) !== JSON.stringify(v.src.examplesFile)) {
            throw new HttpError(409, 'The files changed while the checks were running. Nothing was written; try again.')
          }
          const diffs = {}
          const written = []
          for (const k of Object.keys(v.files.facts)) {
            if (v.files.facts[k] !== v.src.facts[k]) {
              diffs[k] = lineDiff(v.src.facts[k], v.files.facts[k])
              fs.writeFileSync(FACT_FILES[k], v.files.facts[k])
              written.push(FACT_FILES[k])
            }
          }
          for (const k of ['flow', 'es']) {
            if (v.files[k] !== undefined && v.files[k] !== v.src[k]) {
              diffs[k] = lineDiff(v.src[k], v.files[k])
              fs.writeFileSync(FILES[k], v.files[k])
              written.push(FILES[k])
            }
          }
          if (c.exampleEdits.length || JSON.stringify(v.baseline) !== JSON.stringify(v.src.examplesFile.baseline)) {
            fs.writeFileSync(EXAMPLES_FILE, JSON.stringify({ ...v.src.examplesFile, baseline: v.baseline, examples: v.examples }, null, 2) + '\n')
            written.push(EXAMPLES_FILE)
          }
          c.status = 'published'
          c.published = { at: now(), by: p.id, files: written.map(shown), examples: v.count }
          if (v.oracle?.warnings?.length) c.published.oracleWarnings = v.oracle.warnings
          c.published.season = v.season
          if (GIT_PR && written.length) {
            const g = gitPullRequest(c, written, p)
            if (g.url) { c.published.commit = g.hash; c.published.pr = g.url; c.published.branch = g.branch } else c.published.commitError = g.error || g.skipped
          } else if (GIT_COMMIT && written.length) {
            const g = gitCommit(c, written, p)
            if (g.hash) c.published.commit = g.hash
            else c.published.commitError = g.error || g.skipped
          }
          log(`published it; ${v.count} worked examples pass${c.published.commit ? `; commit ${c.published.commit.slice(0, 10)}` : ''}`)
          audit({ at: c.published.at, by: p.id, name: p.name, change: c.id, title: c.title, files: c.published.files, commit: c.published.commit || null, pr: c.published.pr || null, examples: v.count, edits: c.edits.map(e => ({ type: e.type, path: e.path || e.route })) })
        })
        break
      default:
        throw new HttpError(400, `Unknown action ${String(body.action).slice(0, 40)}`)
    }
    c.updated = now()
    save('changes', c)
    return c
  })
}

// ---------------------------------------------------------------------------------------------
// Requests to engineering

export function createRequest (body) {
  const p = actor(body)
  const factPath = String(body.factPath || '').trim()
  if (factPath && !FACT_PATH_RE.test(factPath)) throw new HttpError(400, 'The name in the code is a path like /vaSomethingNew: letters, digits and slashes.')
  const r = {
    id: nextId('requests'),
    status: 'open',
    by: p.id,
    created: now(),
    law: String(body.law || '').slice(0, 8000),
    question: String(body.question || '').slice(0, 2000),
    answerType: ['dollar', 'boolean', 'enum', 'day'].includes(body.answerType) ? body.answerType : 'dollar',
    factPath,
    forChange: Number.isInteger(body.forChange) && body.forChange > 0 ? body.forChange : null,
    examples: String(body.examples || '').slice(0, 8000),
    comments: [],
  }
  if (!r.question.trim() || !r.law.trim()) throw new HttpError(400, 'Say what the law says and what to ask.')
  save('requests', r)
  return r
}

export function actRequest (id, body) {
  const r = load('requests', id)
  if (!r) throw new HttpError(404, 'No such request.')
  const p = actor(body)
  if (body.action === 'comment') r.comments.push({ at: now(), by: p.id, text: String(body.note || '').slice(0, 4000) })
  else if (body.action === 'done' || body.action === 'reopen') {
    if (p.role !== 'engineer') throw new HttpError(403, 'Engineering marks a request built.')
    if (body.action === 'done') {
      const src = readSources()
      if (r.factPath && !Object.values(src.facts).some(x => x.includes(`<Fact path="${r.factPath}">`))) {
        throw new HttpError(409, `${r.factPath} is not in any Virginia module in ${shown(FACTS_DIR)} yet. Add the fact (and its screen) first.`)
      }
    }
    r.status = body.action === 'done' ? 'done' : 'open'
    r.comments.push({ at: now(), by: p.id, text: body.action === 'done' ? 'Built.' : 'Reopened.' })
  } else throw new HttpError(400, 'Unknown action')
  save('requests', r)
  return r
}

// ---------------------------------------------------------------------------------------------
// Reports

export function reports (name) {
  const src = readSources()
  if (name === 'coverage') return coverage(src.facts, src.examplesFile.examples)
  if (name === 'exports') return exportContract({ facts: src.facts, federal: src.federal, federalDir: FEDERAL_FACTS_DIR })
  if (name === 'spanish') {
    const read = f => { const p = path.join(LOCALES_DIR, f); return fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : null }
    const flowEn = read('flow_en.yaml')
    const virginiaEs = read('virginia_es.yaml')
    if (flowEn === null) throw new HttpError(404, `${shown(path.join(LOCALES_DIR, 'flow_en.yaml'))} is not there. It is generated by a build (make site).`)
    return { ...spanishStatus({ flowEn, virginiaEs: virginiaEs || '' }), files: { en: shown(path.join(LOCALES_DIR, 'flow_en.yaml')), es: shown(path.join(LOCALES_DIR, 'virginia_es.yaml')) }, esMissing: virginiaEs === null }
  }
  if (name === 'audit') return { entries: auditEntries(20), file: shown(AUDIT_FILE), gitCommit: GIT_COMMIT, model: shown(MODEL_FILE) }
  throw new HttpError(404, 'No such report.')
}
