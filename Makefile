# ── Tic-Tac-Toe Nakama Monorepo — Makefile ───────────────────────────────────
# Requires: Docker, Docker Compose v2, Node.js 20+, npm
#
# Usage:
#   make dev          — build backend bundle, then start all Docker services
#   make build-backend — compile backend TypeScript → build/index.js
#   make logs         — follow Nakama server logs
#   make stop         — stop Docker services (preserves volumes)
#   make clean        — stop services AND remove all volumes (full reset)
#   make frontend     — start Vite dev server on :5173
#   make test-backend — run TypeScript type-check on the backend

.PHONY: dev build-backend logs stop clean frontend test-backend \
        cockroach-ui nakama-console help

# ── Colour helpers ────────────────────────────────────────────────────────────
BOLD   := \033[1m
RESET  := \033[0m
GREEN  := \033[32m
YELLOW := \033[33m
CYAN   := \033[36m

# ── Primary targets ───────────────────────────────────────────────────────────

## dev: Build the backend bundle then start all services (Nakama + CockroachDB)
dev: build-backend
	@echo "$(GREEN)$(BOLD)▶ Starting Docker services...$(RESET)"
	docker compose up -d
	@echo ""
	@echo "$(CYAN)  Nakama API  →  http://localhost:7350$(RESET)"
	@echo "$(CYAN)  Nakama WS   →  ws://localhost:7350$(RESET)"
	@echo "$(CYAN)  Console     →  http://localhost:7351 (admin / password)$(RESET)"
	@echo "$(CYAN)  CockroachDB →  http://localhost:8080$(RESET)"
	@echo ""
	@echo "$(YELLOW)  Run 'make logs' to follow Nakama logs$(RESET)"

## build-backend: Compile TypeScript → backend/build/index.js
build-backend:
	@echo "$(GREEN)$(BOLD)▶ Building backend...$(RESET)"
	cd backend && npm install --frozen-lockfile && npm run build
	@echo "$(GREEN)  ✓ backend/build/index.js ready$(RESET)"

## logs: Follow Nakama server logs (Ctrl+C to exit)
logs:
	docker compose logs -f nakama

## stop: Stop all Docker services (data volumes preserved)
stop:
	@echo "$(YELLOW)$(BOLD)▶ Stopping services...$(RESET)"
	docker compose down
	@echo "$(YELLOW)  Services stopped. Volumes retained.$(RESET)"

## clean: Stop services AND destroy all data volumes (full reset)
clean:
	@echo "$(YELLOW)$(BOLD)▶ Removing services and volumes...$(RESET)"
	docker compose down -v
	@rm -rf backend/build
	@echo "$(YELLOW)  ✓ All containers, volumes, and build artefacts removed.$(RESET)"

## frontend: Start the Vite dev server on http://localhost:5173
frontend:
	@echo "$(GREEN)$(BOLD)▶ Starting frontend dev server...$(RESET)"
	cd frontend && npm install --frozen-lockfile && npm run dev

## test-backend: Run TypeScript type-check (no emit)
test-backend:
	@echo "$(GREEN)$(BOLD)▶ Type-checking backend...$(RESET)"
	cd backend && npm run typecheck
	@echo "$(GREEN)  ✓ No type errors$(RESET)"

# ── Convenience targets ───────────────────────────────────────────────────────

## cockroach-ui: Open CockroachDB Admin UI in the default browser
cockroach-ui:
	open http://localhost:8080

## nakama-console: Open Nakama developer console in the default browser
nakama-console:
	open http://localhost:7351

# ── Help ──────────────────────────────────────────────────────────────────────

## help: Print this help message
help:
	@echo ""
	@echo "$(BOLD)Tic-Tac-Toe Nakama — available make targets:$(RESET)"
	@echo ""
	@grep -E '^## ' $(MAKEFILE_LIST) \
		| sed 's/## /  /' \
		| awk -F': ' '{ printf "  $(CYAN)%-20s$(RESET) %s\n", $$1, $$2 }'
	@echo ""

.DEFAULT_GOAL := help
