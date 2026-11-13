import { describe, expect, it } from 'vitest'
import { createServer, type Server } from 'node:http'
import { fetchProvider, ProviderError } from '../src/adapters/http/providers/client.js'
import { CircuitBreaker } from '../src/adapters/http/providers/breaker.js'

async function listen(server: Server): Promise<string> {
  await new Promise<void>(r => server.listen(0, r))
  const { port } = server.address() as { port: number }
  return `http://localhost:${port}`
}

describe('fetchProvider', () => {
  it('retorna payload em 200', async () => {
    const server = createServer((_req, res) =>
      res.end(JSON.stringify({ ok: true })),
    )
    const url = await listen(server)
    const payload = await fetchProvider({ url, body: {}, provider: 'a' })
    expect(payload).toEqual({ ok: true })
    server.close()
  })

  it('faz retry em 5xx e depois desiste com erro transiente', async () => {
    let calls = 0
    const server = createServer((_req, res) => {
      calls += 1
      res.writeHead(503).end()
    })
    const url = await listen(server)
    await expect(
      fetchProvider({ url, body: {}, provider: 'b' }),
    ).rejects.toBeInstanceOf(ProviderError)
    expect(calls).toBe(2)
    server.close()
  })

  it('não faz retry em 4xx', async () => {
    let calls = 0
    const server = createServer((_req, res) => {
      calls += 1
      res.writeHead(400).end()
    })
    const url = await listen(server)
    await expect(
      fetchProvider({ url, body: {}, provider: 'c' }),
    ).rejects.toBeInstanceOf(ProviderError)
    expect(calls).toBe(1)
    server.close()
  })

  it('estoura timeout de 3s', async () => {
    const server = createServer((_req, res) => {
      setTimeout(() => res.end('{}'), 4_500)
    })
    const url = await listen(server)
    const start = Date.now()
    await expect(
      fetchProvider({ url, body: {}, provider: 'a', retries: 0 }),
    ).rejects.toThrow()
    expect(Date.now() - start).toBeLessThan(4_000)
    server.close()
  })
})

describe('CircuitBreaker', () => {
  const fastForward = (b: CircuitBreaker) => {
    ;(b as unknown as { openedAt: number }).openedAt = Date.now() - 16_000
  }

  it('abre após 5 falhas, bloqueia, reabre em half-open e fecha com 2 sucessos', () => {
    const b = new CircuitBreaker()
    for (let i = 0; i < 5; i++) b.onFailure()
    expect(b.currentState).toBe('open')
    expect(b.canPass()).toBe(false)

    fastForward(b)
    expect(b.canPass()).toBe(true)
    expect(b.currentState).toBe('half-open')

    b.onFailure()
    expect(b.currentState).toBe('open')

    fastForward(b)
    b.canPass()
    b.onSuccess()
    b.onSuccess()
    expect(b.currentState).toBe('closed')
  })

  it('sucesso em closed zera contagem de falhas', () => {
    const b = new CircuitBreaker()
    for (let i = 0; i < 3; i++) b.onFailure()
    b.onSuccess()
    for (let i = 0; i < 4; i++) b.onFailure()
    expect(b.currentState).toBe('closed')
    b.onFailure()
    expect(b.currentState).toBe('open')
  })
})
