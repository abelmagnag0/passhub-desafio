// Dependencies
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { FastifyInstance } from 'fastify'
import fastifyStatic from '@fastify/static'

const UI_ROUTES: Record<string, string> = {
  '/': 'busca',
  '/cotacoes': 'busca',
  '/dashboard': 'metricas',
  '/status': 'saude',
  '/telemetria': 'telemetria',
}

const TITLES: Record<string, string> = {
  busca: 'PassHub — Cotar valores',
  metricas: 'PassHub — Dashboard',
  saude: 'PassHub — Status do sistema',
  telemetria: 'PassHub — Telemetria',
}

const renderShell = (shell: string, tab: string): string =>
  shell
    .replace(
      /<section id="tab-busca" class="tab active">/,
      '<section id="tab-busca" class="tab">',
    )
    .replace(
      new RegExp(`<section id="tab-${tab}" class="tab">`),
      `<section id="tab-${tab}" class="tab active">`,
    )
    .replace(
      /<a class="nav-item active" href="\/cotacoes" data-nav="busca">/,
      '<a class="nav-item" href="/cotacoes" data-nav="busca">',
    )
    .replace(
      new RegExp(`<a class="nav-item" href="[^"]*" data-nav="${tab}">`),
      (m) => m.replace('class="nav-item"', 'class="nav-item active"'),
    )
    .replace(/<title>[^<]*<\/title>/, `<title>${TITLES[tab]}</title>`)

export const uiRoutes = async (app: FastifyInstance): Promise<void> => {
  const publicDir = new URL('../../../public', import.meta.url).pathname
  await app.register(fastifyStatic, { root: publicDir })

  const shell = readFileSync(join(publicDir, 'index.html'), 'utf8')

  for (const [route, tab] of Object.entries(UI_ROUTES)) {
    app.get(route, { schema: { hide: true } }, (_req, reply) =>
      reply
        .type('text/html')

        .header('cache-control', 'no-cache, must-revalidate')
        .send(renderShell(shell, tab)),
    )
  }
}
