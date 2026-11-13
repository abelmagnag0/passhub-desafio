// Dependencies
import type { FastifyInstance } from 'fastify'

// Container
import type { Deps } from '../../container.js'

// Controller
import { createSearchController } from './controller.js'
import { searchSchema } from './openapi.js'

export const searchRoutes = (app: FastifyInstance, deps: Deps): void => {
  app.post('/search', { schema: searchSchema }, createSearchController(deps))
}
