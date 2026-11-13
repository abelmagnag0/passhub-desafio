// Dependencies
import { request } from 'undici'

// Config
import { providerUrl } from '../../config/index.js'
import type { Cache } from '../cache/redis.js'

export const HISTORY_HOURS = 24
const PROBE_TIMEOUT_MS = 3_000

export const HEALTH_COMPONENTS = [
  'aggregator',
  'redis',
  'postgres',
  'provider-a',
  'provider-b',
  'provider-c',
] as const

export type ComponentStatus = {
  component: string
  ok: boolean
  detail: string
}

const hourKey = (date: string, hour: string, component: string) =>
  `health:${component}:${date}T${hour}`

const downKey = (date: string, hour: string, component: string) =>
  `health:down:${component}:${date}T${hour}`

const nowHour = (): string => new Date().toISOString().slice(0, 13)

export const probeProvider = async (
  id: 'a' | 'b' | 'c',
): Promise<ComponentStatus> => {
  try {
    const res = await request(`${providerUrl(id)}/provider-${id}/search`, {
      method: 'POST',
      body: JSON.stringify({ origin: 'GRU', destination: 'GIG', date: '2026-11-17' }),
      headers: { 'content-type': 'application/json' },
      bodyTimeout: PROBE_TIMEOUT_MS,
      headersTimeout: PROBE_TIMEOUT_MS,
    })
    res.body.dump().catch(() => undefined)

    return {
      component: `provider-${id}`,
      ok: res.statusCode === 200,
      detail: `HTTP ${res.statusCode}`,
    }
  } catch (err) {
    return {
      component: `provider-${id}`,
      ok: false,
      detail: err instanceof Error ? err.message : 'falha',
    }
  }
}

export const recordHour = async (
  cache: Cache,
  statuses: ComponentStatus[],
): Promise<void> => {
  const iso = nowHour()
  const date = iso.slice(0, 10)
  const hour = iso.slice(11, 13)

  await Promise.all(
    statuses.flatMap((status) => {
      const writes = [

        cache.set(hourKey(date, hour, status.component), status.ok, 90 * 86_400),
      ]
      if (!status.ok) {
        writes.push(cache.set(downKey(date, hour, status.component), true, 90 * 86_400))
      }
      return writes
    }),
  )
}

export type HourSlot = {
  hour: string
  status: 'up' | 'down' | 'partial' | 'nodata'
}

export type ComponentHistory = {
  component: string
  uptime: number | null
  current: 'up' | 'down' | 'nodata'
  slots: HourSlot[]
}

export const readHistory = async (
  cache: Cache,
  components: readonly string[],
): Promise<ComponentHistory[]> => {
  const hours: string[] = []
  const cursor = new Date()
  cursor.setUTCMinutes(0, 0, 0)

  for (let i = HISTORY_HOURS - 1; i >= 0; i--) {
    const d = new Date(cursor)
    d.setUTCHours(d.getUTCHours() - i)
    hours.push(d.toISOString().slice(0, 13))
  }

  const atual = nowHour()

  return Promise.all(
    components.map(async (component) => {
      const slots: HourSlot[] = await Promise.all(
        hours.map(async (iso) => {
          const date = iso.slice(0, 10)
          const hour = iso.slice(11, 13)

          const [value, caiu] = await Promise.all([
            cache.get<boolean>(hourKey(date, hour, component)),
            cache.get<boolean>(downKey(date, hour, component)),
          ])

          if (value === null || value === undefined) {
            return { hour: iso, status: 'nodata' as const }
          }

          if (caiu) return { hour: iso, status: 'down' as const }

          return {
            hour: iso,
            status: value ? ('up' as const) : ('down' as const),
            ...(iso === atual ? { status: value ? 'partial' as const : 'down' as const } : {}),
          }
        }),
      )

      const comDado = slots.filter(s => s.status !== 'nodata')
      const cima = comDado.filter(s => s.status === 'up' || s.status === 'partial')
      const ultimo = slots.at(-1)

      return {
        component,
        uptime: comDado.length
          ? Math.round((cima.length / comDado.length) * 1000) / 10
          : null,
        current:
          ultimo?.status === 'up' || ultimo?.status === 'partial'
            ? ('up' as const)
            : ultimo?.status === 'down'
              ? ('down' as const)
              : ('nodata' as const),
        slots,
      }
    }),
  )
}
