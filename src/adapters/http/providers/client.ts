// Dependencies
import { request } from 'undici'
import { CircuitBreaker } from './breaker.js'

// Types
import type { ProviderId } from '../../../core/search/types.js'

const TIMEOUT_MS = 3_000
const MAX_RETRIES = 1

const breakers: Record<ProviderId, CircuitBreaker> = {
  a: new CircuitBreaker(),
  b: new CircuitBreaker(),
  c: new CircuitBreaker(),
}

export const breakerState = (id: ProviderId) => breakers[id].currentState

export class ProviderError extends Error {
  constructor(message: string, readonly transient: boolean) {
    super(message)
  }
}

type FetchOptions = {
  url: string
  body: unknown
  provider: ProviderId
  retries?: number
}

export const fetchProvider = async ({
  url,
  body,
  provider,
  retries = MAX_RETRIES,
}: FetchOptions): Promise<unknown> => {
  const breaker = breakers[provider]

  if (!breaker.canPass()) {
    throw new ProviderError(`circuit breaker aberto para ${provider}`, false)
  }

  try {
    const res = await request(url, {
      method: 'POST',
      body: JSON.stringify(body),
      headers: { 'content-type': 'application/json' },
      bodyTimeout: TIMEOUT_MS,
      headersTimeout: TIMEOUT_MS,
    })

    if (res.statusCode >= 500) {
      throw new ProviderError(
        `provider ${provider} respondeu ${res.statusCode}`,
        true,
      )
    }

    if (res.statusCode >= 400) {
      throw new ProviderError(
        `provider ${provider} rejeitou a requisição (${res.statusCode})`,
        false,
      )
    }

    const payload = await res.body.json()
    breaker.onSuccess()

    return payload
  } catch (err) {
    const transient = err instanceof ProviderError ? err.transient : true
    breaker.onFailure()

    if (transient && retries > 0) {
      const backoff = 100 * 2 ** (MAX_RETRIES - retries) + Math.random() * 100
      await new Promise(r => setTimeout(r, backoff))

      return fetchProvider({ url, body, provider, retries: retries - 1 })
    }

    throw err
  }
}
