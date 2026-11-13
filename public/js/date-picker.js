import { $, formatBRDate, todayISO } from './helpers.js'

export const tripState = {
  depart: plusDaysISO(7),
}

function plusDaysISO(days) {
  return new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10)
}

const MONTHS = [
  'janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
  'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro',
]
const DOWS = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S']

let pickerEl = null
let pickerTarget = null
let pickerMonth = new Date()

const closePicker = () => {
  pickerEl?.remove()
  pickerEl = null
  pickerTarget = null
}

const openPicker = (target) => {
  closePicker()
  pickerTarget = target
  pickerMonth = new Date()
  pickerEl = document.createElement('div')
  pickerEl.className = 'date-picker'
  $('#date-depart-wrap').appendChild(pickerEl)
  renderPicker()
  pickerEl.addEventListener('click', (e) => e.stopPropagation())
}

const renderPicker = () => {
  const year = pickerMonth.getFullYear()
  const month = pickerMonth.getMonth()
  const first = new Date(year, month, 1)
  const startOffset = first.getDay()
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const minISO = todayISO()
  const value = tripState.depart

  let grid = DOWS.map((d) => `<span class="dp-dow">${d}</span>`).join('')
  for (let i = 0; i < startOffset; i++) grid += '<button class="dp-day other" disabled></button>'
  for (let day = 1; day <= daysInMonth; day++) {
    const iso = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
    const disabled = iso < minISO
    const selected = iso === value ? 'selected' : ''
    grid += `<button class="dp-day ${selected}" data-iso="${iso}" ${disabled ? 'disabled' : ''}>${day}</button>`
  }

  const currentMonth = new Date()
  const canGoBack =
    year > currentMonth.getFullYear() ||
    (year === currentMonth.getFullYear() && month > currentMonth.getMonth())

  pickerEl.innerHTML = `
    <div class="dp-head">
      <button class="dp-nav" id="dp-prev" ${canGoBack ? '' : 'disabled'}>‹</button>
      <span class="dp-title">${MONTHS[month]} ${year}</span>
      <button class="dp-nav" id="dp-next">›</button>
    </div>
    <div class="dp-grid">${grid}</div>`

  $('#dp-prev').addEventListener('click', () => {
    pickerMonth = new Date(year, month - 1, 1)
    renderPicker()
  })
  $('#dp-next').addEventListener('click', () => {
    pickerMonth = new Date(year, month + 1, 1)
    renderPicker()
  })
  pickerEl.querySelectorAll('.dp-day[data-iso]').forEach((btn) =>
    btn.addEventListener('click', () => {
      const iso = btn.dataset.iso
      tripState.depart = iso
      renderDateButtons()
      closePicker()
    }),
  )
}

const minISO = () => todayISO()

export const renderDateButtons = () => {
  $('#date-depart-btn').textContent = formatBRDate(tripState.depart)
  $('#date').value = tripState.depart
}

renderDateButtons()

$('#date-depart-btn').addEventListener('click', (e) => {
  e.stopPropagation()
  pickerTarget === 'depart' ? closePicker() : openPicker('depart')
})
document.addEventListener('click', closePicker)
