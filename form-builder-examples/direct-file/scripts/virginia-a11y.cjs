// Usage: PORT_DIR=. AXE_PATH=<path to axe.min.js> [PLAYWRIGHT_MODULE=<playwright-core>] node scripts/virginia-a11y.cjs   (needs `make dev` running)
// Accessibility pass over the Virginia screens with axe-core (WCAG 2.0/2.1 A and AA), Riley loaded:
// every English route, every Spanish route (/es/ before the route), and an error-state pass on the
// locality page (Continue with nothing chosen, then scan). The whole document is scanned, chrome
// included; the one exclusion list below names what is outside the Virginia chrome and belongs to the
// IRS scaffold or the workspace, so a violation there is reported separately rather than failing.
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || '@playwright/test');
const fs = require('fs'); const P = process.env.PORT_DIR; const AXE = process.env.AXE_PATH || require.resolve('axe-core/axe.min.js');
const BASE = process.env.BASE_URL || 'http://localhost:3008/app/direct-file';
// Each df-screen block is its own page under singleQuestionPerScreen, routed by the first four words of its heading.
const PAGES = ['virginia-intro', 'virginia-known', 'virginia-check', 'virginia-correct-what', 'virginia-correct-dob', 'virginia-correct-w2', 'virginia-correct-records', 'virginia-corrections', 'virginia-locality', 'virginia-military/were-you-in-the', 'virginia-military/were-you-on-active', 'virginia-military/how-much-military-basic', 'virginia-military/did-you-receive-military', 'virginia-military/how-much-of-it', 'virginia-savers/did-you-put-money', 'virginia-savers/how-much-did-you', 'virginia-use-tax/did-you-buy-anything', 'virginia-use-tax/how-much-did-those', 'virginia-summary', 'virginia-sign'];
const LANGS = ['', 'es'];
// Outside the Virginia chrome: the scaffold's and the workspace's own markup, which this prototype does not own.
// A violation whose every node is inside one of these is listed under "outside the Virginia chrome" and does not count.
const OUTSIDE = ['taxpert-global-nav', 'taxpert-screens-toolbar', 'taxpert-audit-panel', '.tool-dock', '.logo-banner', 'footer.footer', '#gov-banner-default', '.usa-banner', '.gtm-noscript'];
(async () => {
  const browser = await chromium.launch(); const page = await browser.newPage({ viewport: { width: 1280, height: 1000 } });
  const g = JSON.parse(fs.readFileSync(`${P}/src/main/resources/direct-file/scenarios/virginia_demo_1_riley_rappahannock_single_33k.json`, 'utf8'));
  const f = g.facts || g; // make the correction pages render: not everything right, correcting a W-2 (the dob and records pages flip the target below)
  f['/vaEverythingRight'] = { $type: 'gov.irs.factgraph.persisters.BooleanWrapper', item: false };
  f['/vaCorrectionTarget'] = { $type: 'gov.irs.factgraph.persisters.EnumWrapper', item: { value: 'w2', enumOptionsPath: '/vaCorrectionTargetOptions' } };
  // military yes, both kinds; savers and purchases yes, so every amount page shows
  for (const p of ['/vaHasMilitaryIncome', '/vaHasMilitaryBasicPay', '/vaHasMilitaryRetirement', '/vaHasCommonwealthSaversContributions', '/vaHasUntaxedPurchases']) f[p] = { $type: 'gov.irs.factgraph.persisters.BooleanWrapper', item: true };
  // Seeds the graph on the first load only, so the per-page target set below survives the next navigation.
  await page.addInitScript(gg => { if (!sessionStorage.getItem('direct-file:factGraph')) sessionStorage.setItem('direct-file:factGraph', gg); }, JSON.stringify(g));
  const scan = () => page.evaluate(async (outside) => {
    const r = await axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] } });
    const isOutside = target => outside.some(sel => { try { const el = document.querySelector(target); return el && (el.matches(sel) || el.closest(sel)); } catch { return false; } });
    const pick = v => ({ id: v.id, impact: v.impact, help: v.help, nodes: v.nodes.map(n => n.target.join(' ')).slice(0, 3), count: v.nodes.length });
    const inside = [], out = [];
    for (const v of r.violations) {
      const nodes = v.nodes.filter(n => !isOutside(n.target.join(' ')));
      if (nodes.length) inside.push(pick({ ...v, nodes }));
      if (nodes.length < v.nodes.length) out.push(pick({ ...v, nodes: v.nodes.filter(n => isOutside(n.target.join(' '))) }));
    }
    return { inside, out };
  }, OUTSIDE);
  let total = 0, outsideTotal = 0; const byRule = {};
  const report = (label, res) => {
    total += res.inside.reduce((a, v) => a + v.count, 0); outsideTotal += res.out.reduce((a, v) => a + v.count, 0);
    console.log(`${label}: ${res.inside.length ? res.inside.map(v => `${v.id}(${v.impact}) ×${v.count} e.g. ${v.nodes[0]}`).join('; ') : 'clean'}${res.out.length ? `   [outside the Virginia chrome: ${res.out.map(v => `${v.id} ×${v.count}`).join(', ')}]` : ''}`);
    res.inside.forEach(v => { byRule[v.id] = (byRule[v.id] || 0) + v.count; });
  };
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
  await browser.close(); process.exit(total ? 1 : 0);
})().catch(e => { console.error('FAILED', e.message.slice(0,300)); process.exit(1); });
