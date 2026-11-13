// Dependencies
import type { FastifyInstance } from 'fastify'

// Container
import type { Deps } from '../../container.js'

const DIAS = 7

export const funnelRoutes = (app: FastifyInstance, deps: Deps): void => {
  const { db } = deps

  app.get(
    '/insights/funnel',
    {
      schema: {
        tags: ['insights'],
        summary: 'Funil busca → clique (últimos 7 dias)',
        description:
          'Cruza buscas e cliques pela FK `clicks.search_id`. Responde o que ' +
          'o agregado do Redis não responde: quantos agentes distintos ' +
          'buscaram, quantas buscas converteram e qual rota converte mais.',
        response: {
          200: {
            type: 'object',
            additionalProperties: true,
            properties: {
              enabled: { type: 'boolean' },
              window: { type: 'string', examples: ['7d'] },
              searches: { type: 'integer' },
              clicks: { type: 'integer' },
              conversion: {
                type: 'number',
                description: 'cliques / buscas no período (0 a 1)',
              },
              distinctAgents: {
                type: 'integer',
                description: 'agentes identificados pelo hash do IP',
              },
              byProvider: {
                type: 'array',
                items: {
                  type: 'object',
                  additionalProperties: true,
                  properties: {
                    provider: { type: 'string' },
                    clicks: { type: 'integer' },
                  },
                },
              },
              topRoutes: {
                type: 'array',
                items: {
                  type: 'object',
                  additionalProperties: true,
                  properties: {
                    route: { type: 'string' },
                    searches: { type: 'integer' },
                    clicks: { type: 'integer' },
                    conversion: { type: 'number' },
                  },
                },
              },
            },
          },
        },
      },
    },
    async (_req, reply) => {
      if (!db.enabled) {
        return reply.send({ enabled: false, window: `${DIAS}d` })
      }

      const f = await db.funnel(DIAS)
      return {
        enabled: true,
        window: `${DIAS}d`,
        ...f,
      }
    },
  )
}