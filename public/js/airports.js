import { $ } from './helpers.js'

let AIRPORTS = []

export const getAirports = () => AIRPORTS
fetch('/airports.json')
  .then((r) => r.json())
  .then((data) => (AIRPORTS = data))

const normalize = (s) =>
  s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()

const searchAirports = (query) => {
  const q = normalize(query.trim())
  if (q.length < 2) return []
  const starts = []
  const contains = []
  for (const a of AIRPORTS) {
    const hay = normalize(`${a.iata} ${a.city} ${a.name}`)
    const city = normalize(a.city)
    if (normalize(a.iata).startsWith(q) || city.startsWith(q)) starts.push(a)
    else if (hay.includes(q)) contains.push(a)
    if (starts.length >= 8) break
  }
  return [...starts, ...contains].slice(0, 8)
}

const setupAirportField = (inputId, listId, tagId) => {
  const input = $(`#${inputId}`)
  const list = $(`#${listId}`)
  const tag = $(`#${tagId}`)
  const tagText = tag.querySelector('.airport-tag-text')
  let selected = null

  const close = () => list.classList.add('hidden')

  const showTag = (airport) => {
    input.classList.add('hidden')
    tag.classList.remove('hidden')
    tagText.innerHTML = `<b>(${airport.iata})</b> ${airport.city}, ${airport.name.replace(' Airport', '')}`
  }

  const showInput = () => {
    tag.classList.add('hidden')
    input.classList.remove('hidden')
    input.value = ''
    input.focus()
  }

  tag.querySelector('.tag-x').addEventListener('click', () => {
    selected = null
    showInput()
  })

  const render = (options) => {
    if (options.length === 0) {
      list.innerHTML = '<div class="airport-empty">Nenhum aeroporto encontrado</div>'
      list.classList.remove('hidden')
      return
    }
    list.innerHTML = options
      .map(
        (a) => `<div class="airport-option" data-iata="${a.iata}">
          <span class="iata">${a.iata}</span>
          <span class="meta">
            <div class="city">${a.city}</div>
            <div class="sub">${a.name} · ${a.country}</div>
          </span>
        </div>`,
      )
      .join('')
    list.classList.remove('hidden')
    list.querySelectorAll('.airport-option').forEach((el) =>
      el.addEventListener('mousedown', (e) => {
        e.preventDefault()
        const airport = AIRPORTS.find((a) => a.iata === el.dataset.iata)
        selected = airport
        showTag(airport)
        close()
      }),
    )
  }

  input.addEventListener('input', () => {
    selected = null
    render(searchAirports(input.value))
  })

  input.addEventListener('focus', () => {
    if (input.value && !selected) render(searchAirports(input.value))
  })

  input.addEventListener('blur', () => setTimeout(close, 150))

  input.addEventListener('change', () => {
    const v = input.value.trim().toUpperCase()
    if (selected || v.length !== 3) return
    const known = AIRPORTS.find((a) => a.iata === v)
    if (known) {
      selected = known
      showTag(known)
    }
  })

  return {
    getIata: () => selected?.iata ?? input.value.trim().toUpperCase(),
    setAirport: (airport) => {
      selected = airport
      showTag(airport)
    },
    clear: () => {
      selected = null
      showInput()
    },
    getSelected: () => selected,
  }
}

export const originField = setupAirportField('origin', 'origin-list', 'origin-tag')
export const destinationField = setupAirportField('destination', 'destination-list', 'destination-tag')

export const resolveAirport = (field, inputId) => {
  const typed = $(`#${inputId}`).value.trim()
  const chosen = field.getIata()
  if (chosen && /^[A-Z]{3}$/.test(chosen) && !$(`#${inputId}`).classList.contains('hidden')) {
    if (typed.length === 3) return typed.toUpperCase()
    const best = searchAirports(typed)[0]
    if (best) {
      field.setAirport(best)
      return best.iata
    }
    return null
  }
  return chosen || null
}

$('#swap').addEventListener('click', () => {
  const resolveObj = (field, inputId) => {
    const selected = field.getSelected()
    if (selected) return selected
    const typed = $(`#${inputId}`).value.trim().toUpperCase()
    if (/^[A-Z]{3}$/.test(typed)) return AIRPORTS.find((a) => a.iata === typed) ?? { iata: typed, city: typed, name: '', country: '' }
    return null
  }
  const a = resolveObj(originField, 'origin')
  const b = resolveObj(destinationField, 'destination')
  if (a) destinationField.setAirport(a)
  else destinationField.clear()
  if (b) originField.setAirport(b)
  else originField.clear()
})
