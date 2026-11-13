// Dependencies
import type { FastifyInstance } from 'fastify'
import { metricsText } from '../../adapters/telemetry/metrics.js'

export const metricsRoutes = (app: FastifyInstance): void => {
  app.get(
    '/metrics',
    {
      schema: {
        tags: ['observabilidade'],
        summary: 'Métricas de processo no formato Prometheus',
        description:
          'Contadores de busca, latência por provider, cache e estado dos ' +
          'circuit breakers. Formato texto para scrape, não JSON.',
        produces: ['text/plain'],
        response: { 200: { type: 'string' } },
      },
    },
    async () => metricsText(),
  )
}
