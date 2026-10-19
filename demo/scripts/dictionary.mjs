// The fact dictionary: a port of the repository's readRawFacts.ts and processFactsToDigestWrapper.ts, same logic.
import fs from 'fs';
import path from 'path';
import { XMLParser, XMLValidator } from 'fast-xml-parser';
import { BUILD, XML_DIR } from './paths.mjs';

const PARSER = { ignoreAttributes: false, attributeNamePrefix: '@', ignoreDeclaration: true, trimValues: true, parseAttributeValue: false };

const raw = [];
for (const file of fs.readdirSync(XML_DIR).filter((f) => f.endsWith('.xml'))) {
  const xml = fs.readFileSync(path.join(XML_DIR, file), 'utf-8');
  if (XMLValidator.validate(xml, { allowBooleanAttributes: true }) !== true) throw new Error(`invalid XML in ${file}`);
  const parsed = new XMLParser(PARSER).parse(xml);
  for (const fact of [].concat(parsed.FactDictionaryModule.Facts.Fact)) raw.push({ ...fact, srcFile: file });
}

function processOptions(node) {
  const out = {};
  for (const key of Object.keys(node).filter((k) => k.startsWith('@') || k === '#text')) out[key.startsWith('@') ? key.slice(1) : 'value'] = node[key];
  return out;
}
function processLimits(rawLimits) {
  if (rawLimits === undefined) return [];
  return [].concat(rawLimits).map((node) => {
    const typeName = Object.keys(node).filter((n) => !n.startsWith('@'))[0];
    const options = typeName === 'Dependency' ? { path: String(node.Dependency['@path']) } : { value: String(node[typeName]) };
    return { operation: node['@type'], level: 'Error', node: { typeName, options, children: [] } };
  });
}
function processWritable(w) {
  const typeName = Object.keys(w)[0];
  const options = processOptions(w[typeName]);
  const isItem = typeName === 'CollectionItem';
  return { typeName, options: isItem ? {} : options, collectionItemAlias: isItem ? options.collection : null, limits: processLimits(w.Limit) };
}
function processDerived(rawNode) {
  const inner = (node, typeName) => {
    if (Array.isArray(node)) return node.map((n) => inner(n, typeName));
    if (typeof node === 'object') {
      const hasValueChild = typeof node[typeName] !== 'object';
      const options = hasValueChild && node[typeName] ? { value: String(node[typeName]) } : processOptions(node);
      const children = Object.keys(node).filter((k) => !k.startsWith('@') && !k.startsWith('#')).flatMap((k) => inner(node[k], k));
      return { typeName, options, children };
    }
    return { typeName, options: { value: String(node) }, children: [] };
  };
  const typeName = Object.keys(rawNode)[0];
  return inner(rawNode[typeName], typeName);
}

const wrapped = raw.map((f) => ({
  path: f['@path'],
  writable: f.Writable ? processWritable(f.Writable) : null,
  derived: f.Derived ? processDerived(f.Derived) : null,
  placeholder: f.Placeholder ? processDerived(f.Placeholder) : null,
}));
const meta = raw.map((f) => ({
  path: f['@path'],
  name: f.Name || null,
  description: typeof f.Description === 'string' ? f.Description.replace(/\s+/g, ' ').trim() : null,
  module: f.srcFile.replace('.xml', ''),
}));

fs.mkdirSync(BUILD, { recursive: true });
fs.writeFileSync(path.join(BUILD, 'wrappedFacts.json'), JSON.stringify(wrapped));
fs.writeFileSync(path.join(BUILD, 'factMeta.json'), JSON.stringify(meta));
console.log(`dictionary: ${wrapped.length} facts`);
