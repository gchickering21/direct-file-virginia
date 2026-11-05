// The workspace's fact links, repaired.
//
// In an --auditMode build the Taxpert audit panel wraps every <fg-show> in a <fact-link> to its
// fact inspector, reading the path from the element's `path` *property*. Form Builder's FgShow sets
// that property in its connectedCallback, so when the panel runs before the flow runtime has
// upgraded the elements, every link is written with path="undefined" and an href of "#undefined"
// (taxpert/packages/ui/src/audit-panel/js/taxpert-audit-panel.js, audited-fact.js). The clone the
// link wraps still carries the `path` attribute, so the figure shows; only the link is broken.
//
// This reads the attribute back off the wrapped <fg-show> and sets what FactLink's connectedCallback
// would have set: the attribute, the property its click handler reads, and the href. An observer
// covers links the panel adds after this runs. A production build has no workspace and no links, and
// this does nothing. It is a workaround for the upstream race, not a feature; it writes no fact.
function repair (root) {
  for (const link of root.querySelectorAll('fact-link[path="undefined"]')) {
    const path = link.querySelector('fg-show[path]')?.getAttribute('path')
    if (!path) continue
    link.setAttribute('path', path)
    link.path = path
    const a = link.querySelector('a')
    if (a) a.href = `#${path}`
  }
}

repair(document)
new MutationObserver(records => {
  for (const r of records) for (const n of r.addedNodes) if (n.nodeType === 1 && (n.matches?.('fact-link') || n.querySelector?.('fact-link'))) { repair(document); return }
}).observe(document.body, { childList: true, subtree: true })
