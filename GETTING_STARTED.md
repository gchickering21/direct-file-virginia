# Getting started

From nothing to the Virginia return on your screen. Two ways in, both serving the same site at
the same address. Take the Docker path to see it; take the native path if you will edit rules
all day, because its watcher regenerates in about twenty seconds instead of restarting a
container. Do not run both at once; they share port 3008.

Everything here was first done on a 2017 Intel MacBook Pro on macOS 13. A newer Mac has it
easier; the macOS 13 detours are in `docs/macos-13.md`. The 2025 archive, the real federal
application, is optional and lives in `docs/archive-2025.md`.

## 1. Clone and check the machine

```bash
git clone https://github.com/gchickering21/direct-file-virginia.git
cd direct-file-virginia
make doctor
```

About 150 MB: the IRS's libraries are vendored in at pinned commits, so the build fetches
nothing else from GitHub (the 2025 archive is the exception, and optional: `make fetch-archive`). `make doctor` prints one line per tool, OK or MISSING, with the fix
beside anything missing. Run it first and after every install below. `make` alone lists every
target.

What the checks need on either path: Node 22, python3 with PyYAML, xmllint (macOS ships it).

## 2. The Docker path

**Install** Docker Desktop, any release from 4.18 (March 2023) on. Give the Docker VM at least
8 GB of memory and leave 10 GB of disk free (Settings, Resources).

```bash
make demo        # doctor, then build and serve, then wait for the site and print the links
```

When it is up, open http://localhost:3008/app/direct-file/resources/start/, the start page: the
four households as cards, what to look for, and the admin pages. (Nothing to install at all? The
hosted copy of the same site is in `docs/hosting.md`.)

That builds one image with the JDK, sbt and Node inside it, compiles the IRS's Fact Graph and
Form Builder libraries, generates the site, and serves it with nginx. Expect 10 to 20 minutes
the first time, mostly downloads; later starts take seconds. A second container watches the
source and regenerates the site on every edit, so you can change a Virginia figure in
`facts/virginiaConstants.xml` and reload.

| Command | Does |
|---|---|
| `make up` | the same without the wait and the links |
| `make logs` | follow the logs; the watcher's sbt output is the one to read |
| `make down` | stop |
| `make demo-links` | print the demo links again |

In on this path: the flow, Browse All, Scenario mode and Author Mode. Not in: Fact Explorer,
which lives in the IRS's separate Taxpert stack and is not wired here (`docs/surfaces.md`).

## 3. The native path

JDK 21, sbt 1.11 and Node 22 on the host. On macOS 14 or newer:

```bash
brew install openjdk@21 sbt
brew install nvm && nvm install 22       # follow nvm's post-install note if you did not have it
make doctor
make dev                                 # http://localhost:3008/app/direct-file, regenerating on edits
```

`stack/toolchain.sh` selects Node 22 and, on a Mac with prebuilt binaries under
`~/.dpi-toolchain`, the JDK and sbt there; every native target sources it, so you never set
`JAVA_HOME` by hand. The first `make dev` bootstraps: it publishes the two IRS libraries, installs
the npm dependencies and vendors the assets, a few minutes while sbt fetches itself, and it does
this again on its own when a pin moves (`make bootstrap` forces it). Leave `make dev` running.
When you see

```
✓ Direct File Server ready
  Local:   http://localhost:3008/app/direct-file
```

the site is up. The top bar is the Taxpert workspace the IRS ships for developers.

`make site-demo` builds the same site once, without serving it, into
`virginia/direct-file/out/`; `make publish` builds it and puts it on GitHub Pages so
that nobody has to install anything (`docs/hosting.md`).

## 4. See the Virginia return

The start page, http://localhost:3008/app/direct-file/resources/start/, has the four households
as cards. The same four as links:

Each link lands on the Virginia intro with a demo household already loaded. Click Next through
the screens, or jump to `/your-taxes/virginia/virginia-summary/` for the return.

| Link | Household | Shows | Result |
|---|---|---|---|
| [`?demo=1`](http://localhost:3008/app/direct-file/your-taxes/virginia/virginia-intro/?demo=1) | Riley Rappahannock, Richmond, single, $33k | the plain case; $200 of estimated payments from Virginia's records on Lines 20 to 22 | owes $698 |
| [`?demo=2`](http://localhost:3008/app/direct-file/your-taxes/virginia/virginia-intro/?demo=2) | Morgan Shenandoah, Charlottesville, 65, $56k | the age deduction and its phase-out; the Commonwealth Savers deduction | owes $1,522 |
| [`?demo=3`](http://localhost:3008/app/direct-file/your-taxes/virginia/virginia-intro/?demo=3) | Jordan Elizabeth, Norfolk, head of household, $20k | the refundable earned income credit and the unemployment subtraction, neither asked for; the locality filled in from the ZIP | refund $505 |
| [`?demo=4`](http://localhost:3008/app/direct-file/your-taxes/virginia/virginia-intro/?demo=4) | Taylor York, Williamsburg, single, on active duty, $27k | the military basic pay subtraction; a ZIP that crosses three localities, so the screen asks | refund $151 |

`?scenario=<file name>` loads any file in `resources/scenarios/` the same way. The other way
in is the Scenario menu in the top bar: choose a Virginia Demo under Existing scenarios and
click Load scenario.

If a Virginia address bounces you to "Review and confirm", no Virginia resident is loaded. The
Virginia screens are gated on the federal residence answer and the runtime skips them for
anyone else. That is the gate working. Load a demo and try again.

## 5. The checks

```bash
make check       # every check that needs no built site, in one run: the IRS schemas, the export rule,
                 # the constants module, every fact described, the Spanish keys, the doc counts, the fact
                 # paths the docs cite, the demo households, the workbench's worked examples
make test        # the port's ScalaTest suite, VirginiaSpec included (native toolchain)
make cases       # 50 households against an independent model of the rules (site must be running)
make a11y        # axe over every Virginia screen, English and Spanish (site must be running)
make stats       # the true counts; STATS=--check scans the docs for stale numbers
make workbench          # the rules workbench at http://localhost:3011
make proof              # the three checks above against a built site (make site-demo), written into the proof page
```

The two browser checks need only Node. Their first run installs a Playwright and axe-core
pinned in `stack/browser-tools/`, and Playwright's Chromium, once (`make browser-tools`). The
households are written to `virginia/direct-file/target/va-cases`, which git
ignores; `CASES_DIR=…` moves them.

## 6. When something is wrong

| You see | It means | Do |
|---|---|---|
| half a site, or a page with no form | the watcher is regenerating | wait for `[success]` in its output and reload |
| a Virginia address bounces to "Review and confirm" | no Virginia resident loaded | open a `?demo=` link, or Scenario, Virginia Demo 1, Load scenario |
| `??/your-taxes/virginia/...??` on a Spanish page | a Virginia sentence changed and its Spanish key with it | `python3 scripts/merge-virginia-es.py` names the key; re-copy it into `locales/virginia_es.yaml` |
| `Playwright does not support chromium on mac13` | the port's own smoke suite on macOS 13 | use `make cases` and `make a11y`, which carry their own Playwright |
| `make check` reports stale numbers in the docs | a count in the prose drifted from the code | `make stats` prints the true counts; fix the sentence |
| `make check` says a doc cites a fact path the XML does not have | a fact was renamed or removed | the script names the path and the file |
| a four-megabyte diff in `vendor/fact-graph/factgraph-3.1.0.js` | a real rebuild of the engine (a reorder alone is never copied: `make copy-fg` keeps the vendored copy then) | expected after a `fact-graph` pin bump; otherwise `git checkout -- <the file>` |
| the site is up but there is no top bar, no Scenario menu, and the console shows 404s under `vendor/taxpert/dist/` | the Taxpert bundle was vendored one folder too deep, because a stray empty `taxpert/packages/ui/src/dist` was copied first | `make doctor` names it: remove that folder, then `make -C virginia/direct-file copy-shared-ui` and rebuild |
| the Docker VM is nearly full | the first build's cache | `docker builder prune -af`; never `docker volume prune` |
| "port is already allocated" on 3008 | the other path is still serving | `make down`, or stop `make dev` |

The longer story of each, with dates, is `report/NOTES.md`.
