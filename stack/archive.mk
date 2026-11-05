# The 2025 archive: the real federal Direct File as the IRS published it (direct-file/), run as the
# "before". Optional; nothing in the Virginia work needs it, so it is not vendored: `make fetch-archive`
# puts it at direct-file/ at the commit IRS_PINS.md pins (git ignores the folder). Included by the root
# Makefile and kept out of `make help` on purpose. docs/archive-2025.md says how to run it and why
# stack/overrides.yaml corrects four things in the IRS compose file.
IRS      := direct-file/direct-file
COMPOSE  := docker compose --project-directory $(IRS) -f $(IRS)/docker-compose.yaml -f stack/overrides.yaml
SERVICES := api csp-simulator
REQUIRE_ARCHIVE := @test -d $(IRS) || { echo "==> no 2025 archive at direct-file/: make fetch-archive first (docs/archive-2025.md)"; exit 1; }

.PHONY: fetch-archive stack-up stack-build stack-down stack-logs stack-ps client

fetch-archive: # fetch IRS-Public/direct-file at the pin into direct-file/ (570 MB, needs network)
	stack/fetch-archive.sh

stack-up:     # start the API, its databases, LocalStack, Redis and the login simulator (builds only missing images)
	$(REQUIRE_ARCHIVE)
	$(COMPOSE) up -d $(SERVICES)

stack-build:  # rebuild the API and simulator images (15 to 30 minutes: Maven and sbt; wants 10 GB free in the Docker VM)
	$(REQUIRE_ARCHIVE)
	$(COMPOSE) build $(SERVICES)

stack-down:   # stop the archive, keeping its data
	$(COMPOSE) stop

stack-logs:   # follow the API's log
	$(COMPOSE) logs -f api

stack-ps:     # what is running
	$(COMPOSE) ps

client:       # the taxpayer client (Node from df-client/.nvmrc through nvm); open it through the simulator at http://localhost:5000/df/file
	$(REQUIRE_ARCHIVE)
	cd $(IRS)/df-client && . "$$HOME/.nvm/nvm.sh" && nvm use >/dev/null && npm run start
