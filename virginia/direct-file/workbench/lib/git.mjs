// Publishing into git, when asked to: a commit of the written files (WORKBENCH_GIT_COMMIT=1), or a
// branch, a push and a pull request (WORKBENCH_GIT_PR=1).

import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { person } from './store.mjs'

export function gitCommit (c, files, by) {
  // Run in the directory of the files written, so a copy of the facts in its own repository commits
  // there, and files outside any repository are skipped rather than committed somewhere else.
  const git = (...args) => spawnSync('git', args, { cwd: path.dirname(files[0]), encoding: 'utf8' })
  const top = git('rev-parse', '--show-toplevel')
  if (top.error || top.status !== 0) return { skipped: 'not a git checkout, or git is not installed' }
  const inRepo = files.filter(f => !path.relative(top.stdout.trim(), f).startsWith('..'))
  if (!inRepo.length) return { skipped: 'the published files are outside the repository' }
  const add = git('add', '--', ...inRepo)
  if (add.status !== 0) return { error: add.stderr.trim() }
  const summary = String(c.summary || '').trim()
  const msg = [`workbench(virginia): ${c.title}`.slice(0, 120), ...(summary ? ['', summary] : []), '', `Published by ${by.name} (${by.role}); ${c.approvals.map(a => `${a.kind} approval by ${person(a.by)?.name || a.by}`).join(', ')}.`, '', `Workbench-Change: #${c.id}`]
  const commit = git('commit', '-q', '-m', msg.join('\n'), '--', ...inRepo)
  if (commit.status !== 0) return { error: (commit.stderr || commit.stdout).trim() }
  const hash = git('rev-parse', 'HEAD')
  return { hash: hash.stdout.trim() }
}

/**
 * Publish as a pull request: a branch named for the change, the written files committed on it, the
 * branch pushed, and `gh pr create` with the plain summary as the body. Returns to the branch the
 * checkout was on. Needs git, gh (signed in), and a remote.
 */
export function gitPullRequest (c, files, by) {
  const cwd = path.dirname(files[0])
  const git = (...args) => spawnSync('git', args, { cwd, encoding: 'utf8' })
  const top = git('rev-parse', '--show-toplevel')
  if (top.error || top.status !== 0) return { skipped: 'not a git checkout, or git is not installed' }
  const gh = spawnSync('gh', ['--version'], { encoding: 'utf8' })
  if (gh.error || gh.status !== 0) return { skipped: 'gh (the GitHub CLI) is not installed' }
  const inRepo = files.filter(f => !path.relative(top.stdout.trim(), f).startsWith('..'))
  if (!inRepo.length) return { skipped: 'the published files are outside the repository' }
  const was = git('rev-parse', '--abbrev-ref', 'HEAD').stdout.trim()
  const branch = `workbench/change-${c.id}`
  const mk = git('checkout', '-b', branch)
  if (mk.status !== 0) return { error: mk.stderr.trim() }
  try {
    git('add', '--', ...inRepo)
    const body = [c.summary || '', '', `Workbench change #${c.id}, proposed by ${person(c.author)?.name || c.author}.`, c.law?.citation ? `Law: ${c.law.citation}` : '', c.source?.effective ? `Effective: ${c.source.effective}` : '', '', 'Approvals: ' + c.approvals.map(a => `${a.kind} by ${person(a.by)?.name || a.by}`).join(', '), `Published by ${by.name} (${by.role}).`].filter((l, i, a) => l !== '' || a[i - 1] !== '').join('\n')
    const commit = git('commit', '-q', '-m', `workbench(virginia): ${c.title}`.slice(0, 120) + '\n\n' + body + `\n\nWorkbench-Change: #${c.id}`, '--', ...inRepo)
    if (commit.status !== 0) return { error: (commit.stderr || commit.stdout).trim() }
    const hash = git('rev-parse', 'HEAD').stdout.trim()
    const push = git('push', '-u', 'origin', branch)
    if (push.status !== 0) return { error: push.stderr.trim(), hash }
    const pr = spawnSync('gh', ['pr', 'create', '--title', `workbench(virginia): ${c.title}`.slice(0, 200), '--body', body, '--head', branch], { cwd, encoding: 'utf8' })
    if (pr.status !== 0) return { error: (pr.stderr || pr.stdout).trim(), hash }
    return { hash, branch, url: pr.stdout.trim().split('\n').pop() }
  } finally {
    if (was && was !== 'HEAD') git('checkout', was)
  }
}
