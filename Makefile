# Run from this repository's root. `make` lists the targets.
# `port-*` targets drive the IRS's port of Direct File on Form Builder (where the Virginia work lives);
# `stack-*` and `client` run the archived 2025 application (the "before").
IRS     := direct-file/direct-file
PORT    := form-builder-examples/direct-file
TOOLCHAIN := . stack/toolchain.sh &&
COMPOSE := docker compose --project-directory $(IRS) -f $(IRS)/docker-compose.yaml -f stack/overrides.yaml
SERVICES := api csp-simulator

.PHONY: help handoff handoff-verify doctor stats bump-pin ci-local virginia-check port-up port-down port-logs port-bootstrap port-dev port-site port-smoke port-validate port-test virginia-cases virginia-a11y browser-tools stack-up stack-build stack-down stack-logs stack-ps client

help:
	@grep -E '^[a-z0-9-]+:.*## ' $(MAKEFILE_LIST) | awk -F ':.*## ' '{printf "  %-15s %s\n", $$1, $$2}'

handoff: ## write the Virginia change set as patches on IRS-Public/form-builder-examples (handoff/patches/)
	handoff/export.sh

handoff-verify: ## clone the IRS repo at the pin, apply the patches there, run the schema, export and Spanish checks (needs network)
	handoff/verify.sh

doctor: ## is this machine ready? Docker or JDK 21 + sbt, Node 22, python3, xmllint, disk, ports; warns on a reordered engine bundle
	stack/doctor.sh

stats: ## the true counts (facts, screens, questions, demos, households, a11y routes, workbench examples); STATS=--check against the docs
	python3 $(PORT)/scripts/virginia-stats.py $(STATS)

bump-pin: ## move one IRS pin: make bump-pin REPO=form-builder-examples SHA=<40 chars> [APPLY=1]; a dry run with a drift report otherwise
	stack/bump-pin.sh $(REPO) $(SHA) $(if $(APPLY),--apply)

virginia-check: ## validate the XML, the export rule, and the Spanish keys for the Virginia module
	$(TOOLCHAIN) $(MAKE) -C $(PORT) validate-xml
	python3 $(PORT)/scripts/check-virginia-exports.py
	python3 $(PORT)/scripts/merge-virginia-es.py
	python3 $(PORT)/scripts/check-virginia-docs.py

ci-local: ## every check that needs no built site, in one run: schemas, export rule, constants, Spanish keys, doc counts, workbench examples
	$(TOOLCHAIN) $(MAKE) -C $(PORT) validate-xml
	python3 $(PORT)/scripts/check-virginia-exports.py
	python3 $(PORT)/scripts/check-virginia-constants.py
	python3 $(PORT)/scripts/merge-virginia-es.py --check
	python3 $(PORT)/scripts/virginia-stats.py --check
	python3 $(PORT)/scripts/check-virginia-docs.py
	$(TOOLCHAIN) node $(PORT)/workbench/check.mjs

# ── The two browser checks, against whichever path is serving port 3008 ──────────────────────
# Node from stack/toolchain.sh, and a Playwright pinned in stack/browser-tools rather than the
# port's own (see its package.json), passed to the scripts as PLAYWRIGHT_MODULE and AXE_PATH.
#
# Variables, each overridable on the command line (make virginia-cases CASES_DIR=/somewhere):
#   CASES_DIR          where virginia-cases.py writes the households and virginia-cases.cjs reads them
#                      (default $(PORT)/target/va-cases, which the port's .gitignore ignores); passed
#                      to the harness as CASES
#   BASE_URL           the site the harness drives, no trailing slash; the a11y script has its own
#                      copy of the default inside it
#   PLAYWRIGHT_MODULE  the playwright-core both scripts require (default: the pinned one in $(TOOLS))
#   AXE_PATH           the axe.min.js virginia-a11y.cjs injects (default: the pinned axe-core)
#   PORT_DIR           the port directory virginia-a11y.cjs reads the demo scenario from
TOOLS     := stack/browser-tools/node_modules
BASE_URL  ?= http://localhost:3008/app/direct-file
SITE      := $(BASE_URL)/
CASES_DIR ?= $(PORT)/target/va-cases
REQUIRE_SITE := @curl -sfo /dev/null $(SITE) || { echo "==> nothing at $(SITE): start it first (make port-dev, or make port-up)"; exit 1; }

browser-tools: $(TOOLS)/.installed ## once: install the pinned Playwright and axe-core, and its Chromium

$(TOOLS)/.installed: stack/browser-tools/package.json
	$(TOOLCHAIN) npm --prefix stack/browser-tools install --no-audit --no-fund
	$(TOOLCHAIN) node $(TOOLS)/playwright-core/cli.js install chromium
	@touch $@

virginia-cases: browser-tools ## the 50 households against an independent model of the rules (site must be running)
	$(REQUIRE_SITE)
	python3 $(PORT)/scripts/virginia-cases.py $(abspath $(CASES_DIR))
	$(TOOLCHAIN) CASES=$(abspath $(CASES_DIR)) BASE_URL=$(BASE_URL) PLAYWRIGHT_MODULE=$(CURDIR)/$(TOOLS)/playwright-core node $(PORT)/scripts/virginia-cases.cjs

virginia-a11y: browser-tools ## axe over the Virginia screens, one question per page (port-dev and port-up both serve them so)
	$(REQUIRE_SITE)
	$(TOOLCHAIN) PORT_DIR=$(PORT) AXE_PATH=$(CURDIR)/$(TOOLS)/axe-core/axe.min.js PLAYWRIGHT_MODULE=$(CURDIR)/$(TOOLS)/playwright-core node $(PORT)/scripts/virginia-a11y.cjs

# ── Docker path: nothing to install but Docker Desktop ───────────────────────────────────────
# Three compose files: the IRS's two, then stack/port-override.yaml, which has the watcher split the
# questions one per page as `make port-dev` does, so the two paths serve the same site.
PORT_COMPOSE := docker compose --project-directory $(PORT) -f $(PORT)/docker-compose.yml -f $(PORT)/docker-compose.override.yml -f $(CURDIR)/stack/port-override.yaml

port-up: ## build the port in Docker (JDK, sbt, Node all inside the image) and serve it at http://localhost:3008/app/direct-file/, regenerating on edits
	$(PORT_COMPOSE) up -d --build

port-down: ## stop the Docker port
	$(PORT_COMPOSE) down

port-logs: ## follow the Docker port's logs (the watcher's sbt output is the one to read)
	$(PORT_COMPOSE) logs -f

# ── Native path: JDK 21, sbt and Node 22 on the host (stack/toolchain.sh) ────────────────────────
port-bootstrap: ## once: compile and publish fact-graph and form-builder, install the port's npm deps, vendor assets
	$(TOOLCHAIN) npm --prefix taxpert/packages/ui install
	$(TOOLCHAIN) $(MAKE) -C $(PORT) bootstrap

port-dev: ## run the port with hot reload at http://localhost:3008/app/direct-file/
	$(TOOLCHAIN) $(MAKE) -C $(PORT) dev

port-site: ## build the port's static site into $(PORT)/out
	$(TOOLCHAIN) $(MAKE) -C $(PORT) site

port-smoke: ## the port's browser smoke test against ./out (after port-site)
	$(TOOLCHAIN) $(MAKE) -C $(PORT) smoke

port-validate: ## validate the port's flow and fact XML against their RELAX NG schemas
	$(TOOLCHAIN) $(MAKE) -C $(PORT) validate-xml

port-test: ## the port's ScalaTest suite
	$(TOOLCHAIN) $(MAKE) -C $(PORT) test

stack-up: ## start the API, its databases, localstack, Redis and the login simulator (builds only images that are missing)
	$(COMPOSE) up -d $(SERVICES)

stack-build: ## rebuild the API and simulator images (slow: Maven and sbt; wants 10 GB free in the Docker VM)
	$(COMPOSE) build $(SERVICES)

stack-down: ## stop the stack, keeping its data
	$(COMPOSE) stop

stack-logs: ## follow the API's log
	$(COMPOSE) logs -f api

stack-ps: ## what is running
	$(COMPOSE) ps

client: ## run the taxpayer client (needs nvm; Node from df-client/.nvmrc); open it through the login simulator at http://localhost:5000/df/file
	cd $(IRS)/df-client && . "$$HOME/.nvm/nvm.sh" && nvm use >/dev/null && npm run start
