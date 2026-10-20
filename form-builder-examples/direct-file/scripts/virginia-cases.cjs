// Loads each household from scripts/virginia-cases.py into the running dev server (make dev, with
// scenario mode) and compares the Virginia summary lines with an independent model of the rules.
//   python3 scripts/virginia-cases.py /tmp/va-cases && CASES=/tmp/va-cases node scripts/virginia-cases.cjs
const { chromium } = require('@playwright/test');
const fs = require('fs'); const C = process.env.CASES; const BASE = process.env.BASE_URL || 'http://localhost:3008/app/direct-file'; const meta = JSON.parse(fs.readFileSync(`${C}/meta.json`, 'utf8'));
const money = s => s ? Number(String(s).replace(/[$,]/g, '')) : NaN;
// An independent model of the rules from Va. Code §§ 58.1-320, -321, -322.02(3), -322.03(1)(b),(2),(5), TY2024.
function oracle(m, agi, ss) {
  const mfj = m.status === 'marriedFilingJointly';
  const dob = new Date(m.dob + 'T00:00:00Z'); const age65 = dob <= new Date('1960-01-01T00:00:00Z'); const pre1939 = dob <= new Date('1939-01-01T00:00:00Z');
  const afagi = agi - ss; const thr = mfj ? 75000 : 50000;
  const ageDed = pre1939 ? 12000 : age65 ? Math.max(0, 12000 - Math.max(0, afagi - thr)) : 0;
  const vagi = agi - ageDed - ss;
  const below = vagi < (mfj ? 23900 : 11950);
  let std = mfj ? 17000 : 8500; if (m.claimable) std = Math.min(std, m.wages);
  const ex = 930 * (1 + (mfj ? 1 : 0) + m.deps) + 800 * ((age65 ? 1 : 0) + (m.blind ? 1 : 0));
  const ti = Math.max(0, vagi - std - ex);
  const sched = ti <= 3000 ? 0.02 * ti : ti <= 5000 ? 60 + 0.03 * (ti - 3000) : ti <= 17000 ? 120 + 0.05 * (ti - 5000) : 720 + 0.0575 * (ti - 17000);
  const tax = below ? 0 : Math.round(sched);
  return { ageDed, vagi, below, std, ex, ti, tax };
}
(async () => {
  const browser = await chromium.launch(); const page = await browser.newPage({ viewport: { width: 1280, height: 1000 } });
  let fails = 0;
  for (const name of Object.keys(meta)) {
    const m = meta[name];
    await page.goto(BASE + '/', { waitUntil: 'load' }); await page.waitForTimeout(800);
    await page.getByRole('button', { name: 'Scenario' }).first().click(); await page.waitForTimeout(300);
    await page.locator('taxpert-scenario-modal textarea').first().fill(fs.readFileSync(`${C}/${name}.json`, 'utf8'));
    await page.click('#load-fact-graph-btn'); await page.waitForTimeout(1800);
    await page.goto(BASE + '/your-taxes/virginia/virginia-summary/', { waitUntil: 'load' }); await page.waitForTimeout(1800);
    if (m.state !== 'va') {
      let away = true; try { await page.waitForURL(u => !u.toString().includes('/virginia/'), { timeout: 6000 }); } catch { away = false; }
      const landed = page.url().replace(BASE, '');
      console.log(`${away ? 'PASS' : 'FAIL'} ${name}: non-resident loading the Virginia URL was sent to ${landed}`); if (!away) fails++; continue;
    }
    const v = {}; for (const s of await page.locator('main fg-show').evaluateAll(els => els.map(e => [e.getAttribute('path'), (e.textContent||'').trim()]))) v[s[0]] = s[1];
    const agi = money(v['/vaFederalAdjustedGrossIncome']), ss = money(v['/vaTaxableSocialSecurityBenefits']);
    const o = oracle(m, agi, ss);
    const got = { ageDed: money(v['/vaAgeDeduction']), vagi: money(v['/vaAdjustedGrossIncome']), std: money(v['/vaStandardDeduction']), ex: money(v['/vaExemptions']), ti: money(v['/vaTaxableIncome']), tax: money(v['/vaTax']) };
    const belowShown = await page.locator('main .df-screen[condition="/vaIsBelowFilingThreshold"]').evaluateAll(els => els.some(e => e.offsetParent !== null));
    const diffs = Object.keys(got).filter(k => got[k] !== o[k]).map(k => `${k}: got ${got[k]} expected ${o[k]}`);
    if (belowShown !== o.below) diffs.push(`threshold notice shown=${belowShown} expected ${o.below}`);
    const ok = diffs.length === 0; if (!ok) fails++;
    console.log(`${ok ? 'PASS' : 'FAIL'} ${name}: agi ${agi} ss ${ss} → ageDed ${got.ageDed} vagi ${got.vagi} std ${got.std} ex ${got.ex} ti ${got.ti} tax ${got.tax}${o.below ? ' (below threshold)' : ''}${ok ? '' : '\n      ' + diffs.join('; ')}`);
  }
  console.log(fails ? `\n${fails} FAILED` : '\nall cases pass');
  await browser.close(); process.exit(fails ? 1 : 0);
})().catch(e => { console.error('FAILED', e.message.slice(0,300)); process.exit(1); });
