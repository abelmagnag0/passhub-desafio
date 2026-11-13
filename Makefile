.PHONY: up down logs ps test cov typecheck search health docs chaos demo-cache demo-metrics

up:       ## sobe tudo (providers + redis + postgres + agregador)
	docker compose up -d --build

down:     ## derruba tudo e limpa volumes
	docker compose down -v

logs:     ## segue os logs do agregador
	docker compose logs -f api

ps:       ## estado dos containers
	docker compose ps

test:     ## roda os testes (precisa do Redis de testes no ar)
	npm test

typecheck:
	npm run typecheck

search:   ## busca de exemplo
	@curl -s -X POST localhost:8000/search \
		-H 'Content-Type: application/json' \
		-d '{"origin":"GRU","destination":"GIG","date":"2026-10-12"}' | head -c 400

health:   ## probe de saúde
	@curl -s localhost:8000/health | head -c 400

docs:     ## sobe o Jaeger e abre a UI de traces
	docker compose --profile observability up -d
	@echo "Jaeger UI: http://localhost:16686"

chaos:    ## provider-c derrubando e pendurando chamadas
	docker compose --profile chaos up -d

demo-cache:   ## prova o cache: MISS vs HIT + TTL
	@./scripts/demo-cache.sh

demo-metrics: ## métricas Prometheus formatadas
	@./scripts/demo-metrics.sh
