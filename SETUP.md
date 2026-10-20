# From a clean Mac to both sites running, step by step

Everything that had to be done, in the order it had to be done, with what went wrong and
what fixed it. Written for a teammate on a Mac who has never opened this repository. The
whole thing took one working day the first time, most of it finding the problems below;
with this page it is about two hours, nearly all of it waiting for downloads and builds.

There are two sites. You need only the second for the Virginia work; the first is the
historical "before".

| Site | What it is | Needs | Address when running |
|---|---|---|---|
| The archived 2025 Direct File | the real federal product, as published | Docker, Node 18 | http://localhost:5000/df/file |
| The IRS's port on Form Builder, with Virginia | a static site, engine in the browser | JDK 21, sbt, Node 22 | http://localhost:3008/app/direct-file |

## 0. Before anything: what machine do you have?

```bash
sw_vers -productVersion     # macOS version
uname -m                    # arm64 (Apple silicon) or x86_64 (Intel)
```

- **macOS 14 or newer:** every tool below installs the normal way. Skip the macOS 13 notes.
- **macOS 13 (Ventura), as on the 2017 Intel MacBook Pro this was built on:** two detours.
  Docker Desktop must be 4.48.0 exactly (the last release that installs on 13), and the
  Java toolchain must come as prebuilt binaries because Homebrew compiles it from source
  on 13, which takes hours. Both detours are written out below.

## 1. Clone

```bash
git clone git@github.com:gchickering21/direct-file-virginia.git
cd direct-file-virginia
```

About 140 MB: the IRS's five repositories are vendored in at pinned commits (`IRS_PINS.md`),
so nothing else is fetched from GitHub by the build. `make` with no arguments lists every
target used below.

## 2. The IRS port with Virginia (the one you want)

### 2.1 Toolchain: JDK 21, sbt 1.11, Node 22

On macOS 14 or newer:

```bash
brew install openjdk@21 sbt
brew install nvm            # if you do not have nvm; follow its post-install note
nvm install 22
```

On macOS 13, do not run `brew install openjdk@21`: it started compiling the JDK and
OpenSSL from source and was stopped after half an hour with no end in sight. Instead:

```bash
mkdir -p ~/.dpi-toolchain && cd ~/.dpi-toolchain
# JDK: the Temurin 21 build for your chip, from https://github.com/adoptium/temurin21-binaries/releases
curl -fsSLo jdk.tar.gz "https://github.com/adoptium/temurin21-binaries/releases/download/jdk-21.0.12.1%2B1/OpenJDK21U-jdk_x64_mac_hotspot_21.0.12.1_1.tar.gz"
tar -xzf jdk.tar.gz && rm jdk.tar.gz && ln -sfn jdk-21*/Contents/Home jdk21
# sbt launcher, plain Java, nothing to compile
curl -fsSLo sbt.zip https://github.com/sbt/sbt/releases/download/v1.11.4/sbt-1.11.4.zip && unzip -qo sbt.zip && rm sbt.zip
nvm install 22
```

`stack/toolchain.sh` puts `~/.dpi-toolchain` on the path and selects Node 22; every
`make port-*` target sources it, so you never set `JAVA_HOME` by hand. On a newer Mac the
file is harmless: it finds nothing under `~/.dpi-toolchain` and leaves Homebrew's tools
in charge.

### 2.2 Bootstrap, once

```bash
make port-bootstrap
```

This publishes `fact-graph` and `form-builder` to your local Ivy cache, installs the port's
npm dependencies, and vendors the engine bundle, the Taxpert UI and USWDS into the port.
The first run spends a few minutes while sbt fetches itself and the Scala compiler; the
two libraries then compile in about fifteen and twenty-five seconds.

What went wrong the first time: the IRS's own `make bootstrap` runs the Taxpert UI's build
script, which imports a bundler that is a dev dependency of the Taxpert package; a `file:`
npm dependency does not install those, so the step failed on a fresh clone with "Cannot
find package 'rolldown'". `make port-bootstrap` runs `npm install` inside
`taxpert/packages/ui` first. You will not see the error.

### 2.3 Run

```bash
make port-dev
```

Leave it running. It compiles the port's Scala, generates the 140-page site (about 20 to
30 seconds), serves it, and regenerates on every edit. When you see

```
✓ Direct File Server ready
  Local:   http://localhost:3008/app/direct-file
```

open that address. The top bar is the Taxpert workspace the IRS ships for developers.

### 2.4 See the Virginia return

1. Click **Scenario** in the top bar.
2. Under "Load existing scenario" choose **Virginia Demo 1 Riley Rappahannock Single
   33k** and click **Load scenario**.
3. Open http://localhost:3008/app/direct-file/your-taxes/virginia/virginia-intro/ and
   click Next through the screens, or jump to the summary at
   `/your-taxes/virginia/virginia-summary/`.

Riley owes $673. Load **Virginia Demo 2** for the age deduction and the 529 deduction;
Morgan owes $1,522. **Browse All** in the top bar lists every screen, federal and
Virginia, grouped by section.

If a Virginia address bounces you to "Review and confirm", no Virginia resident is loaded:
the Virginia screens are gated on the residence answer and the runtime skips them. That is
the gate working. Load a demo and try again.

### 2.5 Check it

```bash
make virginia-check     # both XML files against the IRS schemas, the export rule, the Spanish keys
make port-test          # the port's ScalaTest suite, 12 tests
cd form-builder-examples/direct-file
python3 scripts/virginia-cases.py /tmp/va-cases && CASES=/tmp/va-cases node scripts/virginia-cases.cjs
                        # 16 households against an independent model (needs make port-dev running)
```

On macOS 13 the last command needs `PLAYWRIGHT_MODULE=<path to a playwright-core that has
a Chromium for your OS>` because the port's own Playwright (1.62) has no Chromium build
for 13. On a newer Mac it just runs, and so does the IRS's own `make site && make smoke`.

## 3. The archived 2025 Direct File (the "before")

Optional. It is the real 2025 product, with its Spring Boot API, three Postgres databases,
Redis, a LocalStack standing in for AWS, and a simulator standing in for ID.me and
Login.gov. The two services that transmit to the IRS e-file system are not in the public
stack, so a return computes but is never filed.

### 3.1 Docker Desktop

Any release from 4.18 (March 2023) on. Check:

```bash
docker compose version      # want 2.17 or newer
docker buildx version       # want 0.11 or newer
```

What went wrong the first time: the machine had Docker Desktop 4.16.2 from January 2023.
Its Compose did not know the `additional_contexts` key the IRS compose file uses, and its
buildx could not do the named build contexts the IRS Dockerfiles need. A newer Compose
plugin alone did not help (it wanted a newer buildx too). The IRS onboarding guide says
only "make sure docker is up-to-date".

On macOS 13 the current Docker Desktop refuses to install ("requires macOS 14.0 or
later"). The last release for macOS 13 is **4.48.0** (October 2025), Intel installer
https://desktop.docker.com/mac/main/amd64/207573/Docker.dmg (Apple silicon: replace
`amd64` with `arm64`). It warns on first launch that it cannot update further; that is
fine. Turn off automatic updates in its settings so it stops trying.

Disk: the first build needs about 10 GB free inside the Docker VM. Check with
`docker system df`, reclaim with `docker builder prune -af` and `docker image prune -f`,
and never `docker volume prune`.

### 3.2 Node 18 for the client

```bash
cd direct-file/direct-file/df-client && nvm install "$(cat .nvmrc)" && cd -
```

### 3.3 Build and run

```bash
make stack-build        # 15 to 30 minutes the first time: Maven and sbt inside Docker
make stack-up           # the API, its databases, LocalStack, Redis, the login simulator
make client             # the React client on port 3000; leave it running
```

Open **http://localhost:5000/df/file** (the simulator, which fronts the client), log in
with any email, choose IAL2, click "Start my 2024 federal tax return". Opening port 3000
directly skips authentication and the app will not load a return.

Four things in the IRS compose and client setup had rotted in the year since the IRS
archived the code. All are corrected in `stack/overrides.yaml`, which the Makefile passes
as a second compose file, so the IRS tree stays byte-for-byte upstream:

1. **LocalStack** is pulled by its floating `latest` tag, which is now a licensed product
   that exits with code 55 without a paid token. Pinned to the newest 4.x community image.
2. **Redis** is published on host port 6379 with no variable to move it, so it collides with
   any other Redis on the machine. Unpublished; the API reaches it on the compose network.
3. **The login simulator** reaches the client's Vite dev server on the host as
   `host.docker.internal`, which Vite's 2025 security fix rejects ("Blocked request. This
   host is not allowed"), and this Vite has no way to add a host from outside the IRS
   config. Vite allows every `*.localhost` name, so the simulator now reaches the host as
   `client.localhost` through a compose `extra_hosts` entry.
4. **The state API** does not build or run: its development certificate expired on
   2025-08-30 and a unit test fails on it. It is the federal-to-state export path, the part
   states depended on, and it is not needed for the Virginia work. `make stack-up` starts
   only the API and the simulator.

### 3.4 Check it

Log in, start a return, and reach the "About you" questions. A scripted version of that
walk is what passed on 2026-10-19: login, the welcome page, the IRS data-import mock, the
checklist, the first interview screens saving facts to the API, no errors.

## 4. If something is wrong

| You see | It means | Do |
|---|---|---|
| `make port-bootstrap` fails on `rolldown` | an old checkout of the Makefile | pull; the target installs Taxpert's deps first |
| the port serves half a site, or a page with no form | the watcher is regenerating | wait for `[success]` in its output and reload |
| a Virginia address bounces to "Review and confirm" | no Virginia resident loaded | Scenario → Virginia Demo 1 → Load scenario |
| `??/your-taxes/virginia/...??` on a Spanish page | a Virginia sentence changed and its Spanish key with it | `python3 scripts/merge-virginia-es.py` names the key; re-copy it into `locales/virginia_es.yaml` |
| LocalStack exits with code 55 | the override is not applied | run through `make`, not `docker compose` in the IRS folder |
| "Blocked request. This host (host.docker.internal)" | the simulator is not using `client.localhost` | pull `stack/overrides.yaml`; `make stack-up` recreates the simulator |
| "port is already allocated" | another stack holds 5432, 6379, 8080 or 3000 | the IRS compose takes `DF_API_PORT`, `DF_DB_PORT`, `DF_FE_PORT` |
| `Playwright does not support chromium on mac13` | the port's smoke suite on macOS 13 | run the Virginia harness with `PLAYWRIGHT_MODULE`, or use a newer Mac |
| the Docker VM is nearly full | the first build's cache | `docker builder prune -af`; never `docker volume prune` |

The longer version of all of this, with dates, is `report/NOTES.md`.
