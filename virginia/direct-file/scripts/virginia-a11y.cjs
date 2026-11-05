// Usage: PORT_DIR=. AXE_PATH=<path to axe.min.js> [PLAYWRIGHT_MODULE=<playwright-core>] node scripts/virginia-a11y.cjs   (needs `make dev` or `make up` running)
// A11Y_REPORT=<file>: also write every scan's result as JSON (the proof page reads it).
// Accessibility pass over the Virginia screens with axe-core (WCAG 2.0/2.1 A and AA), Demo 1 loaded:
// every English route, every Spanish route (/es/ before the route), and an error-state pass on the
// locality page (Continue with nothing chosen, then scan). The whole document is scanned, chrome
// included; the one exclusion list below names what is outside the Virginia chrome and belongs to the
// IRS scaffold or the workspace, so a violation there is reported separately rather than failing.
//
// The routes are read from flow/your-taxes-virginia.xml and cut the way Form Builder's PageSplitter
// cuts a page under --singleQuestionPerScreen (a page whose top-level blocks are all df-screen divs,
// more than one, becomes one route per block, named by the first four words of the block's heading),
// so a new screen is scanned without anyone editing a list here.
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || '@playwright/test');
const fs = require('fs'); const { pathToFileURL } = require('url'); const P = process.env.PORT_DIR; const AXE = process.env.AXE_PATH || require.resolve('axe-core/axe.min.js');
const BASE = process.env.BASE_URL || 'http://localhost:3008/app/direct-file';
const RES = `${P}/src/main/resources/direct-file`;
// The split routes, after PageSplitter.scala: splitByBlocks, blockSlug, slugFromHeadingText.
function routesOf (xml, parseTree) {
  const root = parseTree(xml); const flow = root.children.find(c => c.tag === 'FlowConfig') || root;
  const units = n => n.children.flatMap(c => c.tag === 'section' ? units(c) : c.tag === 'modal' ? [] : [c]);
  const heading = n => { for (const c of n.children) { if (/^h[234]$/.test(c.tag)) return xml.slice(c.innerStart, c.innerEnd); const h = heading(c); if (h) return h; } return null; };
  const slug = raw => raw.replace(/<[^>]+>/g, ' ').replace(/['\u2019]/g, '').replace(/[^A-Za-z0-9\s]/g, ' ').trim().toLowerCase().split(/\s+/).filter(Boolean).slice(0, 4).join('-');
  const out = [];
  for (const p of flow.children.filter(c => c.tag === 'page')) {
    const route = p.attrs.route.replace(/^\/your-taxes\/virginia\//, '');
    const blocks = units(p);
    if (blocks.length < 2 || !blocks.every(b => b.tag === 'div' && /\bdf-screen\b/.test(b.attrs.class || ''))) { out.push(route); continue; }
    const used = new Set();
    blocks.forEach((b, i) => { const h = heading(b); const base = (h && slug(h)) || `screen-${i + 1}`; let s = base; for (let n = 2; used.has(s); n++) s = `${base}-${n}`; used.add(s); out.push(`${route}/${s}`); });
  }
  return out;
}
const LANGS = ['', 'es'];
// Outside the Virginia chrome: the scaffold's and the workspace's own markup, which this prototype does not own.
// A violation whose every node is inside one of these is listed under "outside the Virginia chrome" and does not count.
// fact-link: the workspace wraps every <fg-show> in a link to its fact inspector (an --auditMode build only), so a
// <summary> that shows a figure then holds a link, which axe reports as nested-interactive on the summary. The link is the
// workspace's; a production build has none. isOutside below treats that case as outside too.
const OUTSIDE = ['taxpert-global-nav', 'taxpert-screens-toolbar', 'taxpert-audit-panel', '.tool-dock', '.logo-banner', 'footer.footer', '#gov-banner-default', '.usa-banner', '.gtm-noscript', 'fact-link'];
(async () => {
  const { parseTree } = await import(pathToFileURL(`${P}/workbench/lib/flow.js`).href);
  const PAGES = routesOf(fs.readFileSync(`${RES}/flow/your-taxes-virginia.xml`, 'utf8'), parseTree);
  const demo = JSON.parse(fs.readFileSync(`${RES}/website-static/data/virginia-demos.json`, 'utf8')).demos.find(d => d.n === 1);
  console.log(`${PAGES.length} Virginia routes, with ${demo.name} loaded`);
  const browser = await chromium.launch(); const page = await browser.newPage({ viewport: { width: 1280, height: 1000 } });
  const g = JSON.parse(fs.readFileSync(`${RES}/scenarios/${demo.file}.json`, 'utf8'));
  const f = g.facts || g; // make the correction pages render: not everything right, correcting a W-2 (the dob and records pages flip the target below)
  f['/vaEverythingRight'] = { $type: 'gov.irs.factgraph.persisters.BooleanWrapper', item: false };
  f['/vaCorrectionTarget'] = { $type: 'gov.irs.factgraph.persisters.EnumWrapper', item: { value: 'w2', enumOptionsPath: '/vaCorrectionTargetOptions' } };
  // military yes, both kinds; savers and purchases yes, so every amount page shows
  for (const p of ['/vaHasMilitaryIncome', '/vaHasMilitaryBasicPay', '/vaHasMilitaryRetirement', '/vaHasCommonwealthSaversContributions', '/vaHasUntaxedPurchases']) f[p] = { $type: 'gov.irs.factgraph.persisters.BooleanWrapper', item: true };
  // Seeds the graph on the first load only, so the per-page target set below survives the next navigation.
  await page.addInitScript(gg => { if (!sessionStorage.getItem('direct-file:factGraph')) sessionStorage.setItem('direct-file:factGraph', gg); }, JSON.stringify(g));
  const scan = () => page.evaluate(async (outside) => {
    const r = await axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] } });
    const isOutside = (target, id) => { try { const el = document.querySelector(target); if (!el) return false; if (outside.some(sel => el.matches(sel) || el.closest(sel))) return true; if (id === 'nested-interactive') { const f = [...el.querySelectorAll('a, button, input, select, textarea, [tabindex]')]; return f.length > 0 && f.every(x => x.closest('fact-link')); } return false; } catch { return false; } };
    const pick = v => ({ id: v.id, impact: v.impact, help: v.help, nodes: v.nodes.map(n => n.target.join(' ')).slice(0, 3), count: v.nodes.length });
    const inside = [], out = [];
    for (const v of r.violations) {
      const nodes = v.nodes.filter(n => !isOutside(n.target.join(' '), v.id));
      if (nodes.length) inside.push(pick({ ...v, nodes }));
      if (nodes.length < v.nodes.length) out.push(pick({ ...v, nodes: v.nodes.filter(n => isOutside(n.target.join(' '), v.id)) }));
    }
    return { inside, out };
  }, OUTSIDE);
  let total = 0, outsideTotal = 0; const byRule = {}; const scans = [];
  const report = (label, res) => {
    scans.push({ label, inside: res.inside, outside: res.out });
    total += res.inside.reduce((a, v) => a + v.count, 0); outsideTotal += res.out.reduce((a, v) => a + v.count, 0);
    console.log(`${label}: ${res.inside.length ? res.inside.map(v => `${v.id}(${v.impact}) ×${v.count} e.g. ${v.nodes[0]}`).join('; ') : 'clean'}${res.out.length ? `   [outside the Virginia chrome: ${res.out.map(v => `${v.id} ×${v.count}`).join(', ')}]` : ''}`);
    res.inside.forEach(v => { byRule[v.id] = (byRule[v.id] || 0) + v.count; });
  };
  // The start page first: outside the flow, no household needed, English only.
  await page.goto(`${BASE}/resources/start/`, { waitUntil: 'load' }); await page.waitForTimeout(800);
  await page.addScriptTag({ path: AXE }); report('resources/start (the start page)', await scan());
  for (const lang of LANGS) {
    for (const r of PAGES) {
      const url = `${BASE}/${lang ? lang + '/' : ''}your-taxes/virginia/${r}/`;
      // The correction pages are gated on the target. Set it in the stored graph *before* loading the page:
      // a gated block that renders hidden has the facts inside it deleted (fg-conditions.js), so flipping
      // the target after load would already have cost the page its answers (the records lines, say).
      const target = { 'virginia-correct-dob': 'dateOfBirth', 'virginia-correct-records': 'records' }[r] || 'w2';
      await page.evaluate(t => { if (!window.factGraph) return; window.factGraph.set('/vaCorrectionTarget', t); sessionStorage.setItem('direct-file:factGraph', window.factGraph.toJSON()); }, target);
      await page.goto(url, { waitUntil: 'load' }); await page.waitForTimeout(1500);
      await page.addScriptTag({ path: AXE });
      report(`${lang ? lang + '/' : ''}${r}`, await scan());
      if (r === 'virginia-locality') { // the error state: clear the answer, press Continue, scan with the error showing
        await page.evaluate(() => { window.factGraph.delete('/vaLocality'); document.dispatchEvent(new CustomEvent('fg-update')); });
        await page.click('.form-actions a.usa-button:not(.usa-button--outline)'); await page.waitForTimeout(500);
        const focused = await page.evaluate(() => { const a = document.activeElement; return a ? `${a.tagName.toLowerCase()}${a.id ? '#' + a.id : ''}.${a.className}` : 'none'; });
        report(`${lang ? lang + '/' : ''}${r} (error state; focus on ${focused})`, await scan());
      }
      if (r === 'virginia-sign') { // the Send button without the box checked: the error on the checkbox
        await page.click('.va-send-button'); await page.waitForTimeout(300);
        report(`${lang ? lang + '/' : ''}${r} (unsigned send)`, await scan());
      }
    }
  }
  console.log(`\ntotal violations inside the Virginia chrome: ${total} ${JSON.stringify(byRule)}; outside it (not counted): ${outsideTotal}`);
  if (process.env.A11Y_REPORT) fs.writeFileSync(process.env.A11Y_REPORT, JSON.stringify({ ran: new Date().toISOString(), base: BASE, household: demo.name, standards: ['WCAG 2.0 A and AA', 'WCAG 2.1 A and AA'], scans: scans.length, routes: PAGES.length, languages: LANGS.length, violations: total, outsideViolations: outsideTotal, byRule, pages: scans }, null, 1));
  await browser.close(); process.exit(total ? 1 : 0);
})().catch(e => { console.error('FAILED', e.message.slice(0,300)); process.exit(1); });
