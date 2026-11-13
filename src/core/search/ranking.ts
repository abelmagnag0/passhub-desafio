// Types
import type { FlightOffer, ProviderId } from './types.js'

export type RankedFlight = FlightOffer & {
  id: string
  offeredBy: ProviderId[]
  savings: number
  selectionReason: string
}

export const rank = (flights: RankedFlight[]): RankedFlight[] =>
  flights.sort(
    (a, b) =>
      a.departure.localeCompare(b.departure) ||
      a.price - b.price ||
      a.airline.localeCompare(b.airline),
  )
