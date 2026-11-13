// Dependencies
import type { FastifyInstance } from 'fastify'
import swagger from '@fastify/swagger'
import swaggerUi from '@fastify/swagger-ui'

export const docsRoutes = async (app: FastifyInstance): Promise<void> => {
  await app.register(swagger, {
    openapi: {
      openapi: '3.1.0',
      info: {
        title: 'PassHub Aggregator API',
        version: '1.0.0',
        description:
          'Agregador de ofertas de voos: consulta três providers em paralelo, ' +
          'consolida e ordena as ofertas, com cache Redis de 5 minutos e ' +
          'degradação parcial quando um provider falha.',
      },
      tags: [
        { name: 'busca', description: 'Consulta de ofertas' },
        { name: 'saúde', description: 'Liveness e histórico de disponibilidade' },
        {
          name: 'insights',
          description:
            'KPIs de negócio: Redis por padrão, Postgres quando configurado',
        },
        { name: 'observabilidade', description: 'Métricas Prometheus' },
      ],
      servers: [{ url: '/', description: 'mesma origem' }],
    },
  })

  await app.register(swaggerUi, {
    routePrefix: '/docs',
    uiConfig: { docExpansion: 'list', deepLinking: true },
  })
}
