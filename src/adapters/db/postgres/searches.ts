// Dependencies
import type { Pool } from 'pg'

export async function recordSearch(
  pool: Pool,
  input: {
    origin: string
    destination: string
    date: string
    strategy: string
    partial: boolean
    latencyMs: number
    cacheHit?: boolean | undefined
    agentHash?: string | undefined
    flights: Array<{
      airline: string
      provider: string
      price: number
      offeredBy: string[]
      departure?: string
      arrival?: string
    }>
  },
): Promise<string | null> {
    if (!pool) return null
    const client = await pool.connect()
    try {
      await client.query('BEGIN')
      const res = await client.query<{ id: string }>(
        `INSERT INTO searches
           (origin, destination, flight_date, strategy, partial,
            total_flights, latency_ms, cache_hit, agent_hash)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id`,
        [
          input.origin,
          input.destination,
          input.date,
          input.strategy,
          input.partial,
          input.flights.length,
          input.latencyMs,
          input.cacheHit ?? false,
          input.agentHash ?? null,
        ],
      )
      const searchId = res.rows[0]!.id

      if (input.flights.length > 0) {
        const values: unknown[] = []
        const rows = input.flights.map((f, i) => {
          values.push(
            searchId,
            f.airline,
            f.provider,
            true,
            f.price,
            f.departure ?? null,
            f.arrival ?? null,
          )
          const b = i * 7
          return `($${b + 1},$${b + 2},$${b + 3},$${b + 4},$${b + 5},$${b + 6},$${b + 7})`
        })

        await client.query(
          `INSERT INTO search_offers
             (search_id, airline, provider, chosen, price, departure_time, arrival_time)
           VALUES ${rows.join(',')}`,
          values,
        )
      }
      await client.query('COMMIT')
      return String(searchId)
    } catch (err) {
      await client.query('ROLLBACK').catch(() => undefined)
      console.warn(
        `falha ao persistir busca: ${err instanceof Error ? err.message : err}`,
      )
      return null
    } finally {
      client.release()
    }
  }

export async function proofSearch(
  pool: Pool,
  id: string,
): Promise<Record<string, unknown> | null> {
    if (!pool) return null
    const res = await pool.query(
      `SELECT id, origin, destination, flight_date, strategy, partial,
              total_flights, latency_ms, cache_hit, created_at
         FROM searches WHERE id = $1`,
      [id],
    )
    return res.rows[0] ?? null
  }
