// Dependencies
import Fastify from 'fastify'

// Container
import { closeDeps, createDeps, type DepsFactory } from './container.js'

// Routes
import { registerRoutes } from './http/routes.js'

declare module 'fastify' {
  interface FastifyInstance {
    deps: Awaited<ReturnType<DepsFactory>>
  }
}

export const buildApp = async (depsFactory: DepsFactory = createDeps) => {
  const app = Fastify({
    logger: { level: process.env.LOG_LEVEL ?? 'info' },

    trustProxy: true,
  })

  const deps = await depsFactory(app.log)

  app.decorate('deps', deps)

  await registerRoutes(app, deps)

  const ROTAS_MEDIDAS = ['/search', '/events', '/insights', '/health', '/status']

  app.addHook('onResponse', async (req, reply) => {
    if (!ROTAS_MEDIDAS.some((r) => req.url.startsWith(r))) return
    void deps.insights.record({ type: 'request', status: reply.statusCode })
  })

  app.addHook('onClose', async () => {
    await closeDeps(deps)
  })

  return app
}
