// Dependencies
import type { FastifyInstance } from 'fastify'

// Container
import type { Deps } from '../../container.js'

export const statusRoutes = (app: FastifyInstance, deps: Deps): void => {
  const { db } = deps

  app.get(
    '/status/proof',
    {
      schema: {
        tags: ['saúde'],
        summary: 'Prova ao vivo de escrita e leitura no Postgres',
        description:
          'Grava uma busca de teste, lê de volta e devolve os dois ' +
          'horários. Serve para demonstrar em tempo real que o Postgres ' +
          'está persistindo — não é mock.',
        response: {
          200: {
            type: 'object',
            additionalProperties: true,
            properties: {
              enabled: { type: 'boolean' },
              table: { type: 'string' },
              wroteAt: { type: 'string' },
              readAt: { type: 'string' },
              latencyMs: { type: 'integer' },
              persisted: { type: 'boolean' },
              sample: { type: 'object', additionalProperties: true },
            },
          },
        },
      },
    },
    async () => {
      if (!db.enabled) return { enabled: false }

      const wroteAt = new Date()
      const searchId = await db.recordSearch({
        origin: 'PRF',
        destination: 'PRF',
        date: wroteAt.toISOString().slice(0, 10),
        strategy: 'proof',
        partial: false,
        latencyMs: 0,
        flights: [],
      })

      if (!searchId) return { enabled: false }

      const started = Date.now()
      const sample = await db.proofSearch(searchId)
      const latencyMs = Date.now() - started

      return {
        enabled: true,
        table: 'searches',
        wroteAt: wroteAt.toISOString(),
        readAt: new Date().toISOString(),
        latencyMs,
        persisted: Boolean(sample),
        sample: sample ?? null,
      }
    },
  )
}