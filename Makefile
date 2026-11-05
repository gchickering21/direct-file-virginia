# Run from this repository's root. `make` lists the targets in three groups: run it, check it, maintain it.
#
#   make demo     Docker only: build and serve the Virginia site, then print the links that open a demo household
#   make dev      native toolchain (JDK 21, sbt, Node 22): the same site, rebuilt in about 20 seconds on every
#                 edit; bootstraps the two IRS libraries itself the first time
#   make check    every check that needs no built site, about a minute
#   make publish  build the demo site and push it to GitHub Pages, so nobody has to install anything (docs/hosting.md)
#
# Every target drives the Virginia site: virginia/direct-file/, the IRS's port of Direct File on Form
# Builder, copied out of form-builder-examples/ and changed here (the IRS trees are never edited). The 2025 archive's targets are in stack/archive.mk.
# The older names (port-dev, port-up, ci-local, virginia-cases, …) still work; they are aliases at the end.
PORT      := virginia/direct-file
TOOLCHAIN := . stack/toolchain.sh &&
TOOLS     := stack/browser-tools/node_modules
STAMP     := stack/.bootstrapped

# Variables the browser checks take, each overridable on the command line (make cases CASES_DIR=/somewhere):
#   BASE_URL   the site the two browser checks drive, no trailing slash
#   CASES_DIR  where the households are written and read (the port's .gitignore ignores the default)
BASE_URL  ?= http://localhost:3008/app/direct-file
SITE      := $(BASE_URL)/
CASES_DIR ?= $(PORT)/target/va-cases
REQUIRE_SITE := @curl -sfo /dev/null $(SITE) || { echo "==> nothing at $(SITE): start it first (make dev, or make up)"; exit 1; }

# The Docker path's three compose files: the IRS's two, then stack/port-override.yaml, which has the watcher
# split the questions one per page as `make dev` does, so both paths serve the same site.
PORT_COMPOSE := docker compose --project-directory $(PORT) -f $(PORT)/docker-compose.yml -f $(PORT)/docker-compose.override.yml -f $(CURDIR)/stack/port-override.yaml

.PHONY: help demo demo-links dev up down logs author workbench bootstrap \
        check test cases a11y workbench-check doctor \
        stats handoff handoff-verify bump-pin browser-tools site-demo proof publish \
        port-dev port-up port-down port-logs port-author port-bootstrap port-test ci-local virginia-check virginia-cases virginia-a11y

help:
	@awk 'BEGIN { FS = ":.*## " } /^##@/ { printf "\n%s\n", substr($$0, 5) } /^[a-z0-9-]+:.*## / { printf "  %-15s %s\n", $$1, $$2 }' Makefile
	@echo
	@echo "The 2025 archive, optional and not vendored: make fetch-archive, then stack-up, stack-build, stack-down, stack-logs, stack-ps, client (docs/archive-2025.md)."
	@echo "Older names still work: port-dev port-up port-down port-logs port-author port-bootstrap port-test ci-local virginia-cases virginia-a11y."

##@ Run it
demo: ## Docker only: check the machine, build and serve the Virginia site, wait for it, print the demo links
	stack/doctor.sh
	$(PORT_COMPOSE) up -d --build
	@echo "==> waiting for $(SITE): 10 to 20 minutes the first time, seconds after that (make logs in another terminal to watch)"
	@for i in $$(seq 1 360); do curl -sfo /dev/null $(SITE) && break; sleep 5; done
	@curl -sfo /dev/null $(SITE) || { echo "==> nothing at $(SITE) after 30 minutes: make logs"; exit 1; }
	@$(MAKE) -s demo-links

demo-links: ## print the demo links; each lands on the Virginia intro with that household loaded (site must be running)
	@python3 $(PORT)/scripts/virginia-demos.py links $(BASE_URL)

dev: $(STAMP) ## native: serve http://localhost:3008/app/direct-file/ with a rebuild on every edit; bootstraps itself the first time
	$(TOOLCHAIN) $(MAKE) -C $(PORT) dev

up: ## Docker: build the site (JDK, sbt, Node all inside the image) and serve it at http://localhost:3008/app/direct-file/, regenerating on edits
	$(PORT_COMPOSE) up -d --build

down: ## Docker: stop the site
	$(PORT_COMPOSE) down

logs: ## Docker: follow the site's logs (the watcher's sbt output is the one to read)
	$(PORT_COMPOSE) logs -f

author: $(STAMP) ## native: the site with Author Mode on, editing the flow XML from the browser (its API on port 3009)
	$(TOOLCHAIN) $(MAKE) -C $(PORT) dev-author

workbench: ## the Virginia Rules Workbench for policy staff at http://localhost:3011 (Node only; docs/surfaces.md)
	$(TOOLCHAIN) $(MAKE) -C $(PORT) workbench

site-demo: $(STAMP) ## native: build the demo site once into virginia/direct-file/out (the demo surfaces, no AI, the read-only Workbench, the Fact Explorer); SITE_BASE_PATH=… for a host, FACT_EXPLORER=0 to skip the Explorer
	$(TOOLCHAIN) $(MAKE) -C $(PORT) copy-fg copy-shared-ui copy-uswds
	$(TOOLCHAIN) cd $(PORT) && sbt $(if $(SITE_BASE_PATH),-Dsite.basePath=$(SITE_BASE_PATH)) 'run --auditMode --allScreens --scenarioMode --singleQuestionPerScreen'
	$(TOOLCHAIN) node $(PORT)/workbench/snapshot.mjs $(PORT)/out/app/direct-file/workbench
	@mkdir -p $(PORT)/out/app/direct-file/mockups && cp report/mockups/*.html $(PORT)/out/app/direct-file/mockups/ && echo "==> mockups: $(PORT)/out/app/direct-file/mockups/"
	$(if $(filter 0,$(FACT_EXPLORER)),@echo "==> the Fact Explorer skipped (FACT_EXPLORER=0)",stack/fact-explorer.sh $(or $(SITE_BASE_PATH),/app/direct-file) $(patsubst %/app/direct-file,%,$(or $(SITE_BASE_PATH),/app/direct-file))/fact-explorer $(PORT)/out/fact-explorer)
	@echo "==> built: $(PORT)/out/app/direct-file/, links under $(or $(SITE_BASE_PATH),/app/direct-file)  (serve it: cd $(PORT)/out && python3 -m http.server 3008)"

proof: browser-tools ## run the households, the axe pass and the test suite against the built site and write the proof page's data (docs/hosting.md)
	stack/proof.sh

publish: ## build the demo site under the hosted prefix, run the checks into the proof page, push it to the gh-pages branch (docs/hosting.md; PROOF=0 skips the checks)
	stack/publish-pages.sh

bootstrap: ## native, once (make dev runs it for you): publish the two IRS libraries, npm installs, vendor assets
	$(TOOLCHAIN) npm --prefix taxpert/packages/ui install
	$(TOOLCHAIN) $(MAKE) -C $(PORT) bootstrap
	@touch $(STAMP)

# The stamp says the native toolchain has been bootstrapped. It is older than any of these when a pin moves or
# a library's build changes, and then `make dev`, `make author` and `make test` bootstrap again before running.
$(STAMP): IRS_PINS.md fact-graph/build.sbt form-builder/build.sbt taxpert/packages/ui/package.json $(PORT)/package.json
	$(MAKE) bootstrap

##@ Check it
check: ## every check that needs no built site, in one run: schemas, export rule, constants, Spanish keys, doc counts, fact paths, demo households, workbench examples
	$(TOOLCHAIN) $(MAKE) -C $(PORT) validate-xml
	python3 $(PORT)/scripts/check-virginia-exports.py
	python3 $(PORT)/scripts/check-virginia-constants.py
	python3 $(PORT)/scripts/merge-virginia-es.py --check
	python3 $(PORT)/scripts/virginia-stats.py --check
	python3 $(PORT)/scripts/check-virginia-docs.py
	python3 $(PORT)/scripts/virginia-demos.py check
	$(TOOLCHAIN) node $(PORT)/workbench/check.mjs

test: $(STAMP) ## the ScalaTest suite, VirginiaSpec included (native toolchain)
	$(TOOLCHAIN) $(MAKE) -C $(PORT) test

cases: browser-tools ## 50 households against an independent model of the rules, in the browser (site must be running)
	$(REQUIRE_SITE)
	python3 $(PORT)/scripts/virginia-cases.py $(abspath $(CASES_DIR))
	$(TOOLCHAIN) CASES=$(abspath $(CASES_DIR)) BASE_URL=$(BASE_URL) PLAYWRIGHT_MODULE=$(CURDIR)/$(TOOLS)/playwright-core node $(PORT)/scripts/virginia-cases.cjs

a11y: browser-tools ## axe over every Virginia screen, English and Spanish (site must be running)
	$(REQUIRE_SITE)
	$(TOOLCHAIN) BASE_URL=$(BASE_URL) PORT_DIR=$(PORT) AXE_PATH=$(CURDIR)/$(TOOLS)/axe-core/axe.min.js PLAYWRIGHT_MODULE=$(CURDIR)/$(TOOLS)/playwright-core node $(PORT)/scripts/virginia-a11y.cjs

workbench-check: ## the workbench's worked examples against the Virginia fact modules, from the command line
	$(TOOLCHAIN) $(MAKE) -C $(PORT) workbench-check

doctor: ## is this machine ready? Docker or JDK 21 + sbt, Node 22, python3, xmllint, disk, ports
	stack/doctor.sh

##@ Maintain it
stats: ## the true counts (facts, screens, questions, demos, households, a11y routes, workbench examples); STATS=--check against the docs
	python3 $(PORT)/scripts/virginia-stats.py $(STATS)

handoff: ## write the Virginia change set as patches on IRS-Public/form-builder-examples (handoff/patches/)
	handoff/export.sh

handoff-verify: ## clone the IRS repo at the pin, apply the patches there, run the schema, export and Spanish checks (needs network)
	handoff/verify.sh

bump-pin: ## move one IRS pin: make bump-pin REPO=form-builder-examples SHA=<40 chars> [APPLY=1]; a dry run with a drift report otherwise
	stack/bump-pin.sh $(REPO) $(SHA) $(if $(APPLY),--apply)

# ── Plumbing, not listed ──────────────────────────────────────────────────────────────────────────
# The two browser checks use a Playwright and axe-core pinned in stack/browser-tools rather than the port's own
# (its Playwright 1.62 has no Chromium for macOS 13), installed with a Chromium on first use.
browser-tools: $(TOOLS)/.installed

$(TOOLS)/.installed: stack/browser-tools/package.json
	$(TOOLCHAIN) npm --prefix stack/browser-tools install --no-audit --no-fund
	$(TOOLCHAIN) node $(TOOLS)/playwright-core/cli.js install chromium
	@touch $@

# The older names, kept so the notes, the handoff package and muscle memory still work.
port-dev: dev
port-up: up
port-down: down
port-logs: logs
port-author: author
port-bootstrap: bootstrap
port-test: test
ci-local: check
virginia-check: check
virginia-cases: cases
virginia-a11y: a11y

include stack/archive.mk
