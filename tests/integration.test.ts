import { readFileSync } from 'node:fs'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createServer, type Server } from 'node:http'
import { Cache } from '../src/adapters/cache/redis.js'
import { InsightsStore } from '../src/adapters/cache/insights-store.js'
import type { Deps } from '../src/container.js'
import { searchRoutes } from '../src/http/search/index.js'
import type { FastifyInstance } from 'fastify'

const DATE = '2026-10-12'
const fixture = (name: string) =>
  JSON.parse(readFileSync(`tests/fixtures/${name}.json`, 'utf-8'))

let servers: Server[] = []

async function providerFrom(name: 'a' | 'b' | 'c'): Promise<string> {
  const data = fixture(`provider-${name}`)
  const server = createServer((_req, res) => res.end(JSON.stringify(data)))
  await new Promise<void>(r => server.listen(0, r))
  servers.push(server)
  const { port } = server.address() as { port: number }
  return `http://localhost:${port}`
}

async function redisUp(): Promise<boolean> {
  const c = new Cache('redis://localhost:6379')
  try {
    await c.connect()
    return await c.ping()
  } catch {
    return false
  } finally {
    await c.close()
  }
}

const redisDisponivel = await redisUp()
if (!redisDisponivel) {
  console.warn('Redis não disponível — testes de integração pulados')
}

describe.skipIf(!redisDisponivel)('POST /search (integração)', () => {
  let app: FastifyInstance

  beforeAll(async () => {
    const [a, b, c] = await Promise.all([
      providerFrom('a'),
      providerFrom('b'),
      providerFrom('c'),
    ])
    process.env.PROVIDER_A_URL = a
    process.env.PROVIDER_B_URL = b
    process.env.PROVIDER_C_URL = c
    const fastifyMod = await import('fastify')
    app = fastifyMod.default({ logger: false })
    const { Redis } = await import('ioredis')
    const cleanup = new Redis('redis://localhost:6379')
    await cleanup.flushdb()
    cleanup.disconnect()
    const cache = new Cache('redis://localhost:6379')
    await cache.connect()
    const db = new (await import('../src/adapters/db/index.js')).Db(undefined)
    const { AgentHash } = await import('../src/adapters/security/agent-hash.js')
    const { fanOut } = await import('../src/adapters/http/providers/fan-out.js')
    searchRoutes(app, {
      cache,
      db,
      agentHash: new AgentHash(undefined),
      insights: new InsightsStore(cache, db),
      fanOut,
      log: app.log,
    } as unknown as Deps)
    await app.ready()
  })

  afterAll(async () => {
    await app?.close()
    for (const s of servers) s.close()
  })

  it('valida payload inválido com 400', async () => {
    const res = await app!.inject({
      method: 'POST',
      url: '/search',
      payload: { origin: 'GRU' },
    })
    expect(res.statusCode).toBe(400)
    expect(res.json().error).toBe('payload inválido')
  })

  it('retorna 60 voos consolidados com meta completa', async () => {
    const res = await app!.inject({
      method: 'POST',
      url: '/search',
      payload: { origin: 'GRU', destination: 'GIG', date: DATE },
    })
    expect(res.statusCode).toBe(200)
    expect(res.headers['x-search-cache']).toBe('MISS')
    const body = res.json()
    expect(body.flights).toHaveLength(60)
    expect(body.meta.providers).toHaveLength(3)
    expect(body.meta.partial).toBe(false)
    expect(body.flights[0].offeredBy).toBeDefined()
  })

  it('segunda busca idêntica vem do cache', async () => {
    const payload = { origin: 'GRU', destination: 'GIG', date: DATE }
    await app!.inject({ method: 'POST', url: '/search', payload })
    const res = await app!.inject({ method: 'POST', url: '/search', payload })
    expect(res.headers['x-search-cache']).toBe('HIT')
    expect(res.headers['x-search-cache']).toBe('HIT')
    expect(res.json().meta.cache).toBe('HIT')
    expect(res.json().flights).toHaveLength(60)
  })

  it('ordenação consistente entre execuções', async () => {
    const p = { origin: 'GRU', destination: 'GIG', date: '2026-10-13' }
    const r1 = await app!.inject({ method: 'POST', url: '/search', payload: p })
    const r2 = await app!.inject({ method: 'POST', url: '/search', payload: p })
    expect(r1.json().flights).toEqual(r2.json().flights)
  })
})
