import { startTracing, stopTracing } from './adapters/telemetry/tracing.js'

startTracing()

const { buildApp } = await import('./app.js')
const { config } = await import('./config/index.js')

const app = await buildApp()
await app.listen({ port: config.PORT, host: '0.0.0.0' })

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    app.close().finally(() => stopTracing().finally(() => process.exit(0)))
  })
}