// Questions asked of the filer, and the question builder that writes the fact, the screen and the
// words; the page preview the screen view and the footprint reuse.

import { humanize, literalLabel, shortName } from '../model.js'
import { pages, questionKeys } from '../../lib/flow.js'
import { applyChange, questionTargetModule } from '../../lib/xml-edit.js'
import { chipName } from '../chips.js'
import { askText } from '../dialogs.js'
import { activeChange, draftFiles, ensureDraft, saveSoon } from '../draft.js'
import { render, route } from '../shell.js'
import { $, S, canEdit, cite, esc, toast } from '../state.js'

export const ANSWERS = [['boolean', 'Yes / No', 'a true-or-false fact the rule editor can test'], ['dollar', 'Dollar amount', 'an amount it can add or compare'], ['day', 'Date', 'a date'], ['int', 'Number', 'a whole number']]

export function viewQuestions () {
  const c = activeChange()
  const flow = (c ? draftFiles(c).files.flow : S.data.flow) || ''
  const ps = pages(flow)
  const facts = [...S.model.facts.values()].filter(f => f.kind === 'asked')
  const draftQ = new Set(c?.edits.filter(e => e.type === 'question').map(e => e.path) || [])
  const rows = ps.flatMap(p => p.questions.map(q => `<tr class="${draftQ.has(q.path) ? 'changed' : ''}"><td><b>${esc(q.question)}</b><br><code class="cite">${esc(q.path)}</code></td><td>${esc(humanize(q.type))}</td><td><a href="#/screen/${encodeURIComponent(p.route)}">${esc(p.title)}</a>${q.screen?.condition && q.screen.condition.path !== '/vaIsResident' ? `<br><span class="cite">only when ${esc(chipName(q.screen.condition.path))} is yes</span>` : ''}</td><td>${draftQ.has(q.path) ? `<span class="pill warn">In your draft</span> <a class="btn quiet sm" href="#/question/edit/${encodeURIComponent(q.path)}">Edit</a>` : facts.find(f => f.path === q.path) ? '<span class="pill ok">Published</span>' : '<span class="pill">On the screen only</span>'}</td></tr>`))
  return `<div class="toolbar"><div><h1>Questions asked of the filer</h1><p class="sub" style="margin:0">Everything the Virginia screens ask that no federal fact answers. ${canEdit() ? 'A new rule that needs something the return does not know starts here.' : ''}</p></div>${canEdit() ? '<div class="acts"><a class="btn" href="#/question/new">+ Ask the filer something new</a></div>' : ''}</div>
    <table class="grid"><thead><tr><th>Question</th><th>Answer</th><th>Screen</th><th></th></tr></thead><tbody>${rows.join('') || '<tr><td colspan="4" class="muted">No questions.</td></tr>'}</tbody></table>`
}

const qState = {}
export function viewQuestionBuilder (arg) {
  if (!canEdit()) return '<p>Reviewers review; switch to an author or engineer to add a question.</p>'
  if (S.data.flow === undefined) return `<p class="err">The flow file is not beside the rules (${esc(S.data.paths.flow)}), so questions cannot be added here.</p>`
  const c = activeChange()
  const editing = arg && arg.startsWith('edit/') ? decodeURIComponent(arg.slice(5)) : null
  const existing = editing ? c?.edits.find(e => e.type === 'question' && e.path === editing) : null
  const ps = pages(S.data.flow)
  const qpages = ps.filter(p => p.questions.length && !/correct/.test(p.route))
  const st = qState.cur ??= existing ? { ...existing } : { question: '', answerType: 'boolean', condition: '/vaIsResident', route: qpages[qpages.length - 1]?.route || ps[0].route, placement: 'follow-up', help: '', law: c?.law?.citation || '', yes: 'Yes', no: 'No', pageTitle: '', pageRoute: '' }
  if (existing && qState.for !== editing) { Object.assign(st, existing); qState.for = editing }
  const path = st.path || pathFor(st.question)
  const askedFacts = [...S.model.facts.values()].filter(f => f.kind === 'asked' && f.writable?.type === 'boolean')
  const lint = lintQuestion(st.question)
  const page = ps.find(p => p.route === st.route) || ps[0]
  const preview = renderPagePreview(previewFlow(st, path), st.placement === 'own-screen' ? st.pageRoute || '/your-taxes/virginia/virginia-new' : st.route, S.data.flow)
  const files = [
    [`${questionTargetModule(S.data.facts, { condition: st.condition, route: st.route }, S.data.flow)}.xml`, `<b>+ 1 fact</b> <code>${esc(path)}</code>, writable, ${esc(ANSWERS.find(a => a[0] === st.answerType)?.[1].toLowerCase() || '')}, with the question as its name and the law as its description`],
    [S.data.paths.flow, st.placement === 'own-screen' ? `<b>+ 1 page</b> after “${esc(page?.title || '')}”, with the question, and the “Question N of M” counts renumbered` : `<b>+ 1 screen block</b> on “${esc(page?.title || '')}”, <code>condition="${esc(st.condition)}"</code>, with the <code>&lt;fg-set&gt;</code> and the help text`],
    ['flow_en.yaml', `<b>+ ${questionKeys({ ...st, path }).length} keys</b> when the site is next built, generated from the English`],
    [S.data.paths.es, `<b>+ ${questionKeys({ ...st, path }).length} keys</b>, flagged “needs translation”, holding the English until the translator replaces it (on the change page)`],
    [S.data.paths.examples, `<b>+ 1 starting answer</b> (${st.answerType === 'boolean' ? 'No' : '0'}) so every worked example still runs; an example that says otherwise sets it`],
  ]
  return `
    <div class="crumb"><a href="#/questions">Questions asked</a> › ${existing ? 'Edit' : 'New'}</div>
    <h1>Ask the filer something new</h1>
    <p class="sub">Five answers. The tool writes the fact, the screen and the words. ${c ? `Goes into draft #${c.id}.` : 'Saving starts a draft.'}</p>
    <div class="qb">
      <div>
        <div class="field-row"><label for="q-text"><span class="step-n">1</span>What do you need to know?</label><input type="text" id="q-text" data-q="question" value="${esc(st.question)}" style="width:100%" placeholder="Is the person this account is for someone with a disability?"><div class="lint">${lint.map(l => `<span class="${l.ok ? '' : 'w'}">${esc(l.text)}</span>`).join('')}</div><div class="hint">Name in the code: <code>${esc(path)}</code> <button class="btn quiet sm" data-act="q-path">change</button></div></div>
        <div class="field-row"><span class="lbl"><span class="step-n">2</span>What kind of answer?</span>${ANSWERS.map(([k, l, why]) => `<button type="button" class="choice ${st.answerType === k ? 'on' : ''}" data-act="q-answer" data-value="${k}" title="${esc(why)}">${l}</button>`).join('')}<div class="hint">${esc(ANSWERS.find(a => a[0] === st.answerType)?.[2] || '')}.</div>${st.answerType === 'boolean' ? `<div style="display:flex;gap:8px;margin-top:6px"><input type="text" data-q="yes" value="${esc(st.yes)}" style="width:160px" aria-label="Wording for yes"><input type="text" data-q="no" value="${esc(st.no)}" style="width:200px" aria-label="Wording for no"></div>` : ''}</div>
        <div class="field-row"><label for="q-cond"><span class="step-n">3</span>Who gets asked?</label><select id="q-cond" data-q="condition" style="width:100%"><option value="/vaIsResident" ${st.condition === '/vaIsResident' ? 'selected' : ''}>Every Virginia resident</option>${askedFacts.map(f => `<option value="${esc(f.path)}" ${st.condition === f.path ? 'selected' : ''}>Only filers who answered Yes to: ${esc(f.name)}</option>`).join('')}</select><div class="hint">Everyone else never sees it. The same choice becomes the screen's condition and keeps a rule from reading an answer that was never given.</div></div>
        <div class="field-row"><label for="q-route"><span class="step-n">4</span>Where in the flow?</label><select id="q-route" data-q="route" style="width:100%">${ps.filter(p => !/correct/.test(p.route) || p.route === st.route).map(p => `<option value="${esc(p.route)}" ${st.route === p.route ? 'selected' : ''}>${esc(p.title)}${p.questions.length ? ` (${p.questions.length} question${p.questions.length > 1 ? 's' : ''})` : ''}</option>`).join('')}</select>
          <div style="margin-top:6px"><button type="button" class="choice ${st.placement === 'follow-up' ? 'on' : ''}" data-act="q-place" data-value="follow-up">Follow-up on that screen</button><button type="button" class="choice ${st.placement === 'own-screen' ? 'on' : ''}" data-act="q-place" data-value="own-screen">Its own screen, right after it</button></div>
          ${st.placement === 'own-screen' ? `<div style="display:grid;gap:6px;margin-top:6px"><input type="text" data-q="pageTitle" value="${esc(st.pageTitle)}" placeholder="Screen title, e.g. Account beneficiary" aria-label="Screen title"><input type="text" data-q="pageRoute" value="${esc(st.pageRoute)}" placeholder="/your-taxes/virginia/virginia-beneficiary" aria-label="Route"></div><div class="hint">A new screen joins the “Question N of M” count; the others are renumbered, in English and Spanish.</div>` : '<div class="hint">A follow-up keeps “Question N of M” as it is.</div>'}</div>
        <div class="field-row"><label for="q-help"><span class="step-n">5</span>Help the filer</label><textarea id="q-help" data-q="help" placeholder="Shown under the question. Say what the answer changes, and cite the law.">${esc(st.help)}</textarea><input type="text" data-q="law" value="${esc(st.law)}" style="width:100%;margin-top:6px" placeholder="The law this comes from (becomes the fact's description)" aria-label="The law"></div>
        <div class="add-row"><button class="btn" data-act="q-save">${existing ? 'Update in my draft' : 'Put in my draft'}</button>${existing ? `<button class="btn danger" data-act="q-remove" data-path="${esc(existing.path)}">Remove from draft</button>` : ''}<a class="btn quiet" href="#/questions">Cancel</a></div>
      </div>
      <div class="stack">
        <div><div class="cap">Preview · as the filer sees it</div>${preview}<p class="cite" style="margin:6px 0 0">A rendering of the page by the workbench; dashed outline marks what this adds. The site build is the real page.</p></div>
        <div class="panel"><div class="panel-h">Files it writes <span class="pill">engineer's view</span></div><div class="panel-b files">${files.map(([f, w]) => `<div><code>${esc(f.split('/').pop())}</code><span class="what">${w}</span></div>`).join('')}</div></div>
      </div>
    </div>`
}

function pathFor (q) {
  const words = String(q || '').replace(/[^A-Za-z0-9 ]/g, '').split(/\s+/).filter(w => w.length > 2 && !/^(the|you|your|did|how|much|what|that|were|from|this|with|have|for|someone|any|are|was|does)$/i.test(w)).slice(0, 4)
  return '/va' + (words.map(w => w[0].toUpperCase() + w.slice(1).toLowerCase()).join('') || 'NewQuestion')
}

function lintQuestion (q) {
  const s = String(q || '').trim()
  const words = s ? s.split(/\s+/).length : 0
  const out = [{ ok: (s.match(/\?/g) || []).length <= 1 && !/\band\b.*\?.*\?/.test(s), text: 'One question' }, { ok: words > 0 && words <= 20, text: `${words} word${words === 1 ? '' : 's'}` }, { ok: !s || /\byou\b|\byour\b/i.test(s) || /^(is|are|does|do|did|was|were|how)\b/i.test(s), text: 'Spoken to “you”' }]
  const jargon = ['beneficiary', 'taxpayer', 'pursuant', 'subdivision', 'designated', 'aforementioned']
  const hit = jargon.find(j => new RegExp(`\\b${j}\\b`, 'i').test(s))
  out.push(hit ? { ok: false, text: `“${hit}” is a legal word; the style guide prefers a plain one` } : { ok: true, text: 'No jargon' })
  return out
}

function previewFlow (st, path) {
  try {
    const e = { ...st, type: 'question', path, default: st.answerType === 'boolean' ? false : 0, pageRoute: st.pageRoute || '/your-taxes/virginia/virginia-new', pageTitle: st.pageTitle || st.question }
    return applyChange({ facts: S.data.facts, flow: S.data.flow, es: undefined }, { id: activeChange()?.id ?? 0, edits: [e], spanish: {} }).flow
  } catch (x) { return S.data.flow }
}

/** A page of the flow, drawn as the filer would see it. Elements not on `baseFlow`'s page are outlined. */
export function renderPagePreview (flow, route, baseFlow) {
  let page
  try { page = pages(flow).find(p => p.route === route) } catch (e) { return `<div class="scr"><div class="scr-b err">${esc(e.message)}</div></div>` }
  if (!page) return `<div class="scr"><div class="scr-b muted">No page ${esc(route)}.</div></div>`
  let baseKeys = new Set()
  let baseQ = new Set()
  if (baseFlow) { try { const b = pages(baseFlow).find(p => p.route === route); baseKeys = new Set(b?.texts.map(t => t.key)); baseQ = new Set(b?.questions.map(q => q.path)) } catch { /* no base */ } }
  const show = html => esc(html).replace(/&lt;fg-show path=&quot;([^&]+)&quot;\/&gt;/g, (m, p) => `<span class="fg">${esc(demoValue(p))}</span>`).replace(/&lt;(\/?)(strong|em|span|b|i|code|br)(?: .*?)?&gt;/g, '<$1$2>').replace(/&lt;a .*?&gt;/g, '<u>').replace(/&lt;\/a&gt;/g, '</u>')
  const parts = []
  for (const sc of page.screens) {
    const items = []
    for (const t of sc.texts) {
      const isNew = baseFlow && !baseKeys.has(t.key)
      const tag = t.tag === 'h2' ? 'h2' : t.tag === 'h3' ? 'h3' : 'p'
      items.push(`<${tag} class="${/va-eyebrow/.test(t.class) ? 'eyebrow' : ''} ${isNew ? 'new' : ''}">${show(t.inner)}</${tag}>`)
    }
    for (const q of sc.questions) {
      const isNew = baseFlow && !baseQ.has(q.path)
      const ctl = q.type === 'boolean' ? '<div class="radio"><i class="on"></i> Yes</div><div class="radio"><i></i> No</div>' : q.type === 'dollar' ? '<span class="box-in">$ 0</span>' : q.type === 'date' ? '<span class="box-in">mm / dd / yyyy</span>' : q.type === 'enum' ? '<span class="box-in">Choose ▾</span>' : '<span class="box-in">0</span>'
      items.push(`<div class="q ${isNew ? 'new' : ''}"><div class="qlabel">${esc(q.question)}</div>${ctl}</div>`)
    }
    const cond = sc.condition && sc.condition.path !== '/vaIsResident' ? `<div class="cond">shown when ${esc(chipName(sc.condition.path))} is ${sc.condition.operator === 'isFalse' ? 'no' : 'yes'}</div>` : ''
    parts.push(`<div class="screen">${cond}${items.join('')}</div>`)
  }
  return `<div class="scr"><div class="scr-top"><span>Commonwealth of Virginia · File your Virginia return</span><i>Demonstration</i></div><div class="scr-b"><div class="ptitle">${esc(page.title)}</div>${parts.join('')}<span class="go">Continue</span></div></div>`
}

function demoValue (p) {
  const f = S.model.facts.get(p)
  if (f?.kind === 'value') return literalLabel(f.literal.tag, f.literal.value)
  if (p === '/taxYear') return String(S.year || S.data.siteYear)
  if (p === '/primaryFiler/firstName') return 'Morgan'
  if (/postalCode/.test(p)) return '22901'
  return f ? `[${shortName(f.name)}]` : `[${p.split('/').pop()}]`
}

export async function questionAct (act, b) {
  const st = qState.cur
  if (!st) return
  if (act === 'q-answer') { st.answerType = b.dataset.value; render(); return }
  if (act === 'q-place') { st.placement = b.dataset.value; render(); return }
  if (act === 'q-path') { const p = await askText('Name in the code', 'A path like /vaSomethingNew', st.path || pathFor(st.question)); if (p) st.path = p; render(); return }
  if (act === 'q-remove') { const c = activeChange(); if (!c) return; c.edits = c.edits.filter(e => !(e.type === 'question' && e.path === b.dataset.path)); c.edits = c.edits.filter(e => !(e.type === 'rule' && e.derived.includes(`path="${b.dataset.path}"`))); delete qState.cur; delete qState.for; saveSoon(c); toast('Removed from your draft, with any rule that used it.'); location.hash = '#/questions'; return }
  if (act === 'q-save') {
    if (!st.question.trim()) { toast('Write the question first.', true); return }
    if (st.placement === 'own-screen' && !/^\/your-taxes\/virginia\/[a-z0-9-]+$/.test(st.pageRoute)) { toast('Give the new screen a route like /your-taxes/virginia/virginia-something.', true); return }
    if (!st.law.trim()) { toast('Say which law this question comes from.', true); return }
    const path = st.path || pathFor(st.question)
    if (S.model.facts.has(path) && !activeChange()?.edits.some(e => e.type === 'question' && e.path === path)) { toast(`${path} already exists. Change the name in the code.`, true); return }
    const c = await ensureDraft()
    if (!c) return
    const e = { type: 'question', path, name: st.name || st.question, law: st.law, answerType: st.answerType, question: st.question.trim(), help: st.help.trim(), condition: st.condition, route: st.route, placement: st.placement, pageTitle: st.pageTitle, pageRoute: st.placement === 'own-screen' ? st.pageRoute : '', yes: st.yes || 'Yes', no: st.no || 'No', default: st.answerType === 'boolean' ? false : st.answerType === 'day' ? '' : 0 }
    if (e.default === '') delete e.default
    c.edits = c.edits.filter(x => !(x.type === 'question' && x.path === (qState.for || path)))
    c.edits.push(e)
    delete qState.cur; delete qState.for
    saveSoon(c)
    toast(`${path} is in your draft. It is in the rule editor's picker now as “Asked”.`)
    location.hash = '#/questions'
  }
}

export function questionInput (t) {
  const st = qState.cur
  if (!st) return
  st[t.dataset.q] = t.value
  if (t.tagName === 'SELECT' || t.dataset.q === 'question') render()
  else { const pv = $('.qb .scr'); if (pv) pv.outerHTML = renderPagePreview(previewFlow(st, st.path || pathFor(st.question)), st.placement === 'own-screen' ? st.pageRoute || '/your-taxes/virginia/virginia-new' : st.route, S.data.flow) }
}

export function clearQuestionState () { delete qState.cur; delete qState.for }
