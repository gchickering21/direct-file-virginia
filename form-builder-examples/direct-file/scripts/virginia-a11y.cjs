// Usage: PORT_DIR=. AXE_PATH=<path to axe.min.js> [PLAYWRIGHT_MODULE=<playwright-core>] node scripts/virginia-a11y.cjs   (needs `make dev` running)
// Accessibility pass over the Virginia screens with axe-core (WCAG 2.0/2.1 A and AA), Riley loaded.
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || '@playwright/test');
const fs = require('fs'); const P = process.env.PORT_DIR; const AXE = process.env.AXE_PATH || require.resolve('axe-core/axe.min.js');
const PAGES = ['virginia-intro', 'virginia-known', 'virginia-check', 'virginia-correct-what', 'virginia-correct-dob', 'virginia-correct-w2', 'virginia-corrections', 'virginia-locality', 'virginia-lottery/did-you-win-a', 'virginia-lottery/how-much-did-those', 'virginia-savers/did-you-put-money', 'virginia-use-tax/did-you-buy-anything', 'virginia-use-tax/how-much-did-those', 'virginia-summary'];
(async () => {
  const browser = await chromium.launch(); const page = await browser.newPage({ viewport: { width: 1280, height: 1000 } });
  const g = JSON.parse(fs.readFileSync(`${P}/src/main/resources/direct-file/scenarios/virginia_demo_1_riley_rappahannock_single_33k.json`, 'utf8'));
  const f = g.facts || g; // make the correction pages render: not everything right, correcting a W-2; lottery yes so its amount page shows
  f['/vaEverythingRight'] = { $type: 'gov.irs.factgraph.persisters.BooleanWrapper', item: false };
  f['/vaCorrectionTarget'] = { $type: 'gov.irs.factgraph.persisters.EnumWrapper', item: { value: 'w2', enumOptionsPath: '/vaCorrectionTargetOptions' } };
  await page.addInitScript(gg => sessionStorage.setItem('direct-file:factGraph', gg), JSON.stringify(g));
  let total = 0; const byRule = {};
  for (const r of PAGES) {
    await page.goto(`http://localhost:3008/app/direct-file/your-taxes/virginia/${r}/`, { waitUntil: 'load' }); await page.waitForTimeout(1500);
    if (r === 'virginia-correct-dob') { // the dob page is gated on target=dateOfBirth; flip for this page only
      await page.evaluate(() => { window.factGraph.set('/vaCorrectionTarget', 'dateOfBirth'); document.dispatchEvent(new CustomEvent('fg-update')); }); await page.waitForTimeout(500);
    }
    await page.addScriptTag({ path: AXE });
    const res = await page.evaluate(async () => { const r = await axe.run(document.querySelector('#main-content') || document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] } }); return r.violations.map(v => ({ id: v.id, impact: v.impact, help: v.help, nodes: v.nodes.map(n => n.target.join(' ')).slice(0, 3), count: v.nodes.length })); });
    total += res.reduce((a, v) => a + v.count, 0);
    console.log(`${r}: ${res.length ? res.map(v => `${v.id}(${v.impact}) ×${v.count} e.g. ${v.nodes[0]}`).join('; ') : 'clean'}`);
    res.forEach(v => { byRule[v.id] = (byRule[v.id] || 0) + v.count; });
  }
  console.log('\ntotal violations:', total, JSON.stringify(byRule));
  await browser.close();
})().catch(e => { console.error('FAILED', e.message.slice(0,300)); process.exit(1); });
