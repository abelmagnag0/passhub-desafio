// Dependencies
import { describe, it, expect } from 'vitest'
import { readHistory, recordHour, HISTORY_HOURS } from '../src/adapters/telemetry/health-history.js'
import type { Cache } from '../src/adapters/cache/redis.js'

const memoryCache = () => {
  const store = new Map<string, unknown>()
  return {
    store,
    set: async (k: string, v: unknown) => {
      store.set(k, v)
    },
    get: async (k: string) => (store.has(k) ? store.get(k) : null),
  } as unknown as Cache & { store: Map<string, unknown> }
}

describe('histórico de disponibilidade', () => {
  it('sem nenhum registro, todas as velas são nodata e uptime é null', async () => {
    const cache = memoryCache()
    const [c] = await readHistory(cache, ['redis'])

    expect(c!.slots).toHaveLength(HISTORY_HOURS)
    expect(c!.slots.every(s => s.status === 'nodata')).toBe(true)
    expect(c!.uptime).toBeNull()
    expect(c!.current).toBe('nodata')
  })

  it('registra a hora corrente como up', async () => {
    const cache = memoryCache()
    await recordHour(cache, [{ component: 'redis', ok: true, detail: 'PONG' }])

    const [c] = await readHistory(cache, ['redis'])
    const ultimo = c!.slots.at(-1)!

    expect(ultimo.status).toBe('partial')
    expect(c!.current).toBe('up')
    expect(c!.uptime).toBe(100)
  })

  it('uma queda dentro da hora NÃO é apagada pela recuperação seguinte', async () => {
    const cache = memoryCache()

    await recordHour(cache, [{ component: 'redis', ok: false, detail: 'timeout' }])

    await recordHour(cache, [{ component: 'redis', ok: true, detail: 'PONG' }])

    const [c] = await readHistory(cache, ['redis'])
    const ultimo = c!.slots.at(-1)!

    expect(ultimo.status).toBe('down')
    expect(c!.current).toBe('down')
    expect(c!.uptime).toBe(0)
  })

  it('componente que nunca falhou fica 100%', async () => {
    const cache = memoryCache()
    await recordHour(cache, [{ component: 'redis', ok: true, detail: 'PONG' }])

    const [c] = await readHistory(cache, ['redis'])
    expect(c!.uptime).toBe(100)
  })

  it('lê vários componentes de uma vez', async () => {
    const cache = memoryCache()
    await recordHour(cache, [
      { component: 'redis', ok: true, detail: 'PONG' },
      { component: 'postgres', ok: false, detail: 'sem resposta' },
    ])

    const [redis, pg] = await readHistory(cache, ['redis', 'postgres'])
    expect(redis!.current).toBe('up')
    expect(pg!.current).toBe('down')
  })
})
