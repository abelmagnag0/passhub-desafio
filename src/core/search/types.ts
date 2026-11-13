// Dependencies
import { z } from 'zod'

export type ProviderId = 'a' | 'b' | 'c'

export type FlightOffer = {
  airline: string
  flightDate: string
  departure: string
  arrival: string
  price: number
  currency: 'BRL'
  provider: ProviderId
}

export type NormalizedResult = {
  offers: FlightOffer[]
  issues: string[]
}

const isoLocal = z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z?$/)

const providerAFlight = z.object({
  company: z.string().min(1),
  price: z.number(),
  depart_at: isoLocal,
  arrive_at: isoLocal,
})

const providerBFlight = z.object({
  airline_name: z.string().min(1),
  amount: z.number().int(),
  currency: z.string().length(3),
  departure: z.string().regex(/^\d{2}:\d{2}$/),
  arrival: z.string().regex(/^\d{2}:\d{2}$/),
})

const providerCFlight = z.object({
  carrier: z.string().min(1),
  fare: z.number(),
  departure_time: z.string().regex(/^\d{2}:\d{2}$/),
  arrival_time: z.string().regex(/^\d{2}:\d{2}$/),
})

const envelopeA = z.object({ flights: z.array(providerAFlight) })
const envelopeB = z.object({ results: z.array(providerBFlight) })
const envelopeC = z.object({ data: z.array(providerCFlight) })

export const envelopes = {
  a: envelopeA,
  b: envelopeB,
  c: envelopeC,
} as const
