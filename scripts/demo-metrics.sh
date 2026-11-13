#!/usr/bin/env bash
# Mostra as métricas Prometheus do agregador, já formatadas para leitura.
# Uso: ./scripts/demo-metrics.sh [base-url]
set -euo pipefail

BASE="${1:-http://localhost:8000}"

curl -s "$BASE/metrics" |
  grep -E '^aggregator_(search_requests_total|cache_hits_total|breaker_state)' |
  grep -v '_bucket' |
  awk '
    /search_requests_total/ { printf "  buscas   %-58s %s\n", $1, $2; next }
    /cache_hits_total/      { printf "  cache    hit total%s %s\n", "", $2; next }
    /breaker_state/         { printf "  breaker  %-58s %s\n", $1, $2; next }
  '

echo
echo "  latência por provider (média das últimas chamadas):"
curl -s "$BASE/metrics" |
  awk '
    /^aggregator_provider_latency_seconds_sum\{/    { split($1,a,"provider=\""); split(a[2],b,"\""); sum[b[1]]=$2 }
    /^aggregator_provider_latency_seconds_count\{/  { split($1,a,"provider=\""); split(a[2],b,"\""); n[b[1]]=$2 }
    END { for (p in sum) if (n[p] > 0) printf "    %-12s %6.0f ms  (%d chamadas)\n", p, sum[p]/n[p]*1000, n[p] }
  ' | sort

echo
echo "  breaker: 0 = fechado (ok), 1 = meio-aberto, 2 = aberto (provider fora)"