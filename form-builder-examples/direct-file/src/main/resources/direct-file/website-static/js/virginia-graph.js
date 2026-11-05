// The two things every Virginia script does with the Fact Graph, written once.
//
// `read` is a fact's value as a string, or null when it is incomplete or the path is unknown (the
// engine throws on an unknown path; a script that only looks should not). `update` is what a script
// does after writing facts: persist the graph the way the runtime does and tell the page, so every
// <fg-show> and condition recomputes.
import { factGraph, saveFactGraph } from '../vendor/form-builder/flow-runtime/js/fg-fact-graph.js'

export { factGraph }

export function read (path) {
  try { const r = factGraph.get(path); return r.hasValue ? r.get.toString() : null } catch { return null }
}

export function update () {
  saveFactGraph()
  document.dispatchEvent(new CustomEvent('fg-update'))
}
