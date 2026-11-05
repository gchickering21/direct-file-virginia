// Runs worked examples off the main thread. Loading a dictionary takes a second or two, so the page
// would freeze on every keystroke otherwise; here it just shows "recalculating" until the answer
// comes back. The last two dictionaries are kept, since the page asks for "as published" and
// "with this draft" over and over.
//
// The engine and the sandbox are imported lazily, so a failed import (the engine bundle missing,
// say) answers every message with the error instead of killing the worker before it can speak.
// The page's worker.onerror covers the rest.

const ready = Promise.all([import('../engine.js'), import('../lib/sandbox.js')])
  .then(([engine, sandbox]) => {
    const cache = new Map()
    const fg = {
      ...engine,
      FactDictionaryFactory: {
        importFromXml (xml) {
          if (cache.has(xml)) return cache.get(xml)
          const dict = engine.FactDictionaryFactory.importFromXml(xml)
          cache.set(xml, dict)
          if (cache.size > 2) cache.delete(cache.keys().next().value)
          return dict
        },
      },
    }
    return { fg, sandbox }
  })
  .catch(e => ({ error: `The example runner could not load the engine: ${String(e.message || e)}` }))

self.onmessage = async ({ data }) => {
  const { id, files, federal, examples, baseline, schema, outputs } = data
  const mods = await ready
  if (mods.error) { self.postMessage({ id, error: mods.error }); return }
  const { fg, sandbox } = mods
  let xml
  try {
    xml = sandbox.buildSandboxXml({ ...files, federal })
  } catch (e) {
    self.postMessage({ id, error: e.message, missing: e.paths || null })
    return
  }
  try {
    self.postMessage({ id, ...sandbox.runExamples(fg, xml, { examples, baseline }, schema, outputs) })
  } catch (e) {
    self.postMessage({ id, error: String(e.jl_Throwable__f_s || e.message || e) })
  }
}
