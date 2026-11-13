export const $ = (sel) => document.querySelector(sel)

export const formatBRL = (value) =>
  value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

export const formatTime = (iso) => iso.slice(11, 16)

export const formatBRDate = (iso) => {
  if (!iso) return '—'
  const [y, m, d] = iso.split('-')
  return `${d}/${m}/${y.slice(2)}`
}

export const todayISO = () => new Date().toISOString().slice(0, 10)

export const durationOf = (dep, arr) => {
  const mins = Math.round((new Date(arr) - new Date(dep)) / 60000)
  return `${Math.floor(mins / 60)}h${String(mins % 60).padStart(2, '0')}`
}
