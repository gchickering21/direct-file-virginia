// Starting a change from the law: what the pasted text seems to touch. No model, no network: the
// proposals come from the citation and the numbers in the text, matched against the values the
// rules already hold and the words on the screens. Every proposal is a suggestion the author keeps
// or drops; nothing here writes a file.

import { scanFacts } from './sandbox.js'
import { valueSchedule, valueAt } from './xml-edit.js'
import { pages, amountsIn } from './flow.js'

const clean = s => String(s || '').replace(/\s+/g, ' ').trim()
const SECTION_RE = /58\.1-\d+(?:\.\d+)?(?:\([A-Za-z0-9]+\))*/g

/** "§ 58.1-322.03(7)(a)" → ["58.1-322.03(7)(a)", "58.1-322.03(7)", "58.1-322.03"]: the section and its parents. */
function sectionChain (cite) {
  const out = []
  let s = cite
  while (s) { out.push(s); const i = s.lastIndexOf('('); s = i > 0 ? s.slice(0, i) : '' }
  return out
}

const money = n => '$' + Number(n).toLocaleString('en-US')

/**
 * Proposals for a law change: { values, words, question, outOfScope }.
 *   values: value facts the citation names, with the amounts in the text that could be their new figure
 *   words: places on the screens that quote a current figure of one of those values
 */
export function proposeParts ({ citation, text, effectiveYear }, { virginia, localities, flow }, year) {
  const cites = [...new Set([...clean(citation).matchAll(SECTION_RE)].map(m => m[0]))]
  const amounts = [...new Set(amountsIn(text).map(a => a.value))]
  const pct = [...new Set([...String(text).matchAll(/(\d+(?:\.\d+)?)\s?(?:%|percent)/g)].map(m => Number(m[1])))]
  const values = []
  // A figure alone is weak evidence; once the citation names a value, figures alone are not used.
  let anyByCite = false
  const found = []
  for (const [file, xml] of [['virginia', virginia], ['localities', localities]]) {
    for (const f of scanFacts(xml)) {
      const schedule = valueSchedule(f.body)
      if (!schedule) continue
      const desc = clean((f.body.match(/<Description>([\s\S]*?)<\/Description>/) || [])[1])
      const name = clean((f.body.match(/<Name>([\s\S]*?)<\/Name>/) || [])[1])
      const factCites = [...desc.matchAll(SECTION_RE)].map(m => m[0])
      const current = valueAt(schedule, year)
      const byCite = cites.some(c => factCites.some(fc => sectionChain(fc).includes(c) || sectionChain(c).includes(fc)))
      const byNumber = schedule.tag === 'Dollar' ? amounts.includes(Number(current)) : schedule.tag === 'Rational' && pct.some(p => Math.abs(p / 100 - ratio(current)) < 1e-9)
      if (!byCite && !byNumber) continue
      if (byCite) anyByCite = true
      const candidates = schedule.tag === 'Dollar' ? amounts.filter(a => a !== Number(current)).map(String) : schedule.tag === 'Rational' ? pct.filter(p => Math.abs(p / 100 - ratio(current)) > 1e-9).map(p => `${Math.round(p * 100)}/10000`) : []
      found.push({ file, path: f.path, name, tag: schedule.tag, current, year: effectiveYear, candidates, byCite, why: byCite ? `cites ${factCites.find(fc => cites.some(c => sectionChain(fc).includes(c) || sectionChain(c).includes(fc)))}` : `the text mentions its current figure, ${schedule.tag === 'Dollar' ? money(current) : current}` })
    }
  }
  for (const v of found) if (v.byCite || !anyByCite) values.push(v)
  const words = []
  if (flow) {
    const ps = pages(flow)
    for (const v of values) {
      if (v.tag !== 'Dollar') continue
      const needle = money(v.current)
      for (const p of ps) for (const t of p.texts) if (t.inner.includes(needle) && !/fg-show[^>]*path="[^"]*"/.test(t.inner.slice(Math.max(0, t.inner.indexOf(needle) - 60), t.inner.indexOf(needle)))) words.push({ route: p.route, title: p.title, tag: t.tag, key: t.key, inner: t.inner, value: v.path, figure: needle })
    }
  }
  return { cites, amounts, pct, values, words }
}

function ratio (v) { const m = String(v).match(/^(-?\d+)\/(\d+)$/); return m ? Number(m[1]) / Number(m[2]) : Number(v) }
