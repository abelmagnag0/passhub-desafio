import { $, formatBRL } from './helpers.js'

const nf = new Intl.NumberFormat('pt-BR')
const um = (n) => (n == null ? '—' : nf.format(n))
const pct = (n) => (n == null ? '—' : `${n.toLocaleString('pt-BR')}%`)
const ms = (n) => (n == null ? '—' : `${nf.format(n)} ms`)

const horaDe = (iso) => iso.slice(11, 13)
const diaCurto = (iso) =>
  new Date(`${iso.slice(0, 10)}T12:00:00`).toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
  })

const PROVIDER = {
  a: { cor: 'var(--brand)', nome: 'A' },
  b: { cor: '#0ea5a4', nome: 'B' },
  c: { cor: '#c2410c', nome: 'C' },
}

const dashboardSkeleton = () => `
  <div class="dash-head">
    <div class="seg">
      <div class="skel-line" style="width:110px;height:28px;border-radius:7px"></div>
    </div>
    <div class="skel-line" style="width:64px;height:24px;border-radius:999px"></div>
  </div>

  <section class="dash-hero">
    <div class="hero-main">
      <div class="skel-line" style="width:110px;height:17px"></div>
      <div class="skel-line" style="width:190px;height:35px;margin:2px 0 0"></div>
      <div class="skel-line" style="width:230px;height:17px"></div>
    </div>
    <div class="hero-side">
      ${Array.from({ length: 3 })
        .map(
          () => `<div class="hero-stat">
            <div class="skel-line" style="width:60px;height:17px"></div>
            <div class="skel-line" style="width:52px;height:30px"></div>
          </div>`,
        )
        .join('')}
    </div>
  </section>

  <div class="dash-panel chart-panel">
    <div class="panel-head">
      <div class="skel-line" style="width:130px;height:20px"></div>
      <div class="skel-line" style="width:150px;height:17px"></div>
    </div>
    <div class="chart-wrap">
      <div class="chart-y">
        <div class="skel-line" style="width:22px;height:10px"></div>
        <div class="skel-line" style="width:22px;height:10px"></div>
        <div class="skel-line" style="width:22px;height:10px"></div>
      </div>
      <div class="chart-plot">
        <div class="vol-cols">
          ${Array.from({ length: 24 })
            .map(
              (_, i) =>
                `<div class="vol-col"><div class="skel-bar" style="height:${18 + ((i * 37) % 66)}%"></div></div>`,
            )
            .join('')}
        </div>
      </div>
    </div>
    <div class="chart-foot">
      <div class="skel-line" style="width:210px;height:17px"></div>
      <div class="skel-line" style="width:130px;height:17px"></div>
    </div>
  </div>

  <div class="dash-cols">
    <div class="dash-panel">
      <div class="panel-head">
        <div class="skel-line" style="width:140px;height:14px"></div>
        <div class="skel-line" style="width:90px;height:12px"></div>
      </div>
      <div class="prov-rows">
        ${Array.from({ length: 3 })
          .map(
            () => `<div class="prov-row">
              <div class="prov-top">
                <div class="skel-line" style="width:96px;height:13px"></div>
                <div class="skel-line" style="width:44px;height:13px"></div>
              </div>
              <div class="skel-line" style="width:100%;height:6px;border-radius:3px"></div>
            </div>`,
          )
          .join('')}
      </div>
    </div>
    <div class="dash-panel">
      <div class="panel-head">
        <div class="skel-line" style="width:140px;height:14px"></div>
        <div class="skel-line" style="width:90px;height:12px"></div>
      </div>
      <div class="route-rows">
        ${Array.from({ length: 7 })
          .map(
            () => `<div class="route-row">
              <div class="skel-line" style="width:66px;height:12px"></div>
              <div class="skel-line route-sk" style="width:100%;height:6px"></div>
              <div class="skel-line" style="width:26px;height:12px"></div>
              <div class="skel-line" style="width:34px;height:12px"></div>
            </div>`,
          )
          .join('')}
      </div>
    </div>
  </div>

  <div class="dash-panel api-panel">
    <div class="panel-head">
      <div class="skel-line" style="width:110px;height:14px"></div>
      <div class="skel-line" style="width:150px;height:12px"></div>
    </div>
    <div class="skel-line" style="width:100%;height:10px;border-radius:5px"></div>
    <div class="error-legend" style="margin-top:10px">
      <div class="skel-line" style="width:60px;height:12px"></div>
      <div class="skel-line" style="width:60px;height:12px"></div>
      <div class="skel-line" style="width:60px;height:12px"></div>
    </div>
    <div class="api-rows">
      ${[
        [160, 64],
        [150, 58],
        [190, 52],
        [140, 60],
      ].map(([a,b])=>[a,b])
        .map(
          ([w1, w2]) => `<div class="api-row">
            <div class="skel-stack" style="width:${w1}px">
              <div class="skel-line" style="width:100%;height:13px"></div>
              <div class="skel-line" style="width:70%;height:11px"></div>
            </div>
            <div class="skel-line" style="width:${w2}px;height:23px"></div>
          </div>`,
        )
        .join('')}
    </div>
  </div>`

const volumeChart = (buckets, res) => {
  const max = Math.max(1, ...buckets.map((b) => Number(b.searches)))
  const total = buckets.reduce((a, b) => a + Number(b.searches), 0)

  const cols = buckets
    .map((b, i) => {
      const n = Number(b.searches)
      const height = n === 0 ? 2 : Math.max(6, (n / max) * 100)
      const problema = Number(b.partial) > 0
      const rotulo = res === 'dia' ? diaCurto(b.hour) : `${horaDe(b.hour)}h`

      const showLabel = res === 'dia' || i % 4 === 0 || i === buckets.length - 1
      const data =
        `${rotulo} · ${um(n)} ${n === 1 ? 'busca' : 'buscas'}` +
        (b.clicks ? ` · ${um(b.clicks)} cliques` : '') +
        (b.cache_hits ? ` · ${um(b.cache_hits)} do cache` : '') +
        (problema ? ` · ${um(b.partial)} com provider fora` : '')
      return `<div class="vol-col ${n === 0 ? 'is-empty' : ''}" data-tip="${data}">
        <div class="vol-bar ${problema ? 'has-problem' : ''}" style="height:${height}%"></div>
        <span class="vol-label">${showLabel ? rotulo : ''}</span>
      </div>`
    })
    .join('')

  const ticks = [max, Math.round(max / 2), 0]

  return `
    <div class="chart-wrap">
      <div class="chart-y">${ticks.map((t) => `<span>${um(t)}</span>`).join('')}</div>
      <div class="chart-plot">
        <div class="chart-grid"><span></span><span></span><span></span></div>
        <div class="vol-cols">${cols}</div>
      </div>
    </div>
    <div class="chart-foot">
      <span>${um(total)} buscas no período · pico de ${um(max)} por ${res}</span>
      <span class="chart-legend"><i class="dot-problem"></i>provider com falha</span>
    </div>`
}

const apiSignals = (t) => {
  const { ok, client_error, server_error } = t.requests
  const total = ok + client_error + server_error
  const erroPct = t.error_rate

  const lat = (rotulo, dica, valor) =>
    `<div class="api-row">
      <span class="api-label">${rotulo} <small>${dica}</small></span>
      <span class="api-value">${ms(valor)}</span>
    </div>`

  return `
    <div class="panel-head">
      <h3 class="dash-title">Sinais da API</h3>
      <span class="panel-sub">${um(total)} requisições medidas</span>
    </div>

    ${
      total > 0
        ? `<div class="error-split" role="img" aria-label="Taxa de erro ${pct(erroPct)}">
            <div class="err-seg ok" style="width:${(ok / total) * 100}%"></div>
            <div class="err-seg client" style="width:${(client_error / total) * 100}%"></div>
            <div class="err-seg server" style="width:${(server_error / total) * 100}%"></div>
          </div>
          <div class="error-legend">
            <span><i class="dot ok"></i>2xx · ${um(ok)}</span>
            <span><i class="dot client"></i>4xx · ${um(client_error)}</span>
            <span><i class="dot server"></i>5xx · ${um(server_error)}</span>
          </div>`
        : `<div class="panel-empty">Sem requisições nesta janela — zerar aqui é ausência de dado, não de erro.</div>`
    }

    <div class="api-rows">
      ${lat('p50', 'metade das buscas', t.p50_ms)}
      ${lat('p95', 'as 5% mais lentas', t.p95_ms)}
      <div class="api-row">
        <span class="api-label">Cache <small>respostas servidas sem ir aos providers</small></span>
        <span class="api-value">${pct(t.cache_hit_rate)}</span>
      </div>
      <div class="api-row">
        <span class="api-label">Degradação <small>buscas com algum provider fora</small></span>
        <span class="api-value ${t.partial_rate != null && t.partial_rate > 5 ? 'warn' : ''}">${pct(t.partial_rate)}</span>
      </div>
    </div>`
}

const providerPanel = (providers, clicks) => {
  const porClique = [...providers].sort((x, y) => Number(y.wins) - Number(x.wins))
  const max = Math.max(1, ...porClique.map((p) => Number(p.wins)))
  const total = porClique.reduce((a, p) => a + Number(p.wins), 0)

  const rows = porClique
    .map((p) => {
      const meta = PROVIDER[p.provider] ?? { cor: 'var(--muted)', nome: p.provider }
      const share = total > 0 ? (Number(p.wins) / total) * 100 : 0
      const width = total > 0 ? Math.max(2, (Number(p.wins) / max) * 100) : 0
      const topo =
        p.algorithm_wins == null
          ? ''
          : `<small class="prov-algo" data-tip="Ofertas escolhidas pelo algoritmo em todo o histórico">${um(p.algorithm_wins)} no topo</small>`
      return `<div class="prov-row">
        <div class="prov-top">
          <span class="prov-name"><i class="prov-dot" style="background:${meta.cor}"></i>Provider ${meta.nome}</span>
          <span class="prov-count">${um(p.wins)} <small>${total > 0 ? `${share.toFixed(0)}%` : '—'}</small></span>
        </div>
        <div class="prov-track"><span class="prov-fill" style="width:${width}%;background:${meta.cor}"></span></div>
        ${topo ? `<div class="prov-foot">${topo}</div>` : ''}
      </div>`
    })
    .join('')

  const temClique = total > 0
  const temTopo = providers.some((p) => p.algorithm_wins != null)

  return `
    <div class="panel-head">
      <h3 class="dash-title">Cliques por provider</h3>
      <span class="panel-sub">${um(clicks)} ${clicks === 1 ? 'oferta aberta' : 'ofertas abertas'} na janela${
        temTopo ? ' · ofertas no topo no histórico' : ''
      }</span>
    </div>
    ${
      temClique || temTopo
        ? `<div class="prov-rows">${rows}</div>`
        : `<div class="panel-empty">Nenhuma oferta foi aberta ainda. A contagem quebra por provider assim que o primeiro clique chegar.</div>`
    }`
}

const routesPanel = (routes) => {
  const max = Math.max(1, ...routes.map((r) => Number(r.searches)))
  const rows = routes
    .map(
      (r) => `<div class="route-row" data-tip="${r.route} · ${um(r.searches)} buscas${
        r.avg_latency == null ? '' : ` · média ${ms(r.avg_latency)}`
      }">
        <span class="route-name">${r.route}</span>
        <span class="route-track"><span class="route-fill" style="width:${(Number(r.searches) / max) * 100}%"></span></span>
        <span class="route-num">${um(r.searches)}</span>
        <span class="route-lat">${r.avg_latency == null ? '—' : `${nf.format(r.avg_latency)}<small>ms</small>`}</span>
      </div>`,
    )
    .join('')

  return `
    <div class="panel-head">
      <h3 class="dash-title">Rotas mais buscadas</h3>
      <span class="panel-sub">buscas · latência média</span>
    </div>
    ${
      routes.length > 0
        ? `<div class="route-rows">${rows}</div>`
        : `<div class="panel-empty">Nenhuma rota buscada nesta janela.</div>`
    }`
}

const dashHead = (d, window) => `
  <div class="dash-head">
    <div class="seg" role="tablist" aria-label="Janela de tempo">
      <button class="seg-btn ${window === 24 ? 'active' : ''}" data-window="24h">24h</button>
      <button class="seg-btn ${window === 168 ? 'active' : ''}" data-window="7d">7 dias</button>
    </div>
    <span class="dash-badge" data-tip="${
      d.source === 'redis'
        ? 'Redis: buscas, cliques e falhas contadas na janela.'
        : 'Postgres: buscas, rotas e latência; cliques e receita vêm do Redis.'
    }">${d.source === 'redis' ? 'Redis' : 'Postgres'}</span>
  </div>`

const render = (el, d) => {
  const t = d.totals
  const buscas = Number(t.searches ?? 0)
  const cliques = Number(t.clicks ?? 0)
  const receita = Number(t.projected_revenue ?? 0)

  const semAmostra = buscas > 0 && t.p50_ms == null

  el.innerHTML = `
    ${dashHead(d, d.window)}

    <section class="dash-hero">
      <div class="hero-main">
        <span class="hero-label">Receita projetada</span>
        <strong class="hero-value">${formatBRL(receita)}</strong>
        <span class="hero-note">comissão estimada na janela${
          t.commission_per_search != null
            ? ` · ${formatBRL(t.commission_per_search)} por clique`
            : ''
        }</span>
      </div>
      <div class="hero-side">
        <div class="hero-stat">
          <span class="hero-label">Buscas</span>
          <strong>${um(buscas)}</strong>
        </div>
        <div class="hero-stat">
          <span class="hero-label">Cliques</span>
          <strong>${um(cliques)}</strong>
        </div>
        <div class="hero-stat">
          <span class="hero-label">Cliques / busca</span>
          <strong>${t.clicks_per_search == null ? '—' : t.clicks_per_search.toLocaleString('pt-BR')}</strong>
        </div>
      </div>
    </section>

    <div class="dash-panel chart-panel">
      <div class="panel-head">
        <h3 class="dash-title">Buscas por ${d.resolution}</h3>
        <span class="panel-sub">${d.resolution === 'hora' ? 'últimas 24 horas' : 'últimos 7 dias'} · horário de Brasília</span>
      </div>
      ${volumeChart(d.buckets, d.resolution)}
    </div>

    <div class="dash-cols">
      <div class="dash-panel">${providerPanel(d.providers, cliques)}</div>
      <div class="dash-panel">${routesPanel(d.routes)}</div>
    </div>

    <div class="dash-panel api-panel">${apiSignals(t)}</div>

    ${
      semAmostra
        ? `<div class="panel-note">Latência: sem amostra suficiente para percentil nesta janela. ${
            d.source === 'redis' ? 'O p50/p95 completo sai do Postgres.' : ''
          }</div>`
        : ''
    }
  `
}

const state = { window: 24 }

export const loadMetrics = async () => {
  const el = $('#dashboard-body')
  el.innerHTML = dashboardSkeleton()

  try {
    const res = await fetch(`/insights/data?window=${state.window === 24 ? '24h' : '7d'}`)
    if (!res.ok) {
      el.innerHTML = `<div class="empty-state">
        <svg width="34" height="34"><use href="#i-ghost"/></svg>
        <strong>Insights indisponíveis</strong>
        <span>Os contadores vivem no Redis — sem cache não há o que agregar.</span>
      </div>`
      return
    }

    render(el, await res.json())

    el.querySelectorAll('[data-window]').forEach((btn) =>
      btn.addEventListener('click', () => {
        const w = btn.dataset.window === '7d' ? 168 : 24
        if (w === state.window) return
        state.window = w
        loadMetrics()
      }),
    )
  } catch {
    el.innerHTML = '<div class="card">Falha ao contatar o agregador.</div>'
  }
}

$('#metrics-refresh')?.addEventListener('click', loadMetrics)