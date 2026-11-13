// Types
import type {
  FlightOffer,
  NormalizedResult,
  ProviderId,
} from '../types.js'
import { envelopes } from '../types.js'

// Helpers
import { canonicalAirline } from '../airlines.js'

const timestamp = (date: string, time: string, addDay = 0): string => {
  const d = new Date(`${date}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + addDay)
  const [h, m] = time.split(':').map(Number) as [number, number]
  d.setUTCHours(h, m)

  return d.toISOString().replace('.000Z', 'Z')
}

const arrivalDate = (date: string, departure: string, time: string): string =>
  timestamp(date, time, time >= departure.slice(11, 16) ? 0 : 1)

const asUtc = (iso: string) => (iso.endsWith('Z') ? iso : `${iso}Z`)

export const normalizeA = (
  payload: unknown,
  date: string,
): NormalizedResult => {
  const { flights } = envelopes.a.parse(payload)
  const offers: FlightOffer[] = []
  const issues: string[] = []

  for (const f of flights) {
    if (f.price <= 0) {
      issues.push(`provider-a: preço inválido (${f.price}) para ${f.company}`)
      continue
    }

    offers.push({
      airline: canonicalAirline(f.company),
      flightDate: date,
      departure: asUtc(f.depart_at),
      arrival: asUtc(f.arrive_at),
      price: f.price,
      currency: 'BRL',
      provider: 'a',
    })
  }

  return { offers, issues }
}

export const normalizeB = (
  payload: unknown,
  date: string,
): NormalizedResult => {
  const { results } = envelopes.b.parse(payload)
  const offers: FlightOffer[] = []
  const issues: string[] = []

  for (const f of results) {
    if (f.currency !== 'BRL') {
      issues.push(
        `provider-b: moeda não suportada (${f.currency}) para ${f.airline_name}`,
      )
      continue
    }

    if (f.amount <= 0) {
      issues.push(
        `provider-b: preço inválido (${f.amount}) para ${f.airline_name}`,
      )
      continue
    }

    const departure = timestamp(date, f.departure)
    offers.push({
      airline: canonicalAirline(f.airline_name),
      flightDate: date,
      departure,
      arrival: arrivalDate(date, departure, f.arrival),
      price: f.amount / 100,
      currency: 'BRL',
      provider: 'b',
    })
  }

  return { offers, issues }
}

export const normalizeC = (
  payload: unknown,
  date: string,
): NormalizedResult => {
  const { data } = envelopes.c.parse(payload)
  const offers: FlightOffer[] = []
  const issues: string[] = []

  for (const f of data) {
    if (f.fare <= 0) {
      issues.push(`provider-c: preço inválido (${f.fare}) para ${f.carrier}`)
      continue
    }

    const departure = timestamp(date, f.departure_time)
    offers.push({
      airline: canonicalAirline(f.carrier),
      flightDate: date,
      departure,
      arrival: arrivalDate(date, departure, f.arrival_time),
      price: f.fare,
      currency: 'BRL',
      provider: 'c',
    })
  }

  return { offers, issues }
}

export const adapters: Record<
  ProviderId,
  (payload: unknown, date: string) => NormalizedResult
> = {
  a: normalizeA,
  b: normalizeB,
  c: normalizeC,
}
