# The IRS stack and client, run from this repository's root. `make` lists the targets.
IRS     := direct-file/direct-file
COMPOSE := docker compose --project-directory $(IRS) -f $(IRS)/docker-compose.yaml -f stack/overrides.yaml
SERVICES := api csp-simulator

.PHONY: help stack-up stack-down stack-logs stack-ps client demo

help:
	@grep -E '^[a-z-]+:.*## ' $(MAKEFILE_LIST) | awk -F ':.*## ' '{printf "  %-12s %s\n", $$1, $$2}'

stack-up: ## build if needed and start the API, its databases, localstack, Redis and the login simulator
	$(COMPOSE) up -d --build $(SERVICES)

stack-down: ## stop the stack, keeping its data
	$(COMPOSE) stop

stack-logs: ## follow the API's log
	$(COMPOSE) logs -f api

stack-ps: ## what is running
	$(COMPOSE) ps

client: ## run the taxpayer client at http://localhost:3000 (needs nvm; Node from df-client/.nvmrc)
	cd $(IRS)/df-client && . "$$HOME/.nvm/nvm.sh" && nvm use >/dev/null && npm run start

demo: ## build and smoke-test the static explainer, then serve it at http://localhost:8765
	cd demo && npm run all && npm run serve
