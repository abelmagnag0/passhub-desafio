// Dependencies
import { Redis } from 'ioredis'
import { Redis as UpstashRedis } from '@upstash/redis'

export const TTL_SECONDS = 300

type Transport = 'resp' | 'rest'

export class Cache {
  private client: Redis | UpstashRedis | null
  private transport: Transport = 'resp'

  constructor(url: string, log?: { warn: (msg: string) => void }) {
    if (!url) {
      this.client = null
      return
    }

    if (url.startsWith('http')) {
      this.transport = 'rest'
      const token = process.env.UPSTASH_REDIS_REST_TOKEN
      if (!token) {
        this.client = null
        log?.warn('redis: UPSTASH_REDIS_REST_TOKEN ausente, cache desativado')
        return
      }
      this.client = new UpstashRedis({ url, token })
      return
    }

    this.transport = 'resp'
    this.client = new Redis(url, {
      lazyConnect: true,
      maxRetriesPerRequest: 1,
      retryStrategy: (times: number) => (times > 3 ? null : 200),
    })
    ;(this.client as Redis).on('error', (err: Error) =>
      log?.warn(`redis: ${err.message}`),
    )
  }

  async connect(): Promise<void> {
    if (
      this.transport === 'resp' &&
      (this.client as Redis)?.status === 'wait'
    ) {
      await (this.client as Redis).connect()
    }
  }

  async get<T>(key: string): Promise<T | null> {
    if (!this.client) return null

    if (this.transport === 'rest') {
      const data = await this.client.get(key).catch(() => null)
      if (typeof data === 'string') return JSON.parse(data) as T
      return (data as T) ?? null
    }

    const redis = this.client as Redis
    if (redis.status !== 'ready') return null
    const raw = await redis.get(key).catch(() => null)
    return raw ? (JSON.parse(raw as string) as T) : null
  }

  async set(key: string, value: unknown, ttlSeconds = TTL_SECONDS): Promise<void> {
    if (!this.client) return

    if (this.transport === 'rest') {
      await this.client
        .set(key, value as never, { ex: ttlSeconds } as never)
        .catch(() => undefined)
      return
    }

    const redis = this.client as Redis
    if (redis.status !== 'ready') return
    await redis
      .set(key, JSON.stringify(value), 'EX', ttlSeconds)
      .catch(() => undefined)
  }

  async ping(): Promise<boolean> {
    if (!this.client) return false

    if (this.transport === 'rest') {
      return this.client
        .ping()
        .then(res => res === 'PONG')
        .catch(() => false)
    }

    const redis = this.client as Redis
    if (redis.status !== 'ready') return false
    return (await redis.ping().catch(() => 'ERR')) === 'PONG'
  }

  async incr(key: string, ttlSeconds: number): Promise<void> {
    if (!this.client) return
    if (this.transport === 'rest') {
      const rest = this.client as UpstashRedis
      await rest
        .multi()
        .incr(key)
        .expire(key, ttlSeconds)
        .exec()
        .catch(() => undefined)
      return
    }
    const redis = this.client as Redis
    if (redis.status !== 'ready') return
    await redis.multi().incr(key).expire(key, ttlSeconds).exec().catch(() => undefined)
  }

  async hincrby(
    key: string,
    field: string,
    by: number,
    ttlSeconds: number,
  ): Promise<void> {
    if (!this.client) return
    if (this.transport === 'rest') {
      const rest = this.client as UpstashRedis
      await rest
        .multi()
        .hincrby(key, field, by)
        .expire(key, ttlSeconds)
        .exec()
        .catch(() => undefined)
      return
    }
    const redis = this.client as Redis
    if (redis.status !== 'ready') return
    await redis
      .multi()
      .hincrby(key, field, by)
      .expire(key, ttlSeconds)
      .exec()
      .catch(() => undefined)
  }

  async zincrby(
    key: string,
    member: string,
    by: number,
    ttlSeconds: number,
  ): Promise<void> {
    if (!this.client) return
    if (this.transport === 'rest') {
      const rest = this.client as UpstashRedis
      await rest
        .multi()
        .zincrby(key, by, member)
        .expire(key, ttlSeconds)
        .exec()
        .catch(() => undefined)
      return
    }
    const redis = this.client as Redis
    if (redis.status !== 'ready') return
    await redis
      .multi()
      .zincrby(key, by, member)
      .expire(key, ttlSeconds)
      .exec()
      .catch(() => undefined)
  }

  async hgetall(key: string): Promise<Record<string, string>> {
    if (!this.client) return {}
    if (this.transport === 'rest') {
      const data = (await this.client.hgetall(key).catch(() => null)) as unknown
      if (!data) return {}

      if (Array.isArray(data)) {
        const out: Record<string, string> = {}
        for (let i = 0; i < data.length; i += 2) {
          out[String(data[i])] = String(data[i + 1])
        }
        return out
      }
      return data as Record<string, string>
    }
    const redis = this.client as Redis
    if (redis.status !== 'ready') return {}
    return (await redis.hgetall(key).catch(() => ({}))) ?? {}
  }

  async ztop(
    key: string,
    limit: number,
  ): Promise<Array<{ member: string; score: number }>> {
    if (!this.client) return []
    if (this.transport === 'rest') {
      const rest = this.client as UpstashRedis
      const flat = (await rest
        .zrange(key, 0, limit - 1, { rev: true, withScores: true })
        .catch(() => [])) as unknown as Array<string | number>
      const out: Array<{ member: string; score: number }> = []
      for (let i = 0; i < flat.length; i += 2) {
        out.push({ member: String(flat[i]), score: Number(flat[i + 1]) })
      }
      return out
    }
    const redis = this.client as Redis
    if (redis.status !== 'ready') return []
    const flat = await redis
      .zrange(key, 0, limit - 1, 'REV', 'WITHSCORES')
      .catch(() => [] as string[])
    const out: Array<{ member: string; score: number }> = []
    for (let i = 0; i < flat.length; i += 2) {
      out.push({ member: flat[i]!, score: Number(flat[i + 1]) })
    }
    return out
  }

  async pushCapped(
    key: string,
    value: string,
    max: number,
    ttlSeconds: number,
  ): Promise<void> {
    if (!this.client) return
    if (this.transport === 'rest') {
      const rest = this.client as UpstashRedis
      await rest
        .multi()
        .lpush(key, value)
        .ltrim(key, 0, max - 1)
        .expire(key, ttlSeconds)
        .exec()
        .catch(() => undefined)
      return
    }
    const redis = this.client as Redis
    if (redis.status !== 'ready') return
    await redis
      .multi()
      .lpush(key, value)
      .ltrim(key, 0, max - 1)
      .expire(key, ttlSeconds)
      .exec()
      .catch(() => undefined)
  }

  async list(key: string, limit: number): Promise<string[]> {
    if (!this.client) return []
    if (this.transport === 'rest') {
      const data = await this.client.lrange(key, 0, limit - 1).catch(() => [])
      return (data as string[]) ?? []
    }
    const redis = this.client as Redis
    if (redis.status !== 'ready') return []
    return (await redis.lrange(key, 0, limit - 1).catch(() => [])) ?? []
  }

  async inventory(): Promise<Array<{ key: string; ttl: number }>> {
    if (!this.client) return []

    if (this.transport === 'rest') {
      const rest = this.client as UpstashRedis
      const keys = (await rest.keys('search:*').catch(() => [])) as string[]
      return Promise.all(
        keys.map(async (key) => ({
          key,
          ttl: Number((await rest.ttl(key)) ?? 0),
        })),
      )
    }

    const redis = this.client as Redis
    if (redis.status !== 'ready') return []
    const found: string[] = []
    let cursor = '0'
    do {
      const [next, batch] = await redis.scan(cursor, 'MATCH', 'search:*', 'COUNT', 100)
      cursor = next
      found.push(...batch)
    } while (cursor !== '0')

    return Promise.all(
      found.map(async (key) => ({ key, ttl: await redis.ttl(key) })),
    )
  }

  async close(): Promise<void> {
    if (this.transport === 'resp') {
      await (this.client as Redis)?.quit().catch(() => undefined)
    }
  }
}

export const searchKey = (
  origin: string,
  destination: string,
  date: string,
): string => `search:${origin}:${destination}:${date}`
