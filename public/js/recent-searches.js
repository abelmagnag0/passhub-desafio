import { $, formatBRDate } from './helpers.js'
import { getAirports, originField, destinationField } from './airports.js'
import { tripState, renderDateButtons } from './date-picker.js'

const RECENT_KEY = 'passhub_recent'
export const getRecent = () => JSON.parse(localStorage.getItem(RECENT_KEY) ?? '[]')

export const saveRecent = (payload) => {
  const recent = getRecent().filter(
    (r) => !(r.origin === payload.origin && r.destination === payload.destination),
  )
  recent.unshift(payload)
  localStorage.setItem(RECENT_KEY, JSON.stringify(recent.slice(0, 4)))
}

export const renderRecent = () => {
  const list = $('#recent-list')
  list.innerHTML = getRecent()
    .map(
      (r) =>
        `<button class="recent-chip" data-o="${r.origin}" data-d="${r.destination}" data-t="${r.date}">${r.origin} → ${r.destination}</button>`,
    )
    .join('')
  list.querySelectorAll('.recent-chip').forEach((chip) =>
    chip.addEventListener('click', () => {
      const o = getAirports().find((a) => a.iata === chip.dataset.o)
      const d = getAirports().find((a) => a.iata === chip.dataset.d)
      if (o) originField.setAirport(o)
      if (d) destinationField.setAirport(d)
      tripState.depart = chip.dataset.t
      renderDateButtons()
      $('#search-form').requestSubmit()
    }),
  )
}
$('#recent-clear').addEventListener('click', () => {
  localStorage.removeItem(RECENT_KEY)
  renderRecent()
})
