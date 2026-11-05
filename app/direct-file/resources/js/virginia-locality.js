// The locality the federal address points to, so the locality screen starts filled in.
//
// Form 760 asks for the city or county the filer lived in on January 1. The federal return already
// holds their ZIP code (/address/postalCode, exported to MeF). On any Virginia screen this looks the
// ZIP up in resources/data/virginia-zip-localities.json (scripts/build-virginia-zip-localities.py)
// and records what it found in the facts the locality screen's notes are gated on: the one
// locality the ZIP lies in (and its name), or that it crosses a line and which localities it
// crosses. When it lies in one and the filer has not answered yet, it also fills in /vaLocality,
// which the filer then confirms on the screen. An answer already given is never overwritten: if
// the address has since moved to another locality, /vaLocalityFromAddress no longer matches it and
// the flow's "your address now points to…" note shows instead. No user-facing words are written
// here; they are in the flow. The combo box's visible text follows the fact through
// virginia-combo-box.js, so no reload is needed.

import { factGraph, read, update } from './virginia-graph.js'
const write = (path, value) => {
  if (read(path) === (value === null ? null : String(value))) return false
  if (value === null) factGraph.delete(path)
  else factGraph.set(path, value)
  return true
}

async function apply () {
  if (!/\/your-taxes\/virginia\//.test(location.pathname)) return
  const zip = (read('/address/postalCode') || '').slice(0, 5)
  if (!zip) return
  let zips
  try { zips = await (await fetch(new URL('../data/virginia-zip-localities.json', import.meta.url))).json() } catch { return }
  // eslint-disable-next-line security/detect-object-injection -- a five-digit ZIP from the return
  const found = Object.hasOwn(zips, zip) ? zips[zip] : []
  const one = found.length === 1 ? found[0] : null
  let changed = false
  changed = write('/vaLocalityFromAddress', one ? one[0] : null) || changed
  changed = write('/vaLocalityFromAddressName', one ? one[1] : null) || changed
  changed = write('/vaAddressZipIsSplit', found.length ? found.length > 1 : null) || changed
  changed = write('/vaAddressZipLocalityNames', found.length > 1 ? found.map(([, name]) => name).join(', ') : null) || changed
  const filled = one !== null && read('/vaLocality') === null && write('/vaLocality', one[0])
  if (!changed && !filled) return
  update()
}
apply()
