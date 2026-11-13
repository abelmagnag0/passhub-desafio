// Dependencies
import { Pool } from 'pg'

// Schema
import { SCHEMA } from './schema.js'

// Queries
import { recordSearch, proofSearch } from './searches.js'
import { recordClick } from './clicks.js'
import { funnel, insights } from './analytics.js'

type SearchInput = Parameters<typeof recordSearch>[1]
type ClickInput = Parameters<typeof recordClick>[1]

export class Db {
  private pool: Pool | null

  constructor(
    url: string | undefined,
    private log?: { warn: (m: string) => void },
  ) {
    const needsTls = url ? /[?&]sslmode=(require|verify)/.test(url) : false
    this.pool = url
      ? new Pool({
          connectionString: url,
          max: 5,
          ssl: needsTls ? { rejectUnauthorized: false } : undefined,
        })
      : null
  }

  async init(): Promise<void> {
    if (!this.pool) return
    try {
      await this.pool.query(SCHEMA)
    } catch (err) {
      this.log?.warn(
        `postgres indisponível: ${err instanceof Error ? err.message : err}`,
      )
      this.pool = null
    }
  }

  get enabled(): boolean {
    return this.pool !== null
  }

  async recordSearch(input: SearchInput): Promise<string | null> {
    return this.pool ? recordSearch(this.pool, input) : null
  }

  async recordClick(input: ClickInput): Promise<void> {
    if (this.pool) await recordClick(this.pool, input)
  }

  async proofSearch(id: string): Promise<Record<string, unknown> | null> {
    return this.pool ? proofSearch(this.pool, id) : null
  }

  async funnel(days = 7): ReturnType<typeof funnel> {
    if (!this.pool) throw new Error('postgres não configurado')
    return funnel(this.pool, days)
  }

  async insights(): Promise<Record<string, unknown>> {
    if (!this.pool) throw new Error('postgres não configurado')
    return insights(this.pool)
  }

  async ping(): Promise<boolean> {
    if (!this.pool) return false
    try {
      await this.pool.query('SELECT 1')
      return true
    } catch {
      return false
    }
  }

  async close(): Promise<void> {
    await this.pool?.end()
    this.pool = null
  }
}