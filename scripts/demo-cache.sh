#!/usr/bin/env bash
# Demonstra o cache Redis ao vivo: MISS (vai aos providers) → HIT.
# Uso: ./scripts/demo-cache.sh [base-url] [data]
set -euo pipefail

BASE="${1:-http://localhost:8000}"
# data aleatória por execução: com data fixa a 1ª chamada sai HIT
# por causa de uma demo anterior, e a comparação perde o sentido
# data aleatória no próximo ano: data fixa faria a 1ª chamada sair HIT
# por causa de uma demo anterior, e a comparação perderia o sentido
DATA="${2:-$(date -d "+$((RANDOM % 300 + 30)) days" +%Y-%m-%d)}"
BODY="{\"origin\":\"GRU\",\"destination\":\"GIG\",\"date\":\"$DATA\"}"

chamar() {
  curl -s -o /dev/null -D /tmp/demo-h.txt -w '%{time_total}' \
    -X POST "$BASE/search" -H 'Content-Type: application/json' -d "$BODY"
}

header() { grep -i '^x-search-cache' /tmp/demo-h.txt | tr -d '\r' | cut -d' ' -f2; }
ms() { awk -v t="$1" 'BEGIN{printf "%.0f", t*1000}'; }

echo "cache Redis — TTL 300s, chave por origem/destino/data/estratégia"
echo
t1=$(chamar); h1=$(header)
t2=$(chamar); h2=$(header)

printf "  1ª  %-5s %6s ms\n" "$h1" "$(ms "$t1")"
printf "  2ª  %-5s %6s ms\n" "$h2" "$(ms "$t2")"
echo
echo "  ganho: $(awk -v a="$t1" -v b="$t2" 'BEGIN{printf "%.0f", (1-b/a)*100}')%"
