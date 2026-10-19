// Loads the built page in jsdom with the real data and checks it against what the IRS's test returns should produce.
const { JSDOM, VirtualConsole } = require('jsdom');
const fs = require('fs');
const path = require('path');
const assert = require('assert');

const SITE = path.join(__dirname, '..', 'site');
const html = fs.readFileSync(path.join(SITE, 'index.html'), 'utf8');
const errors = [];
const vc = new VirtualConsole();
vc.on('jsdomError', (e) => errors.push(e.message));
vc.on('error', (e) => errors.push(String(e)));
const dom = new JSDOM(`<!doctype html><html><head></head><body>${html.replace(/<script src="[^"]+"><\/script>/g, '')}</body></html>`, { runScripts: 'outside-only', virtualConsole: vc, pretendToBeVisual: true });
const w = dom.window;
w.fetch = async (f) => ({ ok: true, json: async () => JSON.parse(fs.readFileSync(path.join(SITE, f), 'utf8')) });
w.matchMedia = () => ({ matches: false });
w.HTMLElement.prototype.scrollIntoView = () => {};
for (const f of html.match(/<script src="([^"]+)">/g).map((t) => t.slice(13, -2))) w.eval(fs.readFileSync(path.join(SITE, f), 'utf8'));

const doc = w.document;
const $ = (s) => doc.querySelector(s);
const text = (s) => ($(s) ? $(s).textContent.replace(/\s+/g, ' ').trim() : '');
const until = async (ok, ms = 30000) => { const t = Date.now(); while (!ok()) { if (Date.now() - t > ms) throw new Error('timed out'); await new Promise((r) => setTimeout(r, 50)); } };
const chip = (id) => doc.querySelector(`.chip[data-ret="${id}"]`);
const toEnd = () => { let n = 0; while (!$('#next').disabled && n < 400) { $('#next').click(); n++; } return n; };
const stepTo = (pick) => { let n = 0; while (!pick() && n++ < 400) $('#next').click(); const el = pick(); assert.ok(el, 'no screen matched'); return el; };
const fire = (el, type) => el.dispatchEvent(new w.Event(type));

// Results of the IRS's own engine on these test files, as the repository's scenarios compute them.
const EXPECTED = {
  'hoh-35k-2': 'Refund · Head of household $3,734',
  'single-43k-no-credits': 'Amount owed · Single $727',
  'mfj-43k': 'Refund · Married filing jointly $4,505',
  'hoh-9300': 'Refund · Head of household $5,391',
  'mef-ats-balance-due': 'Amount owed · Single $11,667',
  'mfj-all-income-types-withholding': 'Amount owed · Married filing jointly $1,652',
};

(async () => {
  await until(() => doc.querySelectorAll('.chip').length > 0);
  assert.strictEqual(doc.querySelectorAll('.chip').length, Object.keys(EXPECTED).length);

  for (const [id, expected] of Object.entries(EXPECTED)) {
    chip(id).click();
    assert.strictEqual(text('.result'), expected.replace(' $', '$'), id);
    let quiet = 0;
    let n = 0;
    while (!$('#next').disabled && n < 400) { if ($('#screen h2.quiet')) quiet++; $('#next').click(); n++; }
    assert.match(text('#pos'), /Proposed screen 2 of 2/);
    console.log(`${id}: ${n - 1} screens, ${quiet} without a heading, ${text('.result')}`);
  }

  // A dollar answer recalculates the 1040 and changes which screens follow.
  chip('hoh-35k-2').click();
  const wages = stepTo(() => $('#screen input[inputmode=decimal]'));
  wages.value = '52000';
  fire(wages, 'change');
  assert.match(text('#status'), /lines of the 1040 now differ/);
  assert.match(text('#status'), /screens added/);
  assert.strictEqual(text('.result'), 'Amount owed · Head of household$484');
  assert.ok($('.line .was'), 'old values not shown');
  console.log('dollar edit:', text('#status'));

  // Undo restores the test return.
  $('#reset').click();
  assert.strictEqual(text('.result'), 'Refund · Head of household$3,734');

  // A knockout answer ends the interview at Direct File's knockout screen.
  const supported = stepTo(() => [...doc.querySelectorAll('#screen .rulelink')].some((b) => b.dataset.fact === '/incomeSourcesSupported') && $('#screen input[value=false]'));
  supported.checked = true;
  fire(supported, 'change');
  assert.match(text('#status'), /knocks the return out/);
  toEnd();
  $('#back').click(); $('#back').click();
  assert.ok($('#screen .tag.ko'), 'last real screen is not the knockout');
  console.log('knockout:', text('#pos'), '|', text('#screen h2'));

  // Choices come from the rules: this household is offered two filing statuses, not five.
  chip('hoh-35k-2').click();
  const fsSelect = stepTo(() => [...doc.querySelectorAll('#screen .rulelink')].some((b) => b.dataset.fact === '/filingStatus') && $('#screen select'));
  assert.deepStrictEqual([...fsSelect.options].map((o) => o.value), ['single', 'headOfHousehold']);

  // Explanatory text from Direct File's wording appears under headings.
  chip('hoh-35k-2').click();
  stepTo(() => $('#screen p.info, #screen ul.info'));

  // The rule explorer: source XML, dependencies, search.
  stepTo(() => $('#screen .rulelink')).click();
  assert.ok(text('pre.xml').startsWith('<Fact'), 'rule XML missing');
  const q = $('#q');
  q.value = 'earned income';
  fire(q, 'input');
  assert.ok(doc.querySelectorAll('#results button').length > 0, 'search found nothing');
  doc.querySelector('#results button').click();
  assert.ok(text('.fact-h .path').length > 0);

  // Jump to a section.
  const jump = $('#jump');
  jump.value = jump.options[jump.options.length - 1].value;
  fire(jump, 'change');
  assert.match(text('#screen .crumbs'), /Complete/);

  for (const t of ['data', 'about', 'return']) $('#tab-' + t).click();
  assert.deepStrictEqual(errors, []);
  console.log('smoke test passed');
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
