// Config
import { config } from './config/index.js'
import { Cache } from './adapters/cache/redis.js'
import { Db } from './adapters/db/index.js'
import { AgentHash } from './adapters/security/agent-hash.js'
import { fanOut } from './adapters/http/providers/fan-out.js'
import { InsightsStore } from './adapters/cache/insights-store.js'

// Types
import type { FastifyBaseLogger } from 'fastify'

export type Deps = {
  cache: Cache
  db: Db

  agentHash: AgentHash
  insights: InsightsStore

  fanOut: typeof fanOut
  log: FastifyBaseLogger
}

export type DepsFactory = (log: FastifyBaseLogger) => Promise<Deps>

export const createDeps: DepsFactory = async (log) => {
  const cache = new Cache(config.REDIS_URL, log)
  await cache.connect()

  const db = new Db(process.env.DATABASE_URL, log)
  await db.init()

  const agentHash = new AgentHash(process.env.IP_SALT)

  return {
    cache,
    db,
    agentHash,
    insights: new InsightsStore(cache, db),
    fanOut,
    log,
  }
}

export const closeDeps = async (deps: Deps): Promise<void> => {
  await deps.cache.close()
  await deps.db.close()
}
