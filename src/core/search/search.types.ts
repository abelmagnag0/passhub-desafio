// Types
import type { consolidate } from './service.js'

export type ProviderMeta = {
  name: string
  status: 'ok' | 'failed' | 'breaker-open'
  latencyMs: number
  offers: number
  issues: string[]
}

export type SearchResponse = {
  requestId: string
  request: { origin: string; destination: string; date: string }
  flights: ReturnType<typeof consolidate>
  meta: {
    providers: ProviderMeta[]
    partial: boolean
    cache: 'HIT' | 'MISS'
    strategy: string
    generatedAt: string
  }
}