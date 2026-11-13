// Types
import type { FlightOffer } from './types.js'

export const dedupe = (offers: FlightOffer[]): Map<string, FlightOffer[]> => {
  const groups = new Map<string, FlightOffer[]>()

  for (const offer of offers) {
    const key = `${offer.airline}|${offer.departure}|${offer.arrival}`
    const group = groups.get(key)

    if (group) {
      group.push(offer)
    } else {
      groups.set(key, [offer])
    }
  }

  return groups
}
