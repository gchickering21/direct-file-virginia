// Loads each household from scripts/virginia-cases.py into the site (any build: the graph is seeded through
// sessionStorage the way the runtime stores it, so no Scenario toolbar is needed) and compares the Virginia summary lines with the independent model of the rules in
// scripts/lib/virginia-model.cjs (written from the Code of Virginia, not from the facts/virginia*.xml modules).
//   python3 scripts/virginia-cases.py /tmp/va-cases && CASES=/tmp/va-cases node scripts/virginia-cases.cjs
// PLAYWRIGHT_MODULE: path to another playwright or playwright-core, for a machine where the port's
// own Playwright has no browser build (macOS 13, for one).
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || '@playwright/test');
const { model } = require('./lib/virginia-model.cjs');
const fs = require('fs'); const C = process.env.CASES; const BASE = process.env.BASE_URL || 'http://localhost:3008/app/direct-file'; const meta = JSON.parse(fs.readFileSync(`${C}/meta.json`, 'utf8'));
const money = s => s ? Number(String(s).replace(/[$,]/g, '')) : NaN;
// The summary page's lines, by the fact each <fg-show> prints, against the model's names for them.
const SHOWN = { ageDed: '/vaAgeDeduction', adj: '/vaScheduleAdjSubtractions', vagi: '/vaAdjustedGrossIncome', std: '/vaStandardDeduction', ex: '/vaExemptions', savers: '/vaCommonwealthSaversDeduction', ti: '/vaTaxableIncome', tax: '/vaTax', credit: '/vaLowIncomeCredit', withheld: '/vaWithholding', useTax: '/vaUseTax', owe: '/vaTaxYouOwe', overpayment: '/vaOverpayment', amountOwed: '/vaAmountYouOwe', refund: '/vaRefund' };
(async () => {
  const browser = await chromium.launch();
  let fails = 0;
  for (const name of Object.keys(meta)) {
    const m = meta[name];
    // A fresh context per household: sessionStorage is the runtime's store, seeded before the first script runs.
    const context = await browser.newContext({ viewport: { width: 1280, height: 1000 } }); const page = await context.newPage();
    await page.addInitScript(gg => { if (!sessionStorage.getItem('direct-file:factGraph')) sessionStorage.setItem('direct-file:factGraph', gg); }, fs.readFileSync(`${C}/${name}.json`, 'utf8'));
    await page.goto(BASE + '/your-taxes/virginia/virginia-summary/', { waitUntil: 'load' }); await page.waitForTimeout(1800);
    if (m.state !== 'va') {
      let away = true; try { await page.waitForURL(u => !u.toString().includes('/virginia/'), { timeout: 6000 }); } catch { away = false; }
      const landed = page.url().replace(BASE, '');
      console.log(`${away ? 'PASS' : 'FAIL'} ${name}: non-resident loading the Virginia URL was sent to ${landed}`); if (!away) fails++; await context.close(); continue;
    }
    const v = {}; for (const s of await page.locator('main fg-show').evaluateAll(els => els.map(e => [e.getAttribute('path'), (e.textContent||'').trim()]))) v[s[0]] = s[1];
    // the three federal figures the model takes from the page, like AGI on Form 760 Line 1
    const agi = money(v['/vaFederalAdjustedGrossIncome']), ss = money(v['/vaTaxableSocialSecurityBenefits']), fedEitc = money(v['/vaFederalEarnedIncomeCredit']);
    const o = model({ ...m, agi, ss, fedEitc });
    const got = {}; for (const k of Object.keys(SHOWN)) got[k] = money(v[SHOWN[k]]);
    const belowShown = await page.locator('main .df-screen[condition="/vaIsBelowFilingThreshold"]').evaluateAll(els => els.some(e => e.offsetParent !== null));
    const diffs = Object.keys(got).filter(k => got[k] !== o[k]).map(k => `${k}: got ${got[k]} expected ${o[k]}`);
    if (belowShown !== o.below) diffs.push(`threshold notice shown=${belowShown} expected ${o.below}`);
    const ok = diffs.length === 0; if (!ok) fails++;
    console.log(`${ok ? 'PASS' : 'FAIL'} ${name}: agi ${agi} ss ${ss} eitc ${fedEitc} → ageDed ${got.ageDed} adj ${got.adj} vagi ${got.vagi} std ${got.std} ex ${got.ex} savers ${got.savers} ti ${got.ti} tax ${got.tax} credit ${got.credit} withheld ${got.withheld} useTax ${got.useTax} owe ${got.amountOwed} refund ${got.refund}${o.below ? ' (below threshold)' : ''}${ok ? '' : '\n      ' + diffs.join('; ')}`);
    await context.close();
  }
  console.log(fails ? `\n${fails} FAILED` : '\nall cases pass');
  await browser.close(); process.exit(fails ? 1 : 0);
})().catch(e => { console.error('FAILED', e.message.slice(0,300)); process.exit(1); });
