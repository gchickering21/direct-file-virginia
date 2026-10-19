// The interview: compiles the repository's flow.tsx with stand-in components so its tree can be read as data.
import fs from 'fs';
import path from 'path';
import * as esbuild from 'esbuild';
import { BUILD, FLOW_ENTRY } from './paths.mjs';

const CHUNKS = path.join(path.dirname(FLOW_ENTRY), 'flow-chunks');
const sources = [FLOW_ENTRY, ...fs.readdirSync(CHUNKS, { recursive: true }).filter((f) => f.endsWith('.tsx')).map((f) => path.join(CHUNKS, f))]
  .map((f) => fs.readFileSync(f, 'utf8')).join('\n');
const componentNames = new Set();
for (const m of sources.matchAll(/import\s+\{([^}]*)\}\s+from\s+'[^']*(ContentDeclarations|flowDeclarations)\.js'/g)) {
  for (const n of m[1].split(',')) { const name = n.trim().split(/\s+as\s+/)[0]; if (name) componentNames.add(name); }
}

const stubs = {
  name: 'stand-ins',
  setup(b) {
    b.onResolve({ filter: /(flowDeclarations|ContentDeclarations|batches|Condition|Path|ConditionalList|SummaryTable)\.js$/ }, (a) => ({ path: a.path, namespace: 'stub' }));
    b.onLoad({ filter: /.*/, namespace: 'stub' }, (a) => {
      if (a.path.includes('batches')) return { contents: 'export const BATCH_NAME = new Proxy({}, { get: (t, k) => String(k) });', loader: 'js' };
      return { contents: [...componentNames].map((n) => `export const ${n} = function ${n}() {};`).join('\n'), loader: 'js' };
    });
  },
};

fs.mkdirSync(BUILD, { recursive: true });
await esbuild.build({
  entryPoints: [FLOW_ENTRY],
  bundle: true,
  format: 'cjs',
  platform: 'node',
  outfile: path.join(BUILD, 'flow.cjs'),
  tsconfigRaw: { compilerOptions: { jsx: 'react', jsxFactory: 'h', jsxFragmentFactory: 'Frag' } },
  banner: { js: 'const Frag = "Frag"; function h(t, p, ...c) { return { t: typeof t === "string" ? t : t.name, p: p || {}, c: c.flat(Infinity).filter((x) => x != null && x !== false && x !== true) }; }' },
  plugins: [stubs],
  logLevel: 'warning',
});
console.log(`flow: compiled with ${componentNames.size} stand-in components`);
