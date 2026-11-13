// Integrations
import type { Cache } from '../cache/redis.js'
import type { Db } from '../db/index.js'
import { probeProvider, recordHour, type ComponentStatus } from './health-history.js'

export type ProbeResult = {
  statuses: ComponentStatus[]
  redis: boolean
  postgres: boolean
  ok: boolean
}

/**
 * Checa todos os componentes e grava a vela da hora.
 *
 * Existe separado da rota `/health` porque a rota só roda quando alguém
 * chama — e o histórico ficava com buracos nas horas em que ninguém abria
 * a página (de madrugada, por exemplo). O agendador chama esta função de
 * tempos em tempos, então a vela existe mesmo sem tráfego.
 */
export const probeAll = async (cache: Cache, db: Db): Promise<ProbeResult> => {
  const [providerA, providerB, providerC, redisOk] = await Promise.all([
    probeProvider('a'),
    probeProvider('b'),
    probeProvider('c'),
    cache.ping(),
  ])

  const pgOk = db.enabled ? await db.ping() : false

  const statuses: ComponentStatus[] = [
    { component: 'aggregator', ok: true, detail: 'liveness' },
    { component: 'redis', ok: redisOk, detail: redisOk ? 'PONG' : 'sem resposta' },
    ...(db.enabled
      ? [
          {
            component: 'postgres',
            ok: pgOk,
            detail: pgOk ? 'conexão ok' : 'sem resposta',
          },
        ]
      : []),
    providerA,
    providerB,
    providerC,
  ]

  // um probe sem Redis não pode falhar o agendamento inteiro: se o cache
  // está fora, não há onde gravar a vela de qualquer forma
  await recordHour(cache, statuses).catch(() => undefined)

  return {
    statuses,
    redis: redisOk,
    postgres: db.enabled && pgOk,
    ok: statuses.every((s) => s.ok),
  }
}

export const PROBE_INTERVAL_MS = 5 * 60_000

/**
 * Roda o probe agora e a cada 5 minutos.
 *
 * Cinco minutos é o menor intervalo que ainda cabe em 12 amostras por hora
 * sem sobrecarregar a instância — cada rodada faz 3 chamadas HTTP aos
 * providers e checa Redis/Postgres. Um minuto seria 60× mais tráfego para
 * uma vela que representa uma hora.
 *
 * `unref()` deixa o processo encerrar sem esperar o timer, importante para
 * os testes não pendurarem o runner.
 */
export const startProbeLoop = (
  cache: Cache,
  db: Db,
  log?: { warn: (m: string) => void },
): NodeJS.Timeout => {
  const run = () => {
    void probeAll(cache, db).catch((err) => {
      log?.warn(
        `probe falhou: ${err instanceof Error ? err.message : String(err)}`,
      )
    })
  }

  run()
  const timer = setInterval(run, PROBE_INTERVAL_MS)
  timer.unref()

  return timer
}