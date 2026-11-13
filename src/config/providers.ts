// Dependencies
import { config } from './env.js'

export const providers = {
  a: { name: 'provider-a', commission: 0.01 },
  b: { name: 'provider-b', commission: 0.015 },
  c: { name: 'provider-c', commission: 0.02 },
} as const

export const providerUrl = (id: 'a' | 'b' | 'c'): string => {
  const override = process.env[`PROVIDER_${id.toUpperCase()}_URL`]
  if (override) return override
  return id === 'a'
    ? config.PROVIDER_A_URL
    : id === 'b'
    ? config.PROVIDER_B_URL
    : config.PROVIDER_C_URL
}
