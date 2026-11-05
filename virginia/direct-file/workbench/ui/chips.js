// Small pieces several views draw: a chip for a fact path (asked / federal / calc / value), a line's
// name, a change's status pill, a result cell, and what a path refers to in the published rules or
// the draft.

import { describePath, formatResult, literalLabel, shortName } from './model.js'
import { S, STATUS, esc } from './state.js'
import { at } from './views/rule.js'

export function chip (path, opts = {}) {
  if (!path) return `<button class="chip empty" data-act="pick" data-at="${opts.at}">choose… <span class="caret">▾</span></button>`
  let d = describePath(S.model, path)
  if (d.kind === 'missing' && S.draftModel?.facts.has(path)) d = { ...describePath(S.draftModel, path), draft: true }
  const req = S.data.requests.find(r => r.factPath === path && r.status === 'open')
  const kind = d.kind === 'missing' && req ? 'req' : d.kind
  const tag = kind === 'req' ? `Requested #${req.id}` : { asked: 'Asked', federal: 'Federal', calc: 'Calc', value: 'Value', missing: 'Unknown' }[kind]
  const label = kind === 'req' ? req.question : d.label
  const value = d.fact?.literal ? ` <b>${esc(literalLabel(d.fact.literal.tag, d.fact.literal.value))}</b>` : ''
  const inner = `<span class="ty ${kind}">${d.draft ? 'Asked · in draft' : tag}</span> ${esc(label)}${value}`
  if (opts.at !== undefined && opts.editable) return `<button class="chip ${kind === 'req' ? 'req' : kind === 'missing' ? 'missing' : ''}" data-act="pick" data-at="${opts.at}" title="${esc(path)}">${inner} <span class="caret">▾</span></button>`
  const href = d.fact && d.fact.kind !== 'value' ? `#/rule/${encodeURIComponent(path)}` : d.fact ? '#/values' : null
  return href ? `<a class="chip" href="${href}" title="${esc(path)}" style="text-decoration:none">${inner}</a>` : `<span class="chip ${kind === 'req' ? 'req' : ''}" title="${esc(path)}">${inner}</span>`
}

export function lineName (path) {
  const f = S.model.facts.get(path) || S.draftModel?.facts.get(path)
  return f?.line ? `Line ${f.line.label}` : f?.name || path
}

export function lineStatus (path) {
  const c = S.data.changes.find(x => ['draft', 'review', 'approved'].includes(x.status) && x.edits.some(e => e.path === path))
  if (!c) return null
  return c
}

export function statusPill (c) {
  const [label, cls] = STATUS[c.status]
  return `<span class="pill ${cls}">${label}</span>`
}

export function resultCell (r, path, expected) {
  if (!r) return '<span class="spin" title="running"></span>'
  if (r.error) return `<span class="res-bad" title="${esc(r.error)}">error</span>`
  const v = r.values?.[path]
  if (expected === undefined) return esc(formatResult(v))
  const ok = v !== null && v !== undefined && (typeof v === 'number' ? Math.abs(v - Number(expected)) < 0.005 : String(v) === String(expected))
  return `<span class="${ok ? 'res-ok' : 'res-bad'}">${esc(formatResult(v))} ${ok ? '✓' : '✗'}</span>`
}

export function describeAny (p) {
  const d = describePath(S.model, p)
  return d.kind === 'missing' && S.draftModel?.facts.has(p) ? { ...describePath(S.draftModel, p), draft: true } : d
}

export function chipName (path) { const d = S.model.facts.get(path); return d ? shortName(d.name) : path }
