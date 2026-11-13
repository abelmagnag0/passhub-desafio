// Dependencies
import type { Pool } from 'pg'

export async function recordClick(
  pool: Pool,
  input: {
    searchId?: string | undefined
    provider: string
    price: number
    route: string
    agentHash?: string | undefined
  },
): Promise<void> {
    if (!pool) return
    const tryInsert = (searchId: string | null) =>
      pool!.query(
        `INSERT INTO clicks (search_id, provider, price, route, agent_hash)
         VALUES ($1,$2,$3,$4,$5)`,
        [searchId, input.provider, input.price, input.route, input.agentHash ?? null],
      )

    const numericId = input.searchId && /^\d+$/.test(input.searchId)
      ? input.searchId
      : null
    try {
      await tryInsert(numericId)
    } catch (err) {
      if (numericId) {
        await tryInsert(null).catch(() => undefined)
        return
      }
      console.warn(
        `falha ao registrar clique: ${err instanceof Error ? err.message : err}`,
      )
    }
  }
