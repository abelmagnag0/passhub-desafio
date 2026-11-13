// Types
import type { FlightOffer } from './types.js'

// Helpers
import { dedupe } from './dedupe.js'
import { select, type CommissionTable } from './selection.js'
import { rank, type RankedFlight } from './ranking.js'

export const consolidate = (
  offers: FlightOffer[],
  table: CommissionTable,
): RankedFlight[] => {
  const flights: RankedFlight[] = []

  for (const [key, group] of dedupe(offers)) {
    const { offer, reason } = select(group, table)
    
    const cheapest = Math.min(...group.map(o => o.price))
    const [airline, departure, arrival] = key.split('|')

    flights.push({
      ...offer,
      id: Buffer.from(key).toString('base64url'),
      offeredBy: group.map(o => o.provider).sort(),
      savings: offer.price - cheapest,
      selectionReason: reason,
      airline: airline!,
      departure: departure!,
      arrival: arrival!,
    })
  }

  return rank(flights)
}
