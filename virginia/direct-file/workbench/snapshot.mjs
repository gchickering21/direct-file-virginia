#!/usr/bin/env node
// The read-only copy of the Workbench, as files: the page, its scripts, the engine, and every answer
// the server would give to a GET, written once so a static host can serve them (docs/hosting.md).
//
//   node workbench/snapshot.mjs <target directory>       e.g. out/app/direct-file/workbench
//
// What is in it: the rules as they are on disk, the worked examples, the four reports, every change
// and request in data/ with its verify report, and the people. What is not: a way to write. The
// page it writes sets window.WB_STATIC, and ui/state.js then reads from these files and refuses
// every save, so the same scripts serve both the live server and this copy.

import { execSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { ENGINE, WORKBENCH } from './lib/node.mjs'
import { list } from './lib/store.mjs'
import { reports, state, verifyReport } from './lib/workflow.mjs'

const target = process.argv[2]
if (!target) { console.error('usage: node workbench/snapshot.mjs <target directory>'); process.exit(2) }
const out = path.resolve(target)
const write = (rel, data) => { const f = path.join(out, rel); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, typeof data === 'string' ? data : JSON.stringify(data)) }
const git = cmd => { try { return execSync(`git ${cmd}`, { cwd: WORKBENCH, stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim() } catch { return null } }

fs.rmSync(out, { recursive: true, force: true })
fs.mkdirSync(out, { recursive: true })

// The page and its scripts. lib/*.js are the browser-side libraries the page imports; the .mjs
// files beside them are Node only and never asked for.
fs.cpSync(path.join(WORKBENCH, 'ui'), path.join(out, 'ui'), { recursive: true })
fs.mkdirSync(path.join(out, 'lib'))
for (const f of fs.readdirSync(path.join(WORKBENCH, 'lib')).filter(f => f.endsWith('.js'))) fs.copyFileSync(path.join(WORKBENCH, 'lib', f), path.join(out, 'lib', f))
fs.copyFileSync(ENGINE, path.join(out, 'engine.js'))

const built = { commit: git('rev-parse --short HEAD'), built: new Date().toISOString().slice(0, 10), dirty: !!git('status --porcelain --untracked-files=no') }
const page = fs.readFileSync(path.join(WORKBENCH, 'ui/index.html'), 'utf8')
const marker = '<script type="module" src="ui/app.js"></script>'
if (!page.includes(marker)) throw new Error('ui/index.html does not load ui/app.js the way snapshot.mjs expects')
write('index.html', page.replace(marker, `<script>window.WB_STATIC = ${JSON.stringify(built)}</script>\n${marker}`))

// Every GET the page makes, as the file ui/state.js maps it to.
write('api/state.json', state())
for (const name of ['coverage', 'exports', 'spanish', 'audit']) {
  try { write(`api/reports/${name}.json`, reports(name)) } catch (e) { write(`api/reports/${name}.json`, { error: e.message }) }
}
const changes = list('changes')
for (const c of changes) {
  try { write(`api/changes/${c.id}/verify.json`, await verifyReport(c)) } catch (e) { write(`api/changes/${c.id}/verify.json`, { error: e.message }) }
}

const n = dir => fs.readdirSync(dir, { recursive: true }).filter(f => fs.statSync(path.join(dir, f)).isFile()).length
const where = path.relative(process.cwd(), out)
console.log(`read-only workbench: ${where.startsWith('..') ? out : where}/ (${n(out)} files; ${changes.length} change${changes.length === 1 ? '' : 's'}; built from ${built.commit}${built.dirty ? ' with uncommitted changes' : ''})`)
