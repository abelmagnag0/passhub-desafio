import { $, formatBRL, formatTime, formatBRDate, durationOf } from './helpers.js'

export const showSummary = (f) => {
  $('#summary-empty').classList.add('hidden')
  const body = $('#summary-body')
  body.classList.remove('hidden')

  body.innerHTML = `
    <div class="summary-flight">
      <span class="airline-badge">${f.airline}</span>
      <span class="summary-date">${formatBRDate(f.flightDate)}</span>
    </div>
    <div class="summary-route">
      <div class="summary-point">
        <span class="summary-time">${formatTime(f.departure)}</span>
        <span class="summary-city">partida</span>
      </div>
      <div class="summary-line">
        <span class="summary-duration">${durationOf(f.departure, f.arrival)}</span>
      </div>
      <div class="summary-point">
        <span class="summary-time">${formatTime(f.arrival)}</span>
        <span class="summary-city">chegada</span>
      </div>
    </div>
    <div class="summary-price">
      <span class="summary-price-label">Tarifa por passageiro</span>
      <span class="summary-price-value">${formatBRL(f.price).replace(/,\d{2}$/, (c) => `<small>${c}</small>`)}</span>
    </div>
    <button class="summary-cta" disabled data-tip="Funcionalidade em desenvolvimento">
      Gerar link de venda
    </button>`
}
