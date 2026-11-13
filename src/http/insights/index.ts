// Dependencies
import type { FastifyInstance } from 'fastify'

// Container
import type { Deps } from '../../container.js'

const bucketSchema = {
  type: 'object',
  properties: {
    hour: { type: 'string' },
    searches: { type: 'integer' },
    clicks: { type: 'integer' },
    cache_hits: { type: 'integer' },
    partial: { type: 'integer' },
    errors: { type: 'integer' },
    revenue: { type: 'number' },
    avg_latency: { type: ['integer', 'null'] },
  },
} as const

const routeSchema = {
  type: 'object',
  properties: {
    route: { type: 'string' },
    searches: { type: 'integer' },
    avg_latency: { type: ['integer', 'null'] },
    revenue: { type: ['number', 'null'] },
    conversion: { type: ['number', 'null'] },
  },
} as const

const providerSchema = {
  type: 'object',
  properties: {
    provider: { type: 'string' },
    wins: { type: 'integer' },
    latency_p50: { type: ['integer', 'null'] },
    latency_p95: { type: ['integer', 'null'] },
    savings: { type: ['number', 'null'] },
    commission: { type: ['number', 'null'] },
    algorithm_wins: { type: 'integer' },
  },
} as const

export const insightsRoutes = (app: FastifyInstance, deps: Deps): void => {
  const { insights } = deps

  app.get<{ Querystring: { window?: string } }>(
    '/insights/data',
    {
      schema: {
        tags: ['insights'],
        summary: 'KPIs para o Dashboard',
        description:
          'Janela de 24h (resolução hora) ou 7d (resolução dia). Postgres ' +
          'quando configurado e com dado (p50/p95 nativos); senão, ' +
          'contadores em Redis. Nunca falha por falta de banco. ' +
          'O painel em /dashboard consome este endpoint.',
        querystring: {
          type: 'object',
          properties: {
            window: {
              type: 'string',
              enum: ['24h', '7d'],
              default: '24h',
              description: '24h (hora a hora) ou 7d (dia a dia)',
            },
          },
        },
        response: {
          200: {
            type: 'object',
            properties: {
              source: { type: 'string', enum: ['redis', 'postgres'] },
              window: { type: 'integer' },
              resolution: { type: 'string', enum: ['hora', 'dia'] },
              buckets: { type: 'array', items: bucketSchema },
              routes: { type: 'array', items: routeSchema },
              providers: { type: 'array', items: providerSchema },
              totals: {
                type: 'object',
                properties: {
                  searches: { type: 'integer' },
                  clicks: { type: 'integer' },
                  cache_hits: { type: 'integer' },
                  cache_hit_rate: { type: ['number', 'null'] },
                  partial: { type: 'integer' },
                  partial_rate: { type: ['number', 'null'] },
                  clicks_per_search: { type: ['number', 'null'] },
                  projected_revenue: { type: 'number' },
                  commission_per_search: { type: ['number', 'null'] },
                  p50_ms: { type: ['integer', 'null'] },
                  p95_ms: { type: ['integer', 'null'] },
                  avg_latency_ms: { type: ['integer', 'null'] },
                  requests: {
                    type: 'object',
                    properties: {
                      ok: { type: 'integer' },
                      client_error: { type: 'integer' },
                      server_error: { type: 'integer' },
                    },
                  },
                  error_rate: { type: ['number', 'null'] },
                  savings: { type: 'number' },
                },
              },
            },
          },
        },
      },
    },
    async (req) => insights.summary(req.query.window === '7d' ? 168 : 24),
  )
}