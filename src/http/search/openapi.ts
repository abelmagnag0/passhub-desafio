export const searchSchema = {
  tags: ['busca'],
  summary: 'Consulta ofertas nos três providers em paralelo',
  description:
    'Timeout de 3s por provider; provider que falha não derruba a resposta ' +
    '(meta.partial). Cache Redis de 5 min por rota/data/estratégia. O header ' +
    'x-strategy escolhe a regra de ordenação.',
  headers: {
    type: 'object',
    properties: {
      'x-strategy': {
        type: 'string',

        description:
          'estratégia de seleção: commission_guarded (padrão), lowest_price ' +
          'ou max_commission. Por padrão, maior comissão dentro da guarda de ' +
          'preço (5% ou R$30, o que for menor). Valor inválido cai em ' +
          'commission_guarded — a estratégia aplicada volta em meta.strategy',
        examples: ['commission_guarded', 'lowest_price', 'max_commission'],
      },
    },
  },
  body: {
    type: 'object',
    properties: {
      origin: {
        type: 'string',
        description: 'IATA de 3 letras',
        examples: ['GRU'],
      },
      destination: {
        type: 'string',
        description: 'IATA de 3 letras',
        examples: ['GIG'],
      },
      date: {
        type: 'string',
        description: 'data ISO (YYYY-MM-DD)',
        examples: ['2026-10-12'],
      },
    },
  },
  response: {
    200: {
      type: 'object',
      properties: {
        requestId: {
          type: 'string',
          description: 'id da busca, usado para correlacionar o clique',
        },
        request: {
          type: 'object',
          additionalProperties: true,
          properties: {
            origin: { type: 'string' },
            destination: { type: 'string' },
            date: { type: 'string' },
          },
        },
        flights: {
          type: 'array',
          description: 'ofertas consolidadas e ordenadas pela estratégia',
          items: {
            type: 'object',

            additionalProperties: true,
            properties: {
              airline: { type: 'string', examples: ['LA'] },
              provider: { type: 'string', examples: ['a'] },
              price: { type: 'number', examples: [489.9] },
              departure: { type: 'string' },
              arrival: { type: 'string' },
            },
          },
        },
        meta: {
          type: 'object',
          properties: {
            providers: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  name: { type: 'string' },
                  status: {
                    type: 'string',
                    enum: ['ok', 'failed', 'breaker-open'],
                  },
                  latencyMs: { type: 'integer' },
                  offers: { type: 'integer' },
                  issues: { type: 'array', items: { type: 'string' } },
                },
              },
            },
            partial: {
              type: 'boolean',
              description: 'true quando ao menos um provider falhou',
            },
            cache: { type: 'string', enum: ['HIT', 'MISS'] },
            strategy: { type: 'string' },
            generatedAt: { type: 'string' },
          },
        },
      },
    },
    400: {
      type: 'object',

      additionalProperties: true,
      properties: {
        error: { type: 'string' },
        details: {
          type: 'object',
          additionalProperties: {
            type: 'array',
            items: { type: 'string' },
          },
          examples: [{ origin: ['Required'] }],
        },
      },
    },
    503: {
      type: 'object',
      properties: { error: { type: 'string' } },
      description: 'nenhum provider respondeu',
    },
  },
} as const
