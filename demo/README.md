# Direct File prototype

A static page for a digital public infrastructure class. It runs code the IRS
published for Direct File: the Fact Graph engine, the 3,030 facts of its tax rules,
the 727-screen interview with its wording, and the test returns its engineers
used. A visitor steps through a test return, changes answers, and watches the
IRS's rules recalculate the Form 1040 and re-decide which questions come next.

Published (private until shared): https://claude.ai/artifact/TsyR5k7s8uc4DmyWQZrkHZ

## Build and run

Needs Node 20+, git and network access for the first fetch.

```bash
cd prototypes/direct-file
npm install
npm run all      # fetch the IRS repo, build site/, run the smoke test
npm run serve    # http://localhost:8765
```

| Command | What it does |
|---|---|
| `npm run fetch` | Clones `IRS-Public/direct-file` into `vendor/` at the pinned commit in `scripts/fetch-irs.sh` |
| `npm run build` | Writes the page's data into `site/` (below) |
| `npm test` | Loads the page in jsdom with the real data. Checks each test return's refund or amount owed, steps through every screen, and checks a recalculation, a knockout, rule-driven answer choices, undo and the rule explorer |

`vendor/`, `build/`, `node_modules/` and the generated files in `site/` are
git-ignored. A clean checkout rebuilds them byte for byte.

## What is in here

| Path | What it is |
|---|---|
| `site/index.html` | The page's markup and styles |
| `site/app.js` | Draws the page: the interview, the 1040, the rule explorer, the proposed screens |
| `site/runtime.js` | Runs the interview against the engine: which screens show (the condition logic of the repository's `flow/Condition.ts`), knockouts, answer choices, writing answers |
| `scripts/paths.mjs` | Every location the build reads or writes |
| `scripts/dictionary.mjs` | The fact dictionary, converted from the XML with the same logic as the repository's `readRawFacts.ts` and `processFactsToDigestWrapper.ts` |
| `scripts/flow.mjs` | Compiles the repository's `flow.tsx` with stand-in components so the interview tree can be read as data |
| `scripts/engine.mjs` | Wraps the repository's prebuilt Scala.js engine for a browser script tag and minifies it |
| `scripts/site-data.mjs` | Writes the data files below |
| `test/smoke.cjs` | Loads the page in jsdom and checks it against the test returns' known results |

Generated into `site/`:

| File | Source in the IRS repository |
|---|---|
| `engine.js` | `df-client/js-factgraph-scala/src/main.js` |
| `dictionary.json` | `df-client-app/src/fact-dictionary/generate-src/xml-src/*.xml` |
| `facts.json` | The same XML: names, descriptions, dependencies and each fact's source text |
| `flow.json` | `df-client-app/src/flow/flow.tsx` and `flow-chunks/` |
| `copy.json` | `df-client-app/src/locales/en.yaml`: the headings, explanations, questions and choices the interview uses |
| `returns.json` | Six files from `backend/src/test/resources/scenarios/`, chosen and labelled by `PICK` in `scripts/site-data.mjs` |

The Form 1040 lines in `site/app.js` follow the IRS's PDF field mapping,
`backend/src/main/resources/pdf/2024/IRS1040/en/configuration.yml`.

## How it decides what to show

- **Screens.** A screen shows when every `Gate` around it and its own condition hold
  for this return. Loops (`CollectionLoop`) repeat their screens for each person or
  form. A visible knockout screen ends the interview, as it did in Direct File.
- **Conditions the page can't know** (feature flags, IRS data imports, the signing
  path) are fixed in `cond` in `site/runtime.js` and listed on the page's About tab.
- **Answer choices** are read from the rules for this return (`enumChoices`), so a
  household that can't file jointly isn't offered that status.

## Serving from the platform (temporary)

To share it for a short while, the platform's web service serves it **to admins
only** (a superuser or a member of the "admin" group) at

    https://<the FDSW host>/prototypes/direct-file/

Sign in to the site first. Anyone else, signed in or not, gets a 404, so the page
doesn't reveal that it exists. It isn't linked from anywhere and carries `noindex`.

How it ships:

- **Build.** The `prototype-direct-file` stage in `_docker/Dockerfile` fetches the
  IRS repository, builds `site/` and runs the smoke test.
- **Placement.** The production stage copies the result to
  `/app/prototypes/direct-file/site` and makes compressed copies. That is deliberately
  outside `WHITENOISE_ROOT`: WhiteNoise answers before authentication, so anything
  there would be public.
- **Serving.** `web/backend/sorn_platform/prototypes.py` checks the session, then
  serves each file, compressed when the browser accepts it.
  `tests_integration/test_prototype_direct_file.py` checks the gate.
- **Cost.** The build needs network access to github.com and adds about a minute.

On the dev stack it is at http://localhost:5173/prototypes/direct-file/ once you sign in
as an admin. Check it before deploying: `make prod-local`, sign in as an admin at
http://localhost:8090/fdsw/, then open http://localhost:8090/prototypes/direct-file/.
Deploy as usual (`docs/CLOUD_RESYNC.md`, "build, push, deploy").

### Taking it down

Every piece is marked TEMPORARY.

1. Delete `web/backend/sorn_platform/prototypes.py` and
   `web/backend/tests_integration/test_prototype_direct_file.py`.
2. In `web/backend/sorn_platform/urls.py`, delete the `direct_file` import and the
   two `prototypes/direct-file/` URLs.
3. In `_docker/Dockerfile`, delete the `prototype-direct-file` stage and the
   `COPY --from=prototype-direct-file` and `whitenoise.compress` lines after it.
4. In `.dockerignore`, put back the single line `prototypes` in place of the TEMPORARY block.
5. In `web/frontend/vite.config.ts`, delete the `/prototypes` proxy line (it lets the dev
   server on port 5173 reach the Django view).
6. Delete this section, then build and deploy. The URL then answers 404 for everyone.

The folder itself can stay, as a class project in the repository, or go
(see "Removing it" below).

## Publishing

The page is a Claude artifact: `site/index.html` is the page, and the other
eight files in `site/` are published beside it under the same names. To update
it, ask Claude to republish `prototypes/direct-file/site` to the URL above.

## Common changes

- **Another test return:** add a row to `PICK` in `scripts/site-data.mjs` and its
  expected result to `EXPECTED` in `test/smoke.cjs`, then `npm run build && npm test`.
  The repository has 163 returns to choose from.
- **More of each screen:** `scripts/site-data.mjs` keeps headings, explanations and
  questions. Alerts (`DFAlert`, `TaxReturnAlert`), help pop-ups (`DFModal`) and the
  lists the app assembles at run time (`ConditionalList`) are left out; keep them in
  the `conv` walk and draw them in `screenHTML` in `site/app.js`.
- **Spanish:** point `LOCALE` in `scripts/paths.mjs` at `es.yaml`.

## Licences and data

The IRS repository is a work of the US government, in the public domain (CC0),
and archived. It is fetched at build time, not committed. The test returns are
invented people and numbers. The page hides identifying numbers anyway. This
folder's own code follows the repository licence (Apache-2.0).

## Removing it

Take it down from the platform first (above), if it is still served. Then delete
`prototypes/direct-file/` and its row in `prototypes/README.md`. If it was the last
prototype, delete `prototypes/` and the `prototypes` line in `.dockerignore`.
