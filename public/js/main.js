import './tooltip.js'
import './airports.js'
import './date-picker.js'
import './recent-searches.js'
import './search.js'
import { loadHealth } from './status.js'
import { loadMetrics } from './dashboard.js'
import { loadTelemetry } from './telemetry.js'
import { $ } from './helpers.js'

const TABS = {
  metricas: '/dashboard',
  saude: '/status',
  telemetria: '/telemetria',
  busca: '/cotacoes',
}
const TITLES = {
  busca: 'PassHub — Cotar valores',
  metricas: 'PassHub — Dashboard',
  saude: 'PassHub — Status do sistema',
  telemetria: 'PassHub — Telemetria',
}

const tabFromPath = (path) =>
  Object.entries(TABS).find(([, route]) => route === path)?.[0] ?? 'busca'

const showTab = (name, { push = true } = {}) => {
  document.querySelectorAll('.nav-item[data-nav]').forEach((a) =>
    a.classList.toggle('active', a.dataset.nav === name),
  )
  document.querySelectorAll('.tab').forEach((t) => t.classList.remove('active'))
  $(`#tab-${name}`).classList.add('active')
  $('.content-area').classList.toggle('show-summary', name === 'busca')

  document.title = TITLES[name]
  if (push && location.pathname !== TABS[name]) {
    history.pushState({ tab: name }, '', TABS[name])
  }

  if (name === 'saude') loadHealth()
  if (name === 'metricas') loadMetrics()
  if (name === 'telemetria') loadTelemetry()
}

document.querySelectorAll('[data-nav]').forEach((el) =>
  el.addEventListener('click', (e) => {
    e.preventDefault()
    showTab(el.dataset.nav)
  }),
)

addEventListener('popstate', (e) =>
  showTab(e.state?.tab ?? tabFromPath(location.pathname), { push: false }),
)

$('.logo')?.addEventListener('click', (e) => {
  e.preventDefault()
  showTab('busca')
})

const initialTab = tabFromPath(location.pathname)
history.replaceState({ tab: initialTab }, '', TABS[initialTab])
document.querySelectorAll('.nav-item[data-nav]').forEach((a) =>
  a.classList.toggle('active', a.dataset.nav === initialTab),
)
document.querySelectorAll('.tab').forEach((t) => t.classList.remove('active'))
$(`#tab-${initialTab}`).classList.add('active')
$('.content-area').classList.toggle('show-summary', initialTab === 'busca')
document.title = TITLES[initialTab]

if (initialTab === 'saude') loadHealth()
if (initialTab === 'metricas') loadMetrics()
if (initialTab === 'telemetria') loadTelemetry()

const gateSize = $('#gate-size')
if (gateSize) {
  const update = () => {
    gateSize.textContent = `${window.innerWidth}px`
  }
  update()
  addEventListener('resize', update)
}
