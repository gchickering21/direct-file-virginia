// The page's data: rules with their source XML, the interview tree, Direct File's wording, and test returns.
import fs from 'fs';
import path from 'path';
import YAML from 'yaml';
import { createRequire } from 'module';
import { BUILD, LOCALE, SCENARIOS, SITE, XML_DIR } from './paths.mjs';

const require = createRequire(import.meta.url);
const OUT = SITE + '/';

// ---- copy (en.yaml) ----
const en = YAML.parse(fs.readFileSync(LOCALE, 'utf8'));
const lookup = (key) => {
  // keys look like "headings./heading/x" or "fields./a/*/b.name"; segments after the top level may contain dots only as separators
  const top = key.split('.')[0];
  let rest = key.slice(top.length + 1);
  let node = en[top];
  while (node && rest) {
    if (typeof node !== 'object') return undefined;
    // longest matching child key
    const k = Object.keys(node).filter((c) => rest === c || rest.startsWith(c + '.')).sort((a, b) => b.length - a.length)[0];
    if (k === undefined) return undefined;
    node = node[k]; rest = rest === k ? '' : rest.slice(k.length + 1);
  }
  return rest ? undefined : node;
};
const resolveT = (s, depth = 0) => typeof s !== 'string' || depth > 5 ? s : s.replace(/\$t\(([^)]+)\)/g, (m, k) => { const v = lookup(k); return typeof v === 'string' ? resolveT(v, depth + 1) : ''; });
const copy = {};
const clean = (s) => resolveT(String(s)).replace(/\s+/g, ' ').trim();
// A heading or label is plain text, or an object whose visible text sits in helpText (when it carries a help link).
const textOf = (v) => {
  if (typeof v === 'string') return clean(v);
  if (v && typeof v === 'object') {
    const t = v.helpText?.modals?.text ?? v.helpText?.hint?.text ?? v.text;
    if (typeof t === 'string') return clean(t);
  }
  return null;
};
// Explanatory text: a body of paragraphs and lists. Each block is a paragraph string or an array of list items.
const blocksOf = (v) => {
  if (typeof v === 'string') return [clean(v)];
  if (!v || typeof v !== 'object') return null;
  const out = [];
  const walk = (b) => {
    if (typeof b === 'string') out.push(clean(b));
    else if (Array.isArray(b)) b.forEach(walk);
    else if (b && typeof b === 'object') {
      if (b.p) out.push(clean(b.p));
      for (const list of [b.ul, b.ol]) if (Array.isArray(list)) out.push(list.map((li) => clean(typeof li === 'string' ? li : li.li ?? '')).filter(Boolean));
    }
  };
  walk(v.body ?? []);
  if (!out.length) { const t = textOf(v); if (t) out.push(t); }
  // A lead-in like "This amount is based on:" introduces a list the app assembles at run time; alone it reads as broken.
  while (out.length && typeof out[out.length - 1] === 'string' && out[out.length - 1].endsWith(':')) out.pop();
  return out.length ? out : null;
};
const want = (key) => { if (key in copy) return copy[key] !== null; copy[key] = textOf(lookup(key)); return copy[key] !== null; };
const wantBlocks = (key) => { if (key in copy) return copy[key] !== null; copy[key] = blocksOf(lookup(key)); return copy[key] !== null; };

// ---- facts: definitions, dependencies, verbatim XML ----
const wrapped = JSON.parse(fs.readFileSync(path.join(BUILD, 'wrappedFacts.json'), 'utf8'));
const meta = JSON.parse(fs.readFileSync(path.join(BUILD, 'factMeta.json'), 'utf8'));
const xmlByPath = {};
for (const f of fs.readdirSync(XML_DIR).filter((f) => f.endsWith('.xml'))) {
  const x = fs.readFileSync(path.join(XML_DIR, f), 'utf8');
  for (const m of x.matchAll(/^([ \t]*)<Fact path="([^"]+)"[\s\S]*?^\1<\/Fact>/gm)) xmlByPath[m[2]] = m[0].replace(new RegExp('^' + m[1], 'gm'), '');
}
const resolveRel = (base, rel) => {
  if (!rel.startsWith('..')) return rel;
  const parts = base.split('/'); parts.pop();
  for (const seg of rel.split('/')) { if (seg === '..') parts.pop(); else parts.push(seg); }
  return parts.join('/');
};
const depsOf = (fact) => {
  const out = new Set();
  const walk = (n) => { if (!n) return; if (n.typeName === 'Dependency' && n.options.path) out.add(resolveRel(fact.path, n.options.path)); (n.children || []).forEach(walk); };
  walk(fact.derived); walk(fact.placeholder);
  return [...out];
};
const enumOptions = {};
const byPath = Object.fromEntries(wrapped.map((f) => [f.path, f]));
for (const f of wrapped) {
  if (f.writable && (f.writable.typeName === 'Enum' || f.writable.typeName === 'MultiEnum')) {
    const op = f.writable.options.optionsPath;
    const of = byPath[op];
    const vals = new Set();
    const walk = (n) => { if (!n) return; if (n.typeName === 'String' && n.options.value) vals.add(n.options.value); (n.children || []).forEach(walk); };
    if (of) walk(of.derived);
    enumOptions[f.path] = { optionsPath: op, values: [...vals] };
  }
}
const facts = meta.map((m) => {
  const w = byPath[m.path];
  const o = { p: m.path, n: m.name, d: m.description, m: m.module, t: w.writable ? w.writable.typeName : null, deps: depsOf(w), x: xmlByPath[m.path] || null }; if (enumOptions[m.path]) o.eo = enumOptions[m.path]; return o;
});
const missingXml = facts.filter((f) => !f.x).length;

// ---- flow (the interview) ----
const root = require(path.join(BUILD, 'flow.cjs')).default;
const STRUCT = new Set(['Flow', 'Category', 'Subcategory', 'SubSubcategory', 'Gate', 'CollectionLoop', 'Screen']);
const FIELD = new Set(['Boolean', 'Dollar', 'Enum', 'MultiEnum', 'LimitingString', 'GenericString', 'DatePicker', 'Tin', 'Address', 'PhoneNumber', 'Pin', 'IpPin', 'Ein', 'BankAccount', 'CollectionItemReference', 'FactSelect']);
const conds = (p) => [].concat(p.condition !== undefined ? [p.condition] : [], p.conditions || []);
let screens = 0, gates = 0;
const conv = (n, catRoute, subRoute) => {
  if (!n || typeof n !== 'object') return null;
  const t = n.t.replace(/\d+$/, '');
  const p = n.p;
  if (t === 'Screen') {
    screens++;
    const items = [];
    let ko = !!p.isKnockout;
    const walk = (c) => {
      if (!c || typeof c !== 'object') return;
      const ct = c.t.replace(/\d+$/, '');
      const cp = c.p;
      if (cp.displayOnlyOn === 'edit' || cp.displayOnlyOn === 'data-view') return;
      if (ct === 'Heading' || ct === 'Subheading') { const key = 'headings.' + cp.i18nKey; if (cp.i18nKey && want(key)) items.push({ k: ct === 'Heading' ? 'h' : 's', key, c: conds(cp) }); }
      else if ((ct === 'InfoDisplay' || ct === 'IntroContent') && typeof cp.i18nKey === 'string') { const key = 'info.' + cp.i18nKey; if (wantBlocks(key)) items.push({ k: 'i', key, c: conds(cp) }); }
      else if (ct === 'KnockoutButton') ko = true;
      else if (FIELD.has(ct)) {
        const suf = cp.i18nKeySuffixContext ? '.' + cp.i18nKeySuffixContext : '';
        const label = 'fields.' + cp.path + suf + '.name';
        want(label) || want('fields.' + cp.path + '.name');
        if (ct === 'Boolean') { want('fields.' + cp.path + suf + '.boolean.yes'); want('fields.' + cp.path + suf + '.boolean.no'); }
        if (ct === 'Enum' || ct === 'MultiEnum') { const eo = enumOptions[cp.path]; if (eo) for (const v of eo.values) { want('fields.' + cp.path + '.' + eo.optionsPath + suf + '.' + v); want('fields.' + eo.optionsPath + '.' + v); } }
        items.push({ k: 'f', ft: ct, path: cp.path, suf, c: conds(cp) });
      }
      (c.c || []).forEach(walk);
    };
    (n.c || []).forEach(walk);
    return { t: 'Screen', route: '/flow/' + catRoute + '/' + subRoute + '/' + p.route, c: conds(p), ko, items };
  }
  if (!STRUCT.has(t)) return null;
  const out = { t };
  if (t === 'Category') { catRoute = p.route; want('checklist./flow/' + p.route + '.heading'); out.route = p.route; }
  if (t === 'Subcategory') { subRoute = p.route; want('checklist./flow/' + catRoute + '/' + p.route + '.heading'); out.route = catRoute + '/' + p.route; if (p.collectionContext) out.ctx = p.collectionContext; if (p.displayOnlyIf) out.any = [].concat(p.displayOnlyIf); }
  if (t === 'SubSubcategory') { out.route = p.route; if (p.collectionContext) out.ctx = p.collectionContext; }
  if (t === 'Gate') { gates++; out.c = [p.condition]; }
  if (t === 'CollectionLoop') { out.coll = p.collection; out.loop = p.loopName; }
  out.kids = (n.c || []).map((c) => conv(c, catRoute, subRoute)).filter(Boolean);
  return out;
};
const flow = conv(root, '', '');

// ---- IRS test returns used as example taxpayers, in the order the page offers them ----
const PICK = [
  ['hoh-35k-2', 'Head of household', '1 child, $35k, New York'],
  ['single-43k-no-credits', 'Single', '$43k, Washington'],
  ['mfj-43k', 'Married', '2 children, $83k, California'],
  ['hoh-9300', 'Head of household', '$9k, Massachusetts'],
  ['mef-ats-balance-due', 'Single', '$101k, Florida, owes'],
  ['mfj-all-income-types-withholding', 'Married', 'every income type, California'],
];
const scenarios = PICK.map(([id, name, sub]) => ({ id, name, sub, facts: JSON.parse(fs.readFileSync(path.join(SCENARIOS, id + '.json'), 'utf8')).facts }));

// every enum option label, so a value like "headOfHousehold" reads as Direct File wrote it
for (const [k, v] of Object.entries(en.fields)) {
  if (!k.startsWith('/') || k.includes('*') || typeof v !== 'object' || v === null) continue;
  for (const [opt, label] of Object.entries(v)) if (typeof label === 'string' && opt !== 'name') copy['fields.' + k + '.' + opt] = resolveT(label).replace(/\s+/g, ' ').trim();
}
for (const k of Object.keys(copy)) if (copy[k] === null) delete copy[k];
fs.writeFileSync(OUT + 'dictionary.json', JSON.stringify(wrapped));
fs.writeFileSync(OUT + 'facts.json', JSON.stringify(facts));
fs.writeFileSync(OUT + 'flow.json', JSON.stringify(flow));
fs.writeFileSync(OUT + 'copy.json', JSON.stringify(copy));
fs.writeFileSync(OUT + 'returns.json', JSON.stringify(scenarios));
console.log({ facts: facts.length, missingXml, screens, gates, copy: Object.keys(copy).length, enums: Object.keys(enumOptions).length });
