import { startProbeLoop } from './adapters/telemetry/probe.js'
import { startTracing, stopTracing } from './adapters/telemetry/tracing.js'

startTracing()

const { buildApp } = await import('./app.js')
const { config } = await import('./config/index.js')

const app = await buildApp()
await app.listen({ port: config.PORT, host: '0.0.0.0' })

// grava a vela de disponibilidade a cada 5 min, mesmo sem tráfego:
// antes o histórico só existia quando alguém abria /health
startProbeLoop(app.deps.cache, app.deps.db, app.log)

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    app.close().finally(() => stopTracing().finally(() => process.exit(0)))
  })
}