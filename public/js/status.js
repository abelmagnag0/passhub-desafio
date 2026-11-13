import { $ } from './helpers.js'

const COMPONENT_LABELS = {
  aggregator: 'Agregador (API)',
  redis: 'Redis (cache)',
  postgres: 'Postgres (busca e funil)',
  'provider-a': 'Provider A',
  'provider-b': 'Provider B',
  'provider-c': 'Provider C',
}

const STATUS_LABEL = {
  up: 'Operacional',
  partial: 'Operacional',
  down: 'Indisponível',
  nodata: 'Sem dados',
}

const toLocal = (iso) => new Date(`${iso}:00:00Z`)

const hourLabel = (iso) =>
  `${String(toLocal(iso).getHours()).padStart(2, '0')}h`

const fullLabel = (iso) => {
  const d = toLocal(iso)
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')} ${hourLabel(iso)}`
}

const statusSkeleton = () => `
  ${Array.from({ length: 6 })
    .map(
      () => `<article class="status-card">
        <header class="status-card-head">
          <div class="skel-line" style="width:110px;height:12px"></div>
          <div class="skel-line" style="width:88px;height:20px;border-radius:999px"></div>
        </header>
        <div class="velas">
          ${Array.from({ length: 24 })
            .map(() => '<i class="vela nodata"></i>')
            .join('')}
        </div>
        <footer class="status-card-foot">
          <div class="skel-line" style="width:70px;height:11px"></div>
          <div class="skel-line" style="width:96px;height:11px"></div>
        </footer>
        <div class="marcas"></div>
      </article>`,
    )
    .join('')}`

export const loadHealth = async () => {
  const el = $('#status-rows')

  el.innerHTML = statusSkeleton()

  try {
    const [{ components, hours }] = await Promise.all([
      fetch('/health/history').then((r) => r.json()),
      fetch('/health'),
    ])

    el.innerHTML = components
      .map((c) => {
        const pill =
          c.current === 'up'
            ? '<span class="status-pill up">● Operacional</span>'
            : c.current === 'down'
              ? '<span class="status-pill down">● Indisponível</span>'
              : '<span class="status-pill nodata">○ Sem dados</span>'

        const comDado = c.slots.filter((s) => s.status !== 'nodata').length

        const velas = c.slots
          .map((s, i) => {
            const atual = i === c.slots.length - 1
            const titulo = `${fullLabel(s.hour)} — ${STATUS_LABEL[s.status]}`
            return `<i class="vela ${s.status}${atual ? ' atual' : ''}" title="${titulo}"></i>`
          })
          .join('')

        const marcas = c.slots
          .map((s, i) => {
            const passo = Math.floor(c.slots.length / 4)
            return i % passo === 0
              ? `<span>${hourLabel(s.hour)}</span>`
              : ''
          })
          .join('')

        return `<article class="status-card">
          <header class="status-card-head">
            <span class="name">${COMPONENT_LABELS[c.component] ?? c.component}</span>
            ${pill}
          </header>
          <div class="velas">${velas}</div>
          <footer class="status-card-foot">
            <span>${c.uptime === null ? 'sem dados' : `${c.uptime}% uptime`}</span>
            <span class="muted">${comDado}h de ${hours}h registradas</span>
          </footer>
          <div class="marcas">${marcas}</div>
        </article>`
      })
      .join('')
  } catch {
    el.innerHTML = '<div class="card">Falha ao contatar o agregador.</div>'
  }
}

$('#health-refresh').addEventListener('click', loadHealth)
