const tip = document.createElement('div')
tip.className = 'tooltip'
tip.id = 'tooltip'
tip.setAttribute('role', 'tooltip')
document.body.appendChild(tip)

const TIP_GAP = 8
const TIP_EDGE = 8

let tipOwner = null

const hideTip = () => {
  tip.classList.remove('visible')
  tipOwner?.removeAttribute('aria-describedby')
  tipOwner = null
}

const showTip = (el) => {
  const text = el.dataset.tip
  if (!text) return
  tipOwner = el
  el.setAttribute('aria-describedby', tip.id)

  tip.textContent = text
  tip.dataset.placement = 'top'
  tip.style.left = '0px'
  tip.style.top = '0px'
  tip.classList.add('visible')

  const r = el.getBoundingClientRect()
  const t = tip.getBoundingClientRect()

  const above = r.top - TIP_GAP - t.height >= TIP_EDGE
  const below = r.bottom + TIP_GAP + t.height <= innerHeight - TIP_EDGE
  const placement = !above && below ? 'bottom' : 'top'
  tip.dataset.placement = placement

  const top =
    placement === 'top' ? r.top - TIP_GAP - t.height : r.bottom + TIP_GAP

  const center = r.left + r.width / 2
  const left = Math.min(
    Math.max(center - t.width / 2, TIP_EDGE),
    innerWidth - TIP_EDGE - t.width,
  )

  tip.style.top = `${top}px`
  tip.style.left = `${left}px`

  const arrowX = Math.min(Math.max(center - left, 12), t.width - 12)
  tip.style.setProperty('--arrow-x', `${arrowX}px`)
}

document.querySelectorAll('[data-tip]').forEach((el) => {
  el.addEventListener('focus', () => showTip(el))
  el.addEventListener('blur', hideTip)
})

let tipRaf = 0
document.addEventListener('pointermove', (e) => {
  if (tipRaf) return
  tipRaf = requestAnimationFrame(() => {
    tipRaf = 0
    const el = document.elementFromPoint(e.clientX, e.clientY)?.closest('[data-tip]')
    if (el === tipOwner) return
    if (el) showTip(el)
    else hideTip()
  })
})

document.addEventListener('pointerleave', hideTip)

addEventListener('scroll', hideTip, { passive: true, capture: true })
addEventListener('resize', hideTip)

