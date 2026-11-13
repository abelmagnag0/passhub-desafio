const ALIASES: Record<string, string> = {
  latam: 'LATAM',
  'latam airlines': 'LATAM',
  gol: 'GOL',
  'gol linhas aereas': 'GOL',
  azul: 'AZUL',
  'azul linhas aereas': 'AZUL',
  voepass: 'VOEPASS',
  passaredo: 'VOEPASS',
}

export const canonicalAirline = (raw: string): string => {
  const key = raw
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase()

  return ALIASES[key] ?? raw.trim().toUpperCase()
}
