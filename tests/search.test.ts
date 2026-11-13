import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { adapters } from '../src/core/search/adapters/index.js'
import { consolidate } from '../src/core/search/service.js'
import { select, PREMIUM_PCT, PREMIUM_ABS } from '../src/core/search/selection.js'
import { providers } from '../src/config/index.js'

const DATE = '2026-10-12'
const fixture = (name: string) =>
  JSON.parse(readFileSync(`tests/fixtures/${name}.json`, 'utf-8'))

const allOffers = () =>
  [
    adapters.a(fixture('provider-a'), DATE),
    adapters.b(fixture('provider-b'), DATE),
    adapters.c(fixture('provider-c'), DATE),
  ].flatMap(r => r.offers)

describe('consolidate com dados reais dos mocks', () => {
  it('reduz 120 ofertas válidas para 60 voos únicos', () => {
    const flights = consolidate(allOffers(), providers)
    expect(allOffers()).toHaveLength(120)
    expect(flights).toHaveLength(60)
  })

  it('detecta os grupos com mais de uma oferta', () => {
    const flights = consolidate(allOffers(), providers)
    const multi = flights.filter(f => f.offeredBy.length > 1)
    expect(multi.length).toBe(45)
    expect(flights.every(f => f.offeredBy.length <= 3)).toBe(true)
  })

  it('mantém TODOS os voos da Passaredo/Voepass unificados', () => {
    const flights = consolidate(allOffers(), providers)
    const voepass = flights.filter(f => f.airline === 'VOEPASS')
    expect(
      voepass.every(f => f.offeredBy.every(p => ['a', 'b', 'c'].includes(p))),
    ).toBe(true)

    expect(flights.filter(f => f.airline === 'PASSAREDO')).toHaveLength(0)
  })

  it('está em ordem determinística (partida, preço, companhia)', () => {
    const flights = consolidate(allOffers(), providers)
    const sorted = [...flights].sort(
      (a, b) =>
        a.departure.localeCompare(b.departure) ||
        a.price - b.price ||
        a.airline.localeCompare(b.airline),
    )
    expect(flights).toEqual(sorted)
  })
})

describe('regra de seleção (guarda de preço)', () => {
  const mk = (provider: 'a' | 'b' | 'c', price: number) => ({
    airline: 'GOL',
    flightDate: DATE,
    departure: '2026-10-12T08:00:00Z',
    arrival: '2026-10-12T11:00:00Z',
    price,
    currency: 'BRL' as const,
    provider,
  })

  it('escolhe maior comissão quando dentro do teto', () => {
    const r = select([mk('a', 1000), mk('b', 1005)], providers)
    expect(r.offer.provider).toBe('b')
  })

  it('volta pro menor preço quando a comissão estoura o teto', () => {
    const cheapest = mk('a', 500)
    const expensive = mk('c', 560)
    const r = select([cheapest, expensive], providers)
    expect(r.offer.provider).toBe('a')
    expect(r.reason).toContain('guarda de preço')
  })

  it('não pula a oferta do meio que cabe no teto', () => {
    // C paga mais comissão, mas custa 20% a mais que a mais barata.
    // B cabe no teto e paga mais que A; a escolha não pode cair direto em A.
    const r = select([mk('a', 1000), mk('b', 1020), mk('c', 1200)], providers)
    expect(r.offer.provider).toBe('b')
    expect(r.reason).toContain('maior comissão permitida')
  })

  it('aceita exatamente o teto absoluto em voo caro', () => {
    const cheapest = mk('a', 2000)
    const noTeto = mk('c', 2030)
    const r = select([cheapest, noTeto], providers)
    expect(r.offer.provider).toBe('c')
  })

  it('o teto absoluto vence o percentual em voos caros', () => {

    const cheapest = mk('a', 2000)
    const foraDoTeto = mk('c', 2030.01)
    const r = select([cheapest, foraDoTeto], providers)
    expect(r.offer.provider).toBe('a')
    expect(r.reason).toContain('guarda de preço')
  })

  it('comissão única-vencedora rende mais que a concorrente no mesmo voo', () => {
    const group = [mk('a', 1000), mk('b', 1000), mk('c', 1000)]
    const r = select(group, providers)
    expect(r.offer.provider).toBe('c')
  })

  it('comissão maior com mesmo preço não paga prêmio ao cliente', () => {
    const r = select([mk('a', 1000), mk('c', 1000)], providers)
    expect(r.offer.provider).toBe('c')
    expect(r.reason).toBe('maior comissão sem custo ao cliente')
  })

  it('savings reflete o desconto que o cliente teria', () => {
    const flights = consolidate(allOffers(), providers)
    expect(flights.every(f => f.savings >= 0)).toBe(true)
    const withSavings = flights.filter(f => f.savings > 0)
    expect(withSavings.length).toBeGreaterThan(0)
  })

  it('todas as comissões conhecidas estão configuradas', () => {
    expect(providers.a.commission).toBe(0.01)
    expect(providers.b.commission).toBe(0.015)
    expect(providers.c.commission).toBe(0.02)
  })
})

describe('comparativo que justifica a regra adotada', () => {
  const receita = (flights: ReturnType<typeof consolidate>) =>
    flights.reduce(
      (acc, f) => acc + f.price * (providers[f.provider]?.commission ?? 0),
      0,
    )

  it('a guarda de preço supera o menor preço em ~28%', () => {
    const offers = allOffers()
    const comGuarda = consolidate(offers, providers)
    // menor preço em todo voo disputável, para comparar
    const soMenor = consolidate(offers, providers).map(f => {
      const grupo = offers.filter(
        o => o.airline === f.airline && o.departure === f.departure && o.arrival === f.arrival,
      )
      const barato = grupo.reduce((b, o) => (o.price < b.price ? o : b))
      return { ...f, price: barato.price, provider: barato.provider }
    })

    const rGuarda = receita(comGuarda)
    const rMenor = receita(soMenor)
    const ganho = (rGuarda / rMenor - 1) * 100

    expect(rMenor).toBeCloseTo(668.70, 0)
    expect(rGuarda).toBeCloseTo(858.77, 0)
    expect(ganho).toBeGreaterThan(25)
    expect(ganho).toBeLessThan(32)
  })

  it('a guarda nunca faz o cliente pagar mais de 5% sobre o menor preço', () => {
    const flights = consolidate(allOffers(), providers)
    for (const f of flights) {
      const teto = Math.min(f.savings, f.price * PREMIUM_PCT, PREMIUM_ABS)
      expect(f.savings).toBeLessThanOrEqual(Math.min(f.price * PREMIUM_PCT, PREMIUM_ABS) + 0.01)
      expect(teto).toBeGreaterThanOrEqual(0)
    }
  })

  it('as regras de referência existem mas não são servidas pela API', async () => {
    const mod = await import('../src/core/search/selection.js')
    expect(mod.selectLowestPrice).toBeTypeOf('function')
    expect(mod.selectMaxCommission).toBeTypeOf('function')
    expect(mod.STRATEGY_NAME).toBe('commission_guarded')
    // a API não expõe enum de estratégia
    expect('strategySchema' in mod).toBe(false)
  })
})
