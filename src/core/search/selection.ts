// Types
import type { FlightOffer } from './types.js'

export const PREMIUM_PCT = 0.05
export const PREMIUM_ABS = 30

export const STRATEGY_NAME = 'commission_guarded'

export type CommissionTable = Record<string, { commission: number }>

export type Selection = {
  offer: FlightOffer
  reason: string
}

export const commissionOf = (
  offer: FlightOffer,
  table: CommissionTable,
): number => offer.price * (table[offer.provider]?.commission ?? 0)

const lowestPrice = (offers: FlightOffer[]): FlightOffer =>
  offers.reduce((best, offer) => (offer.price < best.price ? offer : best))

const maxCommission = (
  offers: FlightOffer[],
  table: CommissionTable,
): FlightOffer =>
  offers.reduce((best, offer) =>
    commissionOf(offer, table) > commissionOf(best, table) ? offer : best,
  )

export const select = (
  offers: FlightOffer[],
  table: CommissionTable,
): Selection => {
  if (offers.length === 1) {
    return { offer: offers[0]!, reason: 'única oferta' }
  }

  const cheapest = lowestPrice(offers)
  const ceiling = Math.min(cheapest.price * PREMIUM_PCT, PREMIUM_ABS)
  const allowed = offers.filter(o => o.price - cheapest.price <= ceiling)
  const chosen = maxCommission(allowed, table)

  if (chosen.price > cheapest.price) {
    const premium = chosen.price - cheapest.price
    return {
      offer: chosen,
      reason: `maior comissão permitida (+R$${premium.toFixed(2)} sobre a mais barata)`,
    }
  }

  const best = maxCommission(offers, table)

  if (chosen !== best) {
    return {
      offer: chosen,
      reason: `guarda de preço: maior comissão custaria +R$${(best.price - cheapest.price).toFixed(2)}`,
    }
  }

  return { offer: chosen, reason: 'maior comissão sem custo ao cliente' }
}

export const selectLowestPrice = (offers: FlightOffer[]): Selection => ({
  offer: lowestPrice(offers),
  reason: 'menor preço',
})

export const selectMaxCommission = (
  offers: FlightOffer[],
  table: CommissionTable,
): Selection => ({
  offer: maxCommission(offers, table),
  reason: 'maior comissão',
})