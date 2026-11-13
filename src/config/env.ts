// Dependencies
import { z } from 'zod'

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().default(8000),
  REDIS_URL: z.string().default('redis://localhost:6379'),
  UPSTASH_REDIS_REST_TOKEN: z.string().optional(),
  PROVIDER_A_URL: z.string().default('http://localhost:3001'),
  PROVIDER_B_URL: z.string().default('http://localhost:3002'),
  PROVIDER_C_URL: z.string().default('http://localhost:3003'),

  IP_SALT: z.string().optional(),
  DATABASE_URL: z.string().url().optional(),
})

if (
  process.env.NODE_ENV === 'production' &&
  (!process.env.IP_SALT || process.env.IP_SALT.includes('dev-salt'))
) {
  throw new Error(
    'IP_SALT ausente ou de desenvolvimento em produção — configure um ' +
      'segredo real; sem ele o funil gravaria hash de IP com salt público',
  )
}

export const config = envSchema.parse(process.env)
