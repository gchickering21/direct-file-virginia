// Every location the build reads or writes, relative to this folder.
import path from 'path';
import { fileURLToPath } from 'url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const IRS = path.join(ROOT, '..', 'direct-file', 'direct-file');
export const CLIENT = path.join(IRS, 'df-client/df-client-app/src');
export const XML_DIR = path.join(CLIENT, 'fact-dictionary/generate-src/xml-src');
export const FLOW_ENTRY = path.join(CLIENT, 'flow/flow.tsx');
export const LOCALE = path.join(CLIENT, 'locales/en.yaml');
export const ENGINE = path.join(IRS, 'df-client/js-factgraph-scala/src/main.js');
export const SCENARIOS = path.join(IRS, 'backend/src/test/resources/scenarios');
export const BUILD = path.join(ROOT, 'build');
export const SITE = path.join(ROOT, 'site');
