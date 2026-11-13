import { $, formatBRL, formatTime, formatBRDate, durationOf } from './helpers.js'
import { resolveAirport, originField, destinationField } from './airports.js'
import { showSummary } from './summary.js'
import { renderRecent, getRecent, saveRecent } from './recent-searches.js'

$('#search-form').addEventListener('submit', async (event) => {
  event.preventDefault()

  const payload = {
    origin: (resolveAirport(originField, 'origin') ?? '').toUpperCase(),
    destination: (resolveAirport(destinationField, 'destination') ?? '').toUpperCase(),
    date: $('#date').value,
  }

  if (!/^[A-Z]{3}$/.test(payload.origin) || !/^[A-Z]{3}$/.test(payload.destination)) {
    setStatus('Selecione um aeroporto da lista ou digite uma sigla de 3 letras.', 'bad')
    return
  }

  const button = $('#btn-search')
  button.disabled = true
  setStatus('Buscando voos…', '')
  renderSkeletons()

  try {
    const res = await fetch('/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    const body = await res.json()

    if (!res.ok) {
      const first = Object.values(body.details ?? {})[0]?.[0] ?? body.error
      setStatus(`Erro: ${first}`, 'bad')
      return
    }

    saveRecent(payload)
    renderRecent()

    lastRoute = `${payload.origin} → ${payload.destination}`
    lastRequestId = body.requestId ?? ''
    renderResults(body)
    $('#results-count').textContent =
      `${body.flights.length} voos encontrados para ${formatBRDate(payload.date)}` +
      (body.meta.partial ? ' · alguns provedores estão fora do ar' : '')
    $('#results-head').classList.remove('hidden')
    setStatus('', '')
  } catch {
    setStatus('Falha de rede ao contatar o agregador.', 'bad')
  } finally {
    button.disabled = false
  }
})

const setStatus = (message, kind) => {
  const el = $('#search-status')
  el.textContent = message
  el.className = `status-bar ${kind}`
}

let lastFlights = []
let lastRoute = ''

let lastRequestId = ''
const filters = { period: 'all', airline: 'all' }

const periodOf = (iso) => {
  const h = Number(iso.slice(11, 13))
  if (h < 12) return 'morning'
  if (h < 18) return 'afternoon'
  return 'night'
}

const flightSkeleton = () => `
  <div class="flight-card skeleton" aria-hidden="true">
    <div class="skel-line" style="width:30px;height:30px;border-radius:8px"></div>
    <div style="display:flex;flex-direction:column;gap:7px;width:120px">
      <div class="skel-line" style="width:74px;height:11px"></div>
      <div class="skel-line" style="width:96px;height:9px"></div>
    </div>
    <div style="display:flex;align-items:center;gap:14px;flex:1">
      <div class="skel-line" style="width:42px;height:15px"></div>
      <div class="skel-line" style="flex:1;height:2px"></div>
      <div class="skel-line" style="width:42px;height:15px"></div>
    </div>
    <div style="display:flex;flex-direction:column;gap:6px;align-items:flex-end">
      <div class="skel-line" style="width:66px;height:16px"></div>
      <div class="skel-line" style="width:76px;height:9px"></div>
    </div>
  </div>`

const renderSkeletons = () => {
  $('#results-head').classList.remove('hidden')
  $('#results').classList.remove('hidden')
  $('#results').innerHTML = Array.from({ length: 8 }, flightSkeleton).join('')
}

const emptyState = (title, hint) =>
  `<div class="empty-state">
    <svg width="34" height="34"><use href="#i-plane"/></svg>
    <strong>${title}</strong>
    <span>${hint}</span>
  </div>`

const renderCards = () => {
  const flights = lastFlights.filter(
    (f) =>
      (filters.period === 'all' || periodOf(f.departure) === filters.period) &&
      (filters.airline === 'all' || f.airline === filters.airline),
  )

  if (flights.length === 0) {
    $('#results').innerHTML = emptyState(
      'Nenhum voo com esses filtros',
      'Tente outro período ou companhia aérea.',
    )
    return
  }

  $('#results').innerHTML = flights
    .map(
      (f) => `<button class="flight-card" data-flight="${lastFlights.indexOf(f)}">
      <span class="airline-badge">${f.airline}</span>
      <span class="flight-times">
        <span class="flight-time">${formatTime(f.departure)} → ${formatTime(f.arrival)}</span>
        <span class="flight-duration">${durationOf(f.departure, f.arrival)}</span>
      </span>
      <span class="flight-price">${formatBRL(f.price)}</span>
    </button>`,
    )
    .join('')

  $('#results').querySelectorAll('.flight-card').forEach((card) =>
    card.addEventListener('click', () => {
      $('#results')
        .querySelectorAll('.flight-card')
        .forEach((c) => c.classList.remove('selected'))
      card.classList.add('selected')
      const flight = lastFlights[Number(card.dataset.flight)]
      showSummary(flight)

      void fetch('/events', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          type: 'click',
          provider: flight.provider,
          price: flight.price,
          route: lastRoute,
          requestId: lastRequestId,
        }),
      }).catch(() => {})
    }),
  )
}

const populateAirlineFilter = (flights) => {
  const select = $('#filter-airline')
  const airlines = [...new Set(flights.map((f) => f.airline))].sort()
  const current = select.value
  select.innerHTML =
    '<option value="all">Todas as companhias</option>' +
    airlines.map((a) => `<option value="${a}">${a}</option>`).join('')
  if (airlines.includes(current)) select.value = current
}

const renderResults = ({ flights }) => {
  lastFlights = flights
  filters.period = 'all'
  filters.airline = 'all'
  $('#filter-period').value = 'all'
  populateAirlineFilter(flights)

  if (flights.length === 0) {
    $('#results-head').classList.add('hidden')
    $('#results').classList.remove('hidden')
    $('#results').innerHTML = emptyState(
      'Nenhuma oferta encontrada',
      'Não há voos disponíveis para esta rota e data nos provedores consultados.',
    )
    return
  }

  renderCards()
}

$('#filter-period').addEventListener('change', (e) => {
  filters.period = e.target.value
  renderCards()
})

$('#filter-airline').addEventListener('change', (e) => {
  filters.airline = e.target.value
  renderCards()
})
