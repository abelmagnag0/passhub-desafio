import { $ } from './helpers.js'

const nf = new Intl.NumberFormat('pt-BR')

const skeleton = () => `
  <div class="dash-panel">
    <div class="panel-head">
      <div class="skel-line" style="width:130px;height:20px"></div>
      <div class="skel-line" style="width:150px;height:17px"></div>
    </div>
    <div class="tele-kpis">
      ${Array.from({ length: 3 })
        .map(
          () => `<div class="tele-kpi">
            <div class="skel-line" style="width:110px;height:17px"></div>
            <div class="skel-line" style="width:64px;height:30px"></div>
          </div>`,
        )
        .join('')}
    </div>
    <table class="tele-table">
      <thead><tr><th>Rota</th><th>Data</th><th>Estratégia</th><th>Expira em</th><th>TTL</th></tr></thead>
      <tbody>
        ${Array.from({ length: 3 })
          .map(
            () => `<tr>
              <td><div class="skel-line" style="width:96px;height:13px"></div></td>
              <td><div class="skel-line" style="width:74px;height:13px"></div></td>
              <td><div class="skel-line" style="width:130px;height:13px"></div></td>
              <td class="ttl-cell"><div class="skel-line" style="width:100%;height:6px;border-radius:3px"></div></td>
              <td class="num"><div class="skel-line" style="width:38px;height:13px;margin-left:auto"></div></td>
            </tr>`,
          )
          .join('')}
      </tbody>
    </table>
  </div>

  <div class="dash-panel">
    <div class="panel-head">
      <div class="skel-line" style="width:160px;height:20px"></div>
      <div class="skel-line" style="width:140px;height:17px"></div>
    </div>
    <table class="tele-table">
      <thead><tr><th>Provider</th><th>Circuit breaker</th><th>Latência média</th></tr></thead>
      <tbody>
        ${Array.from({ length: 3 })
          .map(
            () => `<tr>
              <td><div class="skel-line" style="width:82px;height:13px"></div></td>
              <td><div class="skel-line" style="width:58px;height:18px;border-radius:999px"></div></td>
              <td class="num"><div class="skel-line" style="width:60px;height:13px;margin-left:auto"></div></td>
            </tr>`,
          )
          .join('')}
      </tbody>
    </table>
  </div>`

const ttlBar = (pct, ttl) => {
  const cor = ttl <= 30 ? 'var(--bad)' : ttl <= 90 ? 'var(--warn)' : 'var(--ok)'
  return `<span class="ttl-track"><span class="ttl-fill" style="width:${Math.max(2, pct)}%;background:${cor}"></span></span>`
}

const cacheRows = (c) =>
  c.entries.length === 0
    ? `<tr><td colspan="5" class="muted">Nenhuma entrada viva agora — as buscas abaixo contam a hora corrente, mesmo que as chaves já tenham expirado. Faça uma busca em <a href="/cotacoes">Cotar valores</a>.</td></tr>`
    : c.entries
        .map(
          (e) => `<tr>
            <td class="mono route-cell">${e.origin} → ${e.destination}</td>
            <td class="mono">${e.date}</td>
            <td class="muted">${e.strategy}</td>
            <td class="ttl-cell">${ttlBar(e.remainingPct, e.ttl)}</td>
            <td class="mono num">${e.ttl}s</td>
          </tr>`,
        )
        .join('')

const BREAKER_LABEL = {
  closed: ['fechado', 'ok'],
  'half-open': ['meio-aberto', 'warn'],
  open: ['aberto', 'bad'],
}

const providerRows = (providers, metrics) =>
  providers
    .map((p) => {
      const [label, cls] = BREAKER_LABEL[p.breaker] ?? [p.breaker, '']
      const lat = metrics.latency[p.name]
      return `<tr>
        <td class="mono">${p.name}</td>
        <td><span class="pill ${cls}">${label}</span></td>
        <td class="mono num">${lat == null ? '<span class="muted">sem amostra</span>' : `${nf.format(Math.round(lat))} ms`}</td>
      </tr>`
    })
    .join('')

const strategyRows = (strategies) =>
  strategies.length === 0
    ? `<tr><td colspan="2" class="muted">Nenhuma busca registrada ainda.</td></tr>`
    : strategies
        .map(
          (s) =>
            `<tr><td class="mono">${s.name}</td><td class="mono num">${nf.format(s.total)}</td></tr>`,
        )
        .join('')

const markup = () => `
  <div class="dash-panel">
    <div class="panel-head">
      <h3 class="dash-title">Cache Redis</h3>
      <span class="panel-sub" data-cache-sub></span>
    </div>

    <div class="tele-kpis">
      <div class="tele-kpi">
        <span class="hero-label">Acertos nesta hora</span>
        <strong data-hits>—</strong>
      </div>
      <div class="tele-kpi">
        <span class="hero-label">Buscas nesta hora</span>
        <strong data-searches>—</strong>
      </div>
      <div class="tele-kpi">
        <span class="hero-label">Taxa de acerto</span>
        <strong data-rate>—</strong>
      </div>
    </div>

    <table class="tele-table">
      <thead><tr><th>Rota</th><th>Data</th><th>Estratégia</th><th>Expira em</th><th>TTL</th></tr></thead>
      <tbody data-cache-rows></tbody>
    </table>
  </div>

  <div class="dash-panel">
    <div class="panel-head">
      <h3 class="dash-title">Métricas Prometheus</h3>
      <span class="panel-sub">lidas de <code>GET /metrics</code></span>
    </div>
    <table class="tele-table">
      <thead><tr><th>Provider</th><th>Circuit breaker</th><th>Latência média</th></tr></thead>
      <tbody data-provider-rows></tbody>
    </table>

    <div class="panel-head" style="margin-top:18px">
      <h4 class="dash-title">Buscas por estratégia</h4>
      <span class="panel-sub" data-cache-hits></span>
    </div>
    <table class="tele-table">
      <thead><tr><th>Estratégia</th><th>Total</th></tr></thead>
      <tbody data-strategy-rows></tbody>
    </table>
  </div>`

const parseMetrics = (text) => {
  const sums = {}
  const counts = {}
  let cacheHits = 0

  for (const line of text.split('\n')) {
    if (line.startsWith('#')) continue
    const soma = line.match(/^aggregator_provider_latency_seconds_sum\{provider="([^"]+)"[^}]*\}\s+([\d.e+-]+)/)
    if (soma) {
      sums[soma[1]] = (sums[soma[1]] ?? 0) + Number(soma[2])
      continue
    }
    const cont = line.match(/^aggregator_provider_latency_seconds_count\{provider="([^"]+)"[^}]*\}\s+([\d.e+-]+)/)
    if (cont) {
      counts[cont[1]] = (counts[cont[1]] ?? 0) + Number(cont[2])
      continue
    }
    const hit = line.match(/^aggregator_cache_hits_total\s+([\d.e+-]+)/)
    if (hit) cacheHits = Number(hit[1])
  }

  const latency = {}
  for (const p of Object.keys(sums)) {
    if (counts[p] > 0) latency[p] = (sums[p] / counts[p]) * 1000
  }
  return { latency, cacheHits }
}

const paint = (data, metrics) => {
  const el = $('#telemetry-body')
  const set = (sel, text) => {
    const node = el.querySelector(sel)
    if (node && node.textContent !== text) node.textContent = text
  }

  const c = data.cache
  set(
    '[data-cache-sub]',
    `TTL ${c.ttlSeconds}s · ${c.entries.length === 0 ? 'vazio' : `${c.entries.length} ${c.entries.length === 1 ? 'entrada' : 'entradas'}`}`,
  )
  set('[data-hits]', nf.format(data.hits))
  set('[data-searches]', nf.format(data.searches))
  set('[data-rate]', data.hitRate == null ? '—' : `${data.hitRate.toLocaleString('pt-BR')}%`)

  set('[data-cache-hits]', `${nf.format(metrics.cacheHits)} desde o restart`)

  const cacheBody = el.querySelector('[data-cache-rows]')
  const cacheHtml = cacheRows(c)
  if (cacheBody && cacheBody.dataset.sig !== cacheHtml) {
    cacheBody.innerHTML = cacheHtml
    cacheBody.dataset.sig = cacheHtml
  }

  const provBody = el.querySelector('[data-provider-rows]')
  const provHtml = providerRows(data.providers, metrics)
  if (provBody && provBody.dataset.sig !== provHtml) {
    provBody.innerHTML = provHtml
    provBody.dataset.sig = provHtml
  }

  const stratBody = el.querySelector('[data-strategy-rows]')
  const stratHtml = strategyRows(data.strategies)
  if (stratBody && stratBody.dataset.sig !== stratHtml) {
    stratBody.innerHTML = stratHtml
    stratBody.dataset.sig = stratHtml
  }
}

const fetchAll = async () => {
  const [dataRes, metricsRes] = await Promise.all([
    fetch('/telemetry/data'),
    fetch('/metrics'),
  ])
  return {
    data: await dataRes.json(),
    metrics: parseMetrics(await metricsRes.text()),
  }
}

export const loadTelemetry = async () => {
  const el = $('#telemetry-body')

  if (!el.querySelector('[data-cache-rows]')) el.innerHTML = skeleton()

  try {
    const { data, metrics } = await fetchAll()
    if (!el.querySelector('[data-cache-rows]')) el.innerHTML = markup()
    paint(data, metrics)
  } catch {
    el.innerHTML = '<div class="card">Falha ao carregar telemetria.</div>'
  }
}

$('#telemetry-refresh')?.addEventListener('click', () => {
  const el = $('#telemetry-body')
  if (!el.querySelector('[data-cache-rows]')) el.innerHTML = skeleton()
  loadTelemetry()
})

setInterval(() => {
  if ($('#tab-telemetria')?.classList.contains('active')) loadTelemetry()
}, 10_000)