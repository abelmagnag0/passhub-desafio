// Dependencies
import { z } from 'zod'

// Types
import type { FlightOffer } from './types.js'

export const strategySchema = z.enum([
  'commission_guarded',
  'lowest_price',
  'max_commission',
])
export type Strategy = z.infer<typeof strategySchema>

export const PREMIUM_PCT = 0.05
export const PREMIUM_ABS = 30

export type CommissionTable = Record<string, { commission: number }>

type Selection = {
  offer: FlightOffer
  reason: string
}

const commissionOf = (
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
  strategy: Strategy,
  table: CommissionTable,
): Selection => {
  if (offers.length === 1) {
    return { offer: offers[0]!, reason: 'única oferta' }
  }

  if (strategy === 'lowest_price') {
    return { offer: lowestPrice(offers), reason: 'menor preço' }
  }

  const bestCommission = maxCommission(offers, table)

  if (strategy === 'max_commission') {
    return { offer: bestCommission, reason: 'maior comissão' }
  }

  const cheapest = lowestPrice(offers)
  const ceiling = Math.min(cheapest.price * PREMIUM_PCT, PREMIUM_ABS)
  const premium = bestCommission.price - cheapest.price

  if (premium <= ceiling) {
    return {
      offer: bestCommission,
      reason: `maior comissão dentro do teto (+R$${premium.toFixed(2)})`,
    }
  }

  return {
    offer: cheapest,
    reason: `guarda de preço: comissão custaria +R$${premium.toFixed(2)}`,
  }
}
