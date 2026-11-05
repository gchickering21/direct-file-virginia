# Hosting the demo site, for free

The built site is a folder of HTML, JavaScript and data. There is no server: the rules engine
runs in the browser, and the filer's answers live in that browser's session storage. So any
static host serves it, and the free tiers of all of them are more than enough for a class
project. Nothing here costs money.

```bash
make publish        # build the site under the hosted prefix, push it to the gh-pages branch
```

The first time, one setting on GitHub turns the branch into a site. After that, `make publish`
again whenever the site should change; it is a snapshot, not a live build.

## The recommended way: GitHub Pages, from this repository

The site lives beside the code, on the same account, with nothing new to sign up for.

1. **Build and push:** `make publish`. It needs the native toolchain (`GETTING_STARTED.md`
   section 3), because sbt generates the site; a few minutes. It builds with the route prefix
   in `stack/site.env`, copies the result into a fresh single-commit branch called `gh-pages`
   with a root redirect to the start page, and force-pushes it. The source history is untouched.
2. **Turn Pages on, once:** on GitHub, Settings, Pages, "Build and deployment", Source: *Deploy
   from a branch*, Branch: `gh-pages`, folder `/ (root)`, Save.
3. **Wait a minute,** then open the address in `stack/site.env`:
   https://gchickering21.github.io/direct-file-virginia/app/direct-file/resources/start/.
   The repository's root address redirects there too.
4. **The README's "See it" link is that address.** Change it there too if the repository is renamed.

Two things to know:

- **GitHub Pages is free for a public repository.** For a private one it needs GitHub Pro,
  which the GitHub Student Developer Pack gives students free (education.github.com/pack), or
  Team. The code is CC0 and written to be shared, so making the repository public is the plain
  answer; the Student Pack is the other. A third: keep the source private and push the site to a
  separate public repository that holds only the built files. Create it empty (say
  `direct-file-virginia-site`), add it as a remote (`git remote add site git@github.com:…`),
  and set `SITE_REMOTE=site` and the repository name in `SITE_BASE_PATH` and `SITE_URL` in
  `stack/site.env`.
- **The route prefix.** A project site is served under `/<repository>/`, so every link in the
  built pages has to start with it: the build runs with
  `-Dsite.basePath=/direct-file-virginia/app/direct-file` (`SITE_BASE_PATH` in `stack/site.env`;
  `Main.scala` in the port reads it, and defaults to `/app/direct-file`). The output folder does
  not move: it is `out/app/direct-file/` either way, because the host puts its own prefix in front
  of the branch. If the repository is renamed, change the two values in `site.env`.

What the hosted copy has: the four households and every screen, the Scenario menu and Browse
All (the build passes the same developer flags as `make demo`, minus the two AI features, which
would call a model), the fact dictionary, both languages, and a **read-only copy of the
Workbench** at `/workbench/`: the lines, the values by year, the questions, the screens, the
worked examples (run in the browser, as in the live one), the changes and requests as they were
on the publishing machine, and the four reports. `workbench/snapshot.mjs` writes it at build
time: the page, its scripts and the engine, plus every answer the live server gives to a read,
as JSON files; the page then refuses every save with a message that names `make workbench`.
What the hosted copy does not have: the live Workbench (drafts, approvals, publishing), Author
Mode, Fact Explorer. Nothing on the hosted site can write anywhere.

## Other free hosts, if GitHub Pages does not suit

All serve at the root of their own domain, so the build keeps its normal prefix: `make site-demo`
(no `SITE_BASE_PATH`), then upload `form-builder-examples/direct-file/out/`. The start page is then
at `<their address>/app/direct-file/resources/start/`.

| Host | Free tier | How | Notes |
|---|---|---|---|
| **Cloudflare Pages** | unlimited bandwidth, 500 deploys a month | `npx wrangler pages deploy form-builder-examples/direct-file/out --project-name direct-file-virginia` after `npx wrangler login` | a Cloudflare account; no git connection needed, the folder is uploaded as is; 20,000 files per deploy |
| **Netlify** | 100 GB a month | drag the `out/` folder onto app.netlify.com/drop, or `npx netlify-cli deploy --dir form-builder-examples/direct-file/out --prod` | a Netlify account; the drop needs no CLI at all |
| **Surge** | unlimited basic sites | `npx surge form-builder-examples/direct-file/out direct-file-virginia.surge.sh` | the simplest; an email address is the account |

Any of these is fine for a demo. GitHub Pages is recommended only because it needs no second
account and the address outlives the course.

## Size

The site is a few thousand small files: every page in two languages, the engine bundle, the
dictionary, the data. `make publish` prints the count and the size before it pushes. GitHub
Pages allows a gigabyte; Cloudflare twenty thousand files. Both hold it comfortably.

## When something is wrong

| You see | It means | Do |
|---|---|---|
| a 404 at the repository's root address | Pages is not on, or still building | Settings, Pages: is the source `gh-pages`, `/ (root)`? Wait a minute and reload |
| the start page loads but every link 404s | the site was built with the wrong prefix | `SITE_BASE_PATH` in `stack/site.env` must be `/<repository name>/app/direct-file`; `make publish` again |
| a household link opens but the return is empty | the scenario files were not built in | `make site-demo` passes `--scenarioMode`, which copies them; a plain `make site` does not |
| `make publish` stops at "no start page" | the build failed before writing | scroll up for sbt's error; `make doctor` for the toolchain |
| "Pages is not available for private repositories" | the account is a free one | make the repository public, claim the Student Pack, or push to a separate public repository (above) |
