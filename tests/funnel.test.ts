// Dependencies
import { describe, it, expect } from 'vitest'
import Fastify from 'fastify'

// Routes
import { funnelRoutes } from '../src/http/funnel/index.js'
import type { Db } from '../src/adapters/db/index.js'
import type { Deps } from '../src/container.js'

const build = (db: Partial<Db>) => {
  const app = Fastify({ logger: false })
  funnelRoutes(app, { db } as unknown as Deps)
  return app
}

describe('GET /insights/funnel', () => {
  it('sem banco, devolve enabled=false', async () => {
    const app = build({ enabled: false })
    const res = await app.inject({ method: 'GET', url: '/insights/funnel' })

    expect(res.statusCode).toBe(200)
    expect(res.json()).toMatchObject({ enabled: false })
    await app.close()
  })

  it('devolve a agregação do Postgres no formato do contrato', async () => {
    const app = build({
      enabled: true,
      funnel: async () => ({
        searches: 10,
        clicks: 4,
        conversion: 0.4,
        distinctAgents: 3,
        byProvider: [{ provider: 'c', clicks: 3 }],
        topRoutes: [
          { route: 'GRU → GIG', searches: 8, clicks: 3, conversion: 0.375 },
        ],
      }),
    })

    const res = await app.inject({ method: 'GET', url: '/insights/funnel' })
    const body = res.json()

    expect(body).toMatchObject({
      enabled: true,
      window: '7d',
      searches: 10,
      clicks: 4,
      conversion: 0.4,
      distinctAgents: 3,
    })
    expect(body.byProvider).toEqual([{ provider: 'c', clicks: 3 }])
    expect(body.topRoutes[0].route).toBe('GRU → GIG')
    await app.close()
  })
})