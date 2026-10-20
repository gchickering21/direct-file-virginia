# Developers: run it from scratch

The shortest path from nothing to the Virginia return on your screen. One install, one
clone, one command. Written for someone who has never seen this repository and does not
want to install a Java toolchain.

## Path 1: Docker only (recommended)

**Install:** Docker Desktop, any release from 4.18 (March 2023) on. On macOS 13 the last
release that installs is 4.48.0; `SETUP.md` has the installer link. Give the Docker VM at
least 8 GB of memory and 10 GB of free disk (Settings → Resources).

**Clone and run:**

```bash
git clone git@github.com:gchickering21/direct-file-virginia.git
cd direct-file-virginia
make port-up
```

That builds one image with the JDK, sbt and Node inside it, compiles the IRS's Fact
Graph and Form Builder libraries, generates the site, and serves it with nginx. Expect
10 to 20 minutes the first time, mostly downloads; later starts are seconds. A second
container watches the source and regenerates the site on every edit, so you can change a
Virginia rule in `facts/virginia.xml` and reload.

**Open:** http://localhost:3008/app/direct-file/

**See the Virginia return:** Scenario (top bar) → "Virginia Demo 1 Riley Rappahannock
Single 33k" → Load scenario → open
http://localhost:3008/app/direct-file/your-taxes/virginia/virginia-intro/ and click Next.
Riley owes $673. Virginia Demo 2 shows the age deduction and the 529 deduction.

**Stop:** `make port-down`. **Logs:** `make port-logs`.

What is and is not in this path: the flow, Browse All, Scenario mode and Author Mode are
in. Fact Explorer is not; it lives in the IRS's separate Taxpert stack and needs that
repository's own `make up`, which this repository does not wire. Nothing else here
needs it.

## Path 2: native toolchain (faster rebuilds while editing rules)

If you will edit Virginia rules all day, a native sbt watcher regenerates in about 20
seconds and needs no container restarts.

```bash
brew install openjdk@21 sbt && nvm install 22      # macOS 14+; macOS 13 detour in SETUP.md
make port-bootstrap                                # once
make port-dev                                      # http://localhost:3008/app/direct-file
```

Same site, same address. Do not run both paths at once; they share port 3008.

## Checks, either path

```bash
make virginia-check     # the IRS schemas, the export rule, the Spanish keys
make port-test          # the port's own ScalaTest suite (native toolchain)
cd form-builder-examples/direct-file
python3 scripts/virginia-cases.py /tmp/va-cases && CASES=/tmp/va-cases node scripts/virginia-cases.cjs
                        # 16 households against an independent model of the rules (site must be running)
```

The last needs Node and the port's npm dependencies on the host (`npm install` in that
folder); on macOS 13 add `PLAYWRIGHT_MODULE=<a playwright-core with a Chromium for your OS>`.

## What you are looking at

| Where | What |
|---|---|
| `form-builder-examples/direct-file/` | the IRS's port of Direct File onto Form Builder; the Virginia work lives inside it |
| `.../facts/virginia.xml`, `.../facts/virginiaLocalities.xml` | the Virginia rules, Form 760 Lines 1 to 36 for a single W-2 filer, tax year 2024 |
| `.../flow/your-taxes-virginia.xml` | the twelve Virginia screens |
| `.../docs/virginia/README.md` | what it covers, the hand checks, the gap list |
| `handoff/` | how a state would take the change set; the policy map; every Form 760 field and its source |
| `fact-graph/`, `form-builder/`, `taxpert/` | the IRS libraries the port builds against, pinned (`IRS_PINS.md`) |
| `direct-file/` | the archived 2025 federal application; optional, see below |

## The archived 2025 Direct File (optional)

The real federal product, as the "before". Docker plus Node 18 on the host:

```bash
make stack-build        # 15 to 30 minutes the first time
make stack-up
make client             # leave running; Node from direct-file/direct-file/df-client/.nvmrc
```

Open http://localhost:5000/df/file, any email, IAL2. The client runs on the host because
the IRS's own compose file runs it there; the four things that had rotted in that compose
file are corrected in `stack/overrides.yaml`, and `SETUP.md` explains each.

## When something is wrong

`SETUP.md` has a table keyed by the message you see. The two most common: a Virginia
address bouncing to "Review and confirm" means no Virginia resident is loaded, so load a
demo; a half-rendered page means the watcher is regenerating, so wait for `[success]` in
the logs and reload.
