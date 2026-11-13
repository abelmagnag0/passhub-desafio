// Dependencies
import type { FastifyInstance } from 'fastify'

// Container
import type { Deps } from '../container.js'

// Routes
import { docsRoutes } from './docs/index.js'
import { eventsRoutes } from './events/index.js'
import { funnelRoutes } from './funnel/index.js'
import { healthRoutes } from './health/index.js'
import { insightsRoutes } from './insights/index.js'
import { metricsRoutes } from './metrics/index.js'
import { searchRoutes } from './search/index.js'
import { statusRoutes } from './status/index.js'
import { telemetryRoutes } from './telemetry/index.js'
import { uiRoutes } from './ui/index.js'

export const registerRoutes = async (
  app: FastifyInstance,
  deps: Deps,
): Promise<void> => {
  await docsRoutes(app)
  await uiRoutes(app)

  metricsRoutes(app)
  healthRoutes(app, deps)
  searchRoutes(app, deps)
  eventsRoutes(app, deps)
  insightsRoutes(app, deps)
  funnelRoutes(app, deps)
  statusRoutes(app, deps)
  telemetryRoutes(app, deps)
}
