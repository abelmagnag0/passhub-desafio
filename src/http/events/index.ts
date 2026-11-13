// Dependencies
import type { FastifyInstance } from 'fastify'

// Container
import type { Deps } from '../../container.js'

export const eventsRoutes = (app: FastifyInstance, deps: Deps): void => {
  const { insights, db, agentHash } = deps

  app.post(
    '/events',
    {
      schema: {
        tags: ['insights'],
        summary: 'Registra evento de interação da UI',
        description:
          'Alimenta o dashboard com o que o usuário fez. Cada clique conta uma vez.',
        body: {
          type: 'object',
          required: ['type'],
          properties: {
            type: { type: 'string', enum: ['click'] },
            provider: { type: 'string', enum: ['a', 'b', 'c'] },
            price: { type: 'number', minimum: 0 },
            route: { type: 'string', examples: ['GRU → GIG'] },
          },
        },
        response: {
          202: {
            type: 'object',
            properties: { recorded: { type: 'boolean' } },
          },
        },
      },
    },
    async (req, reply) => {
      const body = req.body as {
        type: 'click'
        provider?: 'a' | 'b' | 'c'
        price?: number
        route?: string
        requestId?: string
      }

      if (body.type === 'click' && body.provider) {
        await insights.record({
          type: 'click',
          provider: body.provider,
          price: Number(body.price ?? 0),
          route: body.route ?? '',
        })

        await db.recordClick({
          searchId: body.requestId,
          provider: body.provider,
          price: Number(body.price ?? 0),
          route: body.route ?? '',
          agentHash: agentHash.of(req.ip),
        })
      }

      return reply.status(202).send({ recorded: true })
    },
  )
}
