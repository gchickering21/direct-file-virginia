// A link that lands on a demo household: `?demo=1` to `?demo=4`, or `?scenario=<file name>` for any
// file in resources/scenarios/ (without `.json`). The demos are the households in
// resources/data/virginia-demos.json, the one list of them.
//
// The runtime keeps the Fact Graph in sessionStorage under `direct-file:factGraph` and rehydrates
// from it on every page, which is also how the browser checks (scripts/virginia-cases.cjs,
// scripts/virginia-a11y.cjs) seed a household. This does the same from a URL: fetch the scenario,
// store it, and reload the page without the parameter so the runtime starts from the stored graph.
// Fetch is asynchronous, so the first paint is the empty return; the reload a moment later is the
// household. Nothing here writes a fact.
const params = new URLSearchParams(window.location.search)
const demo = params.get('demo')
const scenario = params.get('scenario')

async function fileName () {
  if (scenario) return scenario
  if (!demo) return null
  // The script is served at <base>/resources/js/, the manifest at <base>/resources/data/.
  const manifest = await (await fetch(new URL('../data/virginia-demos.json', import.meta.url))).json()
  return manifest.demos.find(d => String(d.n) === demo)?.file || null
}

if (demo || scenario) {
  fileName()
    .then(name => {
      if (!name) throw new Error(`no demo ${demo}`)
      if (!/^[\w-]+$/.test(name)) throw new Error(`not a scenario name: ${name}`)
      const url = new URL(`../scenarios/${name}.json`, import.meta.url)
      return fetch(url).then(r => { if (!r.ok) throw new Error(`${r.status} for ${url.pathname}`); return r.text() })
    })
    .then(text => {
      JSON.parse(text)
      sessionStorage.setItem('direct-file:factGraph', text)
      params.delete('demo')
      params.delete('scenario')
      const rest = params.toString()
      window.location.replace(window.location.pathname + (rest ? `?${rest}` : '') + window.location.hash)
    })
    .catch(e => console.warn(`virginia-demo-link: could not load ${demo || scenario}: ${e.message}`))
}
