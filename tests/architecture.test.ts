// Dependencies
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { describe, expect, it } from 'vitest'

const SRC = join(import.meta.dirname, '..', 'src')

const arquivos = (dir: string): string[] => {
  const out: string[] = []
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) out.push(...arquivos(full))
    else if (entry.endsWith('.ts')) out.push(full)
  }
  return out
}

const importsDe = (arquivo: string): string[] => {
  const conteudo = readFileSync(arquivo, 'utf-8')
  const specs: string[] = []
  for (const m of conteudo.matchAll(/from '([^']+)'/g)) specs.push(m[1]!)
  return specs
}

const camada = (arquivo: string): string => {
  const rel = relative(SRC, arquivo).replace(/\\/g, '/')
  const top = rel.split('/')[0]!
  return top.endsWith('.ts') ? 'raiz' : top
}

const destino = (arquivo: string, spec: string): string | null => {
  if (!spec.startsWith('.')) return null
  const norm = join(arquivo, '..', spec).replace(/\\/g, '/')
  const rel = relative(SRC, norm).replace(/\\/g, '/')
  if (rel.startsWith('..')) return null
  const top = rel.split('/')[0]!
  return top.endsWith('.ts') ? 'raiz' : top
}

const arquivosSrc = arquivos(SRC)

const violacoes = (origem: string, proibidos: string[]) =>
  arquivosSrc
    .filter((f) => camada(f) === origem)
    .flatMap((f) =>
      importsDe(f)
        .map((spec) => ({ f, spec, dest: destino(f, spec) }))
        .filter((d) => d.dest !== null && proibidos.includes(d.dest)),
    )
    .map(({ f, dest }) => `${relative(SRC, f)} → ${dest}`)

describe('arquitetura', () => {
  it('core não importa adapters, http nem config', () => {
    expect(violacoes('core', ['adapters', 'http', 'config'])).toEqual([])
  })

  it('core só usa bibliotecas puras (allowlist)', () => {
    const permitidos = new Set(['zod', 'node:crypto'])
    const proibidos = arquivosSrc
      .filter((f) => camada(f) === 'core')
      .flatMap((f) =>
        importsDe(f)
          .filter((s) => !s.startsWith('.') && !permitidos.has(s))
          .map((s) => `${relative(SRC, f)} → ${s}`),
      )
    expect(proibidos).toEqual([])
  })

  it('adapters não importa http', () => {
    expect(violacoes('adapters', ['http'])).toEqual([])
  })

  it('a raiz é o único lugar que conhece todas as camadas', () => {
    const comHttp = arquivosSrc.filter((f) =>
      importsDe(f).some((s) => destino(f, s) === 'http'),
    )
    const foraDaRaiz = comHttp
      .filter((f) => camada(f) !== 'raiz')
      .map((f) => relative(SRC, f))

    expect(foraDaRaiz.filter((f) => !f.startsWith('http/'))).toEqual([])
  })

  it('todos os arquivos de src são alcançáveis a partir do server', () => {
    const visitados = new Set<string>()
    const visitar = (arquivo: string) => {
      if (visitados.has(arquivo)) return
      visitados.add(arquivo)

      const conteudo = readFileSync(arquivo, 'utf-8')
      const specs = [
        ...conteudo.matchAll(/from '([^']+)'/g),
        ...conteudo.matchAll(/import\('([^']+)'\)/g),
      ].map((m) => m[1]!)
      for (const spec of specs) {
        if (!spec.startsWith('.')) continue
        const alvo = join(arquivo, '..', spec).replace(/\\/g, '/')
        visitar(alvo.endsWith('.js') ? alvo.slice(0, -3) + '.ts' : alvo)
      }
    }
    visitar(join(SRC, 'server.ts'))

    const orfaos = arquivosSrc
      .filter((f) => !visitados.has(f.replace(/\\/g, '/')))
      .map((f) => relative(SRC, f))

    expect(orfaos).toEqual([])
  })
})