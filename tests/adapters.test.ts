import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { adapters } from '../src/core/search/adapters/index.js'
import { canonicalAirline } from '../src/core/search/airlines.js'

const DATE = '2026-10-12'
const fixture = (name: string) =>
  JSON.parse(readFileSync(`tests/fixtures/${name}.json`, 'utf-8'))

describe('canonicalAirline', () => {
  it('normaliza acento e caixa', () => {
    expect(canonicalAirline('Gol Linhas Aéreas')).toBe('GOL')
    expect(canonicalAirline('Azul Linhas Aereas')).toBe('AZUL')
    expect(canonicalAirline('Latam Airlines')).toBe('LATAM')
  })

  it('resolve Passaredo como VOEPASS (rebrand de 2019)', () => {
    expect(canonicalAirline('Passaredo')).toBe('VOEPASS')
    expect(canonicalAirline('VOEPASS')).toBe('VOEPASS')
  })
})

describe('adapters com fixtures reais', () => {
  it('provider-a normaliza todas as 40 ofertas', () => {
    const { offers, issues } = adapters.a(fixture('provider-a'), DATE)
    expect(offers).toHaveLength(40)
    expect(issues).toHaveLength(0)
    expect(offers[0]).toMatchObject({
      airline: expect.any(String),
      price: expect.any(Number),
      currency: 'BRL',
      provider: 'a',
    })
  })

  it('provider-b converte centavos e invalida a linha em USD', () => {
    const { offers, issues } = adapters.b(fixture('provider-b'), DATE)
    expect(offers).toHaveLength(40)
    expect(issues).toHaveLength(1)
    expect(issues[0]).toContain('USD')
    expect(offers.every(o => o.currency === 'BRL')).toBe(true)
  })

  it('provider-c invalida a linha com fare 0', () => {
    const { offers, issues } = adapters.c(fixture('provider-c'), DATE)
    expect(offers).toHaveLength(40)
    expect(issues).toHaveLength(1)
    expect(issues[0]).toContain('preço inválido')
  })

  it('provider-b resolve voo que pernoita (22:30 -> 01:15)', () => {
    const { offers } = adapters.b(fixture('provider-b'), DATE)
    const overnight = offers.find(o => o.departure.slice(11, 16) === '22:30')
    expect(overnight?.arrival.slice(0, 10)).toBe('2026-10-13')
  })

  it('provider-a já recebe data completa do provider', () => {
    const { offers } = adapters.a(fixture('provider-a'), DATE)
    expect(offers[0]?.departure).toBe('2026-10-12T08:00:00Z')
  })
})
