// The engine: the repository's prebuilt Scala.js Fact Graph, wrapped for a browser <script> and minified.
import fs from 'fs';
import path from 'path';
import * as esbuild from 'esbuild';
import { BUILD, ENGINE, SITE } from './paths.mjs';

fs.mkdirSync(BUILD, { recursive: true });
const wrapped = path.join(BUILD, 'engine.src.js');
fs.writeFileSync(wrapped, `globalThis.DFFactGraph = {};\n(function (exports) {\n${fs.readFileSync(ENGINE, 'utf8')}\n}).call(globalThis, globalThis.DFFactGraph);\n`);
await esbuild.build({ entryPoints: [wrapped], minify: true, outfile: path.join(SITE, 'engine.js'), logLevel: 'error' });
console.log(`engine: ${(fs.statSync(path.join(SITE, 'engine.js')).size / 1e6).toFixed(1)} MB`);
