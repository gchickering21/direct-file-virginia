# Run from this repository's root. `make` lists the targets.
# `port-*` targets drive the IRS's port of Direct File on Form Builder (where the Virginia work lives);
# `stack-*` and `client` run the archived 2025 application (the "before").
IRS     := direct-file/direct-file
PORT    := form-builder-examples/direct-file
TOOLCHAIN := . stack/toolchain.sh &&
COMPOSE := docker compose --project-directory $(IRS) -f $(IRS)/docker-compose.yaml -f stack/overrides.yaml
SERVICES := api csp-simulator

.PHONY: help handoff virginia-check port-bootstrap port-dev port-site port-smoke port-validate port-test stack-up stack-build stack-down stack-logs stack-ps client

help:
	@grep -E '^[a-z-]+:.*## ' $(MAKEFILE_LIST) | awk -F ':.*## ' '{printf "  %-12s %s\n", $$1, $$2}'

handoff: ## write the Virginia change set as patches on IRS-Public/form-builder-examples (handoff/patches/)
	handoff/export.sh

virginia-check: ## validate the XML, the export rule, and the Spanish keys for the Virginia module
	$(TOOLCHAIN) $(MAKE) -C $(PORT) validate-xml
	python3 $(PORT)/scripts/check-virginia-exports.py
	python3 $(PORT)/scripts/merge-virginia-es.py

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
