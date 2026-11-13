// Dependencies
import { createServer, type Server } from 'node:http'
import Fastify from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

// Routes
import { healthRoutes } from '../src/http/health/index.js'
import type { Cache } from '../src/adapters/cache/redis.js'
import type { Db } from '../src/adapters/db/index.js'
import type { Deps } from '../src/container.js'

let servers: Server[] = []

const provider = async (status: number): Promise<string> => {
  const server = createServer((_req, res) => {
    res.writeHead(status, { 'content-type': 'application/json' })
    res.end(JSON.stringify(status === 200 ? { offers: [] } : { error: 'down' }))
  })
  await new Promise<void>((r) => server.listen(0, r))
  servers.push(server)
  const { port } = server.address() as { port: number }
  return `http://localhost:${port}`
}

const build = (deps: { cache: Partial<Cache>; db: Partial<Db> }) => {
  const app = Fastify({ logger: false })
  healthRoutes(app, deps as unknown as Deps)
  return app
}

const cacheOk = {
  ping: async () => true,
  set: async () => undefined,
} as unknown as Partial<Cache>
const dbOk = { enabled: true, ping: async () => true } as Partial<Db>

describe('GET /health', () => {
  beforeAll(async () => {
    const [a, b, c] = await Promise.all([
      provider(200),
      provider(200),
      provider(200),
    ])
    process.env.PROVIDER_A_URL = a
    process.env.PROVIDER_B_URL = b
    process.env.PROVIDER_C_URL = c
  })

  afterAll(() => {
    for (const s of servers) s.close()
  })

  it('responde 200 e reporta redis, postgres e os três providers', async () => {
    const app = build({ cache: cacheOk, db: dbOk })
    const res = await app.inject({ method: 'GET', url: '/health' })

    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body.status).toBe('ok')
    expect(body.redis).toBe(true)
    expect(body.postgres).toBe(true)
    expect(body.providers.map((p: { name: string }) => p.name)).toEqual([
      'provider-a',
      'provider-b',
      'provider-c',
    ])
    await app.close()
  })

  it('marca status degraded quando o Redis cai', async () => {
    const app = build({
      cache: {
        ping: async () => false,
        set: async () => undefined,
      } as unknown as Partial<Cache>,
      db: dbOk,
    })
    const res = await app.inject({ method: 'GET', url: '/health' })

    expect(res.json().redis).toBe(false)
    expect(res.json().status).toBe('degraded')
    await app.close()
  })

  it('omite o postgres quando não está configurado, sem marcar down', async () => {
    const app = build({
      cache: cacheOk,

      db: { enabled: false } as Partial<Db>,
    })
    const res = await app.inject({ method: 'GET', url: '/health' })

    const body = res.json()
    expect(body.postgres).toBe(false)
    expect(
      body.providers.some((p: { name: string }) => p.name === 'postgres'),
    ).toBe(false)
    await app.close()
  })

  it('marca o componente do provider como down quando ele responde erro', async () => {
    const down = await provider(500)
    process.env.PROVIDER_B_URL = down

    const app = build({ cache: cacheOk, db: dbOk })
    const res = await app.inject({ method: 'GET', url: '/health' })

    const b = res
      .json()
      .providers.find((p: { name: string }) => p.name === 'provider-b')
    expect(b.status).toBe('failed')
    expect(res.json().status).not.toBe('ok')
    await app.close()
  })
})