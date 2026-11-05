#!/usr/bin/env node
// The Rules Workbench server: static files, the API, and the review workflow (lib/workflow.mjs),
// reading the fact files fresh on every request. No dependencies beyond Node 18.
//
//   node workbench/server.mjs            → http://localhost:3011
//
// There is no sign-in: the person is picked in the page and sent with each action. The server
// listens on 127.0.0.1 only and refuses writes that do not come from its own page (Host, Origin
// and an X-Workbench header). This is a prototype for working out the workflow, not something to
// put on a network.

import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import { proposeParts } from './lib/law.mjs'
import { DATA_DIR, ENGINE, EXAMPLES_FILE, FACTS_DIR, FACT_FILES, FILES, FLOW_SCHEMA, SCHEMA, WORKBENCH, readSources, shown, siteYear } from './lib/node.mjs'
import { MODEL_FILE, oracleAvailable } from './lib/oracle.mjs'
import { coverage } from './lib/reports.mjs'
import { HttpError, audit, load } from './lib/store.mjs'
import { ValidationError, checkChangeFields, haveXmllint } from './lib/validate.mjs'
import { GIT_COMMIT, GIT_PR, act, actRequest, actor, createChange, createRequest, overlapping, reports, requiredApprovals, state, updateChange, verify } from './lib/workflow.mjs'
import { lineDiff } from './lib/xml-edit.js'

const PORT = Number(process.env.PORT || 3011)
const HOST = process.env.HOST || '127.0.0.1'

// ---------------------------------------------------------------------------------------------
// HTTP

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.svg': 'image/svg+xml' }

function sendFile (res, file) {
  if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404).end('Not found'); return }
  res.writeHead(200, { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream', 'cache-control': 'no-cache' })
  fs.createReadStream(file).pipe(res)
}

function staticFile (res, root, rel) {
  const file = path.resolve(root, '.' + path.posix.normalize('/' + rel))
  if (!file.startsWith(root + path.sep)) { res.writeHead(403).end(); return }
  sendFile(res, file)
}

async function readBody (req) {
  let s = ''
  for await (const chunk of req) { s += chunk; if (s.length > 5e6) throw new HttpError(413, 'Too large') }
  try { return s ? JSON.parse(s) : {} } catch { throw new HttpError(400, 'The request is not JSON.') }
}

// A write must come from this server's own page: the browser sends Host and (cross-site) Origin on
// its own, and the page adds X-Workbench, which a form on another site cannot. That shuts out a
// cross-site request to localhost while the workbench is open.
const SELF = new Set([`localhost:${PORT}`, `127.0.0.1:${PORT}`, `[::1]:${PORT}`])
function checkWrite (req) {
  if (!SELF.has(String(req.headers.host || '').toLowerCase())) throw new HttpError(403, `Writes are accepted only at http://localhost:${PORT}.`)
  if (req.headers.origin) {
    let o
    try { o = new URL(req.headers.origin) } catch { throw new HttpError(403, 'Bad Origin.') }
    if (o.protocol !== 'http:' || !SELF.has(o.host.toLowerCase())) throw new HttpError(403, 'Writes are accepted only from the workbench page.')
  }
  if (req.headers['x-workbench'] !== '1') throw new HttpError(403, 'Missing the X-Workbench header: writes are accepted only from the workbench page.')
  if (!/^application\/json\b/.test(String(req.headers['content-type'] || ''))) throw new HttpError(415, 'Send JSON.')
}

const json = (res, status, obj) => { res.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store' }); res.end(JSON.stringify(obj)) }

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x')
  const p = url.pathname
  try {
    if (req.method === 'GET') {
      if (p === '/' || p === '/index.html') return sendFile(res, path.join(WORKBENCH, 'ui/index.html'))
      if (p === '/engine.js') return sendFile(res, ENGINE)
      if (p === '/favicon.ico') { res.writeHead(204).end(); return }
      if (p.startsWith('/ui/')) return staticFile(res, path.join(WORKBENCH, 'ui'), p.slice(4))
      if (p.startsWith('/lib/') && p.endsWith('.js')) return staticFile(res, path.join(WORKBENCH, 'lib'), p.slice(5))
      if (p === '/api/state') return json(res, 200, state())
      let m
      if ((m = p.match(/^\/api\/reports\/(coverage|exports|spanish|audit)$/))) return json(res, 200, reports(m[1]))
      if ((m = p.match(/^\/api\/changes\/(\d+)\/verify$/))) {
        const c = load('changes', m[1])
        if (!c) throw new HttpError(404, 'No such change.')
        const v = await verify(c)
        const src = v.src || readSources()
        return json(res, 200, {
          ok: v.ok, conflict: v.conflict, error: v.error, failing: v.failing, blocked: v.blocked, count: v.count, oracle: v.oracle,
          translations: v.translations || [], untranslated: v.untranslated || [], required: v.required || requiredApprovals(c), season: v.season || { siteYear: siteYear(), effectiveYear: c.law?.effectiveYear || null },
          flowSchema: haveXmllint() && FLOW_SCHEMA ? shown(FLOW_SCHEMA) : null,
          overlaps: c.status === 'draft' ? overlapping(c).map(o => ({ id: o.id, status: o.status, title: o.title })) : [],
          schema: haveXmllint() ? (SCHEMA ? shown(SCHEMA) : null) : null,
          diffs: v.files ? Object.fromEntries([...Object.keys(v.files.facts).filter(k => v.files.facts[k] !== src.facts[k]).map(k => [k, lineDiff(src.facts[k], v.files.facts[k])]), ...['flow', 'es'].filter(k => v.files[k] !== undefined && src[k] !== undefined && v.files[k] !== src[k]).map(k => [k, lineDiff(src[k], v.files[k])])]) : null,
        })
      }
    }
    if (req.method === 'POST' || req.method === 'PUT') {
      checkWrite(req)
      const body = await readBody(req)
      if (p === '/api/changes' && req.method === 'POST') return json(res, 201, createChange(body))
      if (p === '/api/propose' && req.method === 'POST') { actor(body); const src = readSources(); const law = checkChangeFields({ law: body.law || {} }, { literalTag: () => null }).law; return json(res, 200, proposeParts(law, src, law.effectiveYear || siteYear())) }
      let m
      if ((m = p.match(/^\/api\/changes\/(\d+)$/)) && req.method === 'PUT') return json(res, 200, updateChange(m[1], body))
      if ((m = p.match(/^\/api\/changes\/(\d+)\/action$/))) return json(res, 200, await act(m[1], body))
      if (p === '/api/requests' && req.method === 'POST') return json(res, 201, createRequest(body))
      if ((m = p.match(/^\/api\/requests\/(\d+)\/action$/))) return json(res, 200, actRequest(m[1], body))
    }
    res.writeHead(404).end('Not found')
  } catch (e) {
    if (e instanceof HttpError) return json(res, e.status, { error: e.message, ...e.extra })
    if (e instanceof ValidationError) return json(res, 400, { error: e.message })
    console.error(e)
    json(res, 500, { error: String(e.message || e) })
  }
})

server.listen(PORT, HOST, () => {
  console.log(`Rules Workbench: http://localhost:${PORT}`)
  console.log(`  rules     ${Object.keys(FACT_FILES).length} Virginia modules in ${shown(FACTS_DIR)}`)
  console.log(`  examples  ${shown(EXAMPLES_FILE)}`)
  console.log(`  data      ${shown(DATA_DIR)}`)
  console.log(`  schema    ${haveXmllint() && SCHEMA ? shown(SCHEMA) + ' (xmllint)' : 'not checked: xmllint is not installed'}`)
  console.log(`  oracle    ${oracleAvailable() ? shown(MODEL_FILE) : 'none (' + shown(MODEL_FILE) + ' is not there)'}`)
  console.log(`  screens   ${fs.existsSync(FILES.flow) ? shown(FILES.flow) + ' and ' + shown(FILES.es) : 'not beside the rules: questions and words cannot be edited'}`)
  console.log(`  season    tax year ${siteYear()} (constants.xml /taxYear)`)
  console.log(`  git       ${GIT_PR ? 'each publish opens a pull request (WORKBENCH_GIT_PR=1)' : GIT_COMMIT ? 'each publish is committed (WORKBENCH_GIT_COMMIT=1)' : 'publishes are not committed (set WORKBENCH_GIT_COMMIT=1, or WORKBENCH_GIT_PR=1 for a pull request)'}`)
})
