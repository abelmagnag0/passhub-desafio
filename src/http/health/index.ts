// Dependencies
import type { FastifyInstance } from 'fastify'

// Container
import type { Deps } from '../../container.js'
import {
  HEALTH_COMPONENTS,
  HISTORY_HOURS,
  probeProvider,
  readHistory,
  recordHour,
  type ComponentStatus,
} from '../../adapters/telemetry/health-history.js'

export const healthRoutes = (app: FastifyInstance, deps: Deps): void => {
  const { cache, db } = deps

  app.get(
    '/health',
    {
      schema: {
        tags: ['saúde'],
        summary: 'Liveness com probe real de dependências',
        description:
          'Checa Redis, Postgres (quando configurado) e os três providers. ' +
          'Componente não configurado é omitido, nunca reportado como down.',
        response: {
          200: {
            type: 'object',
            properties: {
              status: {
                type: 'string',
                enum: ['ok', 'degraded'],
                description:
                  'ok quando todos os componentes respondem; degraded quando ' +
                  'algum falha. O serviço continua servindo busca em degraded.',
              },
              redis: { type: 'boolean' },
              postgres: { type: 'boolean' },
              providers: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    name: { type: 'string', examples: ['provider-a'] },
                    status: { type: 'string', enum: ['ok', 'failed'] },
                    detail: { type: 'string' },
                  },
                },
              },
            },
          },
        },
      },
    },
    async () => {
      const providerChecks = await Promise.all([
        probeProvider('a'),
        probeProvider('b'),
        probeProvider('c'),
      ])
      const redisOk = await cache.ping()

      const pgOk = db.enabled ? await db.ping() : false

      const statuses: ComponentStatus[] = [
        { component: 'aggregator', ok: true, detail: 'liveness' },
        {
          component: 'redis',
          ok: redisOk,
          detail: redisOk ? 'PONG' : 'sem resposta',
        },
        ...(db.enabled
          ? [
              {
                component: 'postgres',
                ok: pgOk,
                detail: pgOk ? 'conexão ok' : 'sem resposta',
              },
            ]
          : []),
        ...providerChecks,
      ]
      await recordHour(cache, statuses)

      const tudoOk = statuses.every((s) => s.ok)

      return {
        status: tudoOk ? 'ok' : 'degraded',
        redis: redisOk,
        postgres: db.enabled && pgOk,
        providers: statuses
          .filter(s => s.component.startsWith('provider'))
          .map(s => ({
            name: s.component,
            status: s.ok ? 'ok' : 'failed',
            detail: s.detail,
          })),
      }
    },
  )

  app.get(
    '/health/history',
    {
      schema: {
        tags: ['saúde'],
        summary: `Histórico de disponibilidade (${HISTORY_HOURS} horas)`,
        description:
          'Um registro por hora, no formato de status page: cada slot é uma ' +
          'hora e a cor conta a história. Horas sem checagem aparecem como ' +
          '"nodata", nunca como indisponibilidade.',
        response: {
          200: {
            type: 'object',
            properties: {
              hours: { type: 'integer' },
              components: {
                type: 'array',
                items: {
                  type: 'object',
                  additionalProperties: true,
                  properties: {
                    component: { type: 'string' },
                    uptime: { type: ['number', 'null'] },
                    current: { type: 'string', enum: ['up', 'down', 'nodata'] },
                    slots: {
                      type: 'array',
                      items: {
                        type: 'object',
                        properties: {
                          hour: { type: 'string' },
                          status: {
                            type: 'string',
                            enum: ['up', 'down', 'partial', 'nodata'],
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
    async () => ({
      hours: HISTORY_HOURS,
      components: await readHistory(cache, HEALTH_COMPONENTS),
    }),
  )
}