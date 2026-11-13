// Dependencies
import type { Pool } from 'pg'

export async function funnel(
  pool: Pool,
  days = 7,
): Promise<{
    searches: number
    clicks: number
    conversion: number
    distinctAgents: number
    byProvider: Array<{ provider: string; clicks: number }>
    topRoutes: Array<{
      route: string
      searches: number
      clicks: number
      conversion: number
    }>
  }> {
    if (!pool) throw new Error('postgres não configurado')

    const [totais, agentes, provs, rotas] = await Promise.all([

      pool.query<{ searches: string; clicks: string }>(
        `SELECT count(*) AS searches,
                (SELECT count(DISTINCT c.search_id)
                   FROM clicks c JOIN searches s2 ON s2.id = c.search_id
                  WHERE s2.created_at >= now() - ($1 || ' days')::interval
                    AND s2.strategy <> 'proof'
                    AND c.created_at  >= now() - ($1 || ' days')::interval
                ) AS clicks
           FROM searches
          WHERE created_at >= now() - ($1 || ' days')::interval
            AND strategy <> 'proof'`,
        [days],
      ),
      pool.query<{ agentes: string }>(
        `SELECT count(DISTINCT agent_hash) AS agentes
           FROM searches
          WHERE created_at >= now() - ($1 || ' days')::interval
            AND strategy <> 'proof'
            AND agent_hash IS NOT NULL`,
        [days],
      ),
      pool.query<{ provider: string; clicks: string }>(
        `SELECT provider, count(*) AS clicks
           FROM clicks
          WHERE created_at >= now() - ($1 || ' days')::interval
          GROUP BY provider
          ORDER BY clicks DESC`,
        [days],
      ),
      pool.query<{ route: string; searches: string; clicks: string }>(
        `SELECT s.origin || ' → ' || s.destination    AS route,
                count(*)                              AS searches,
                count(DISTINCT c.search_id)           AS clicks
           FROM searches s
           LEFT JOIN clicks c ON c.search_id = s.id
          WHERE s.created_at >= now() - ($1 || ' days')::interval
            AND s.strategy <> 'proof'
          GROUP BY 1
          ORDER BY searches DESC, clicks DESC
          LIMIT 5`,
        [days],
      ),
    ])

    const searches = Number(totais.rows[0]?.searches ?? 0)
    const convertidas = Number(totais.rows[0]?.clicks ?? 0)

    return {
      searches,
      clicks: convertidas,
      conversion: searches > 0 ? Number((convertidas / searches).toFixed(3)) : 0,
      distinctAgents: Number(agentes.rows[0]?.agentes ?? 0),
      byProvider: provs.rows.map((r) => ({
        provider: r.provider,
        clicks: Number(r.clicks),
      })),
      topRoutes: rotas.rows.map((r) => {
        const s = Number(r.searches)
        const c = Number(r.clicks)
        return {
          route: r.route,
          searches: s,
          clicks: c,
          conversion: s > 0 ? Number((c / s).toFixed(3)) : 0,
        }
      }),
    }
  }

export async function insights(
  pool: Pool,
): Promise<Record<string, unknown>> {
    if (!pool) throw new Error('postgres não configurado')
    const [volume, providers, revenue, routes, latency] =
      await Promise.all([
        pool.query(`
          WITH horas AS (
            SELECT date_trunc('hour', created_at) AS hour,
                   count(*) AS searches,
                   count(*) FILTER (WHERE cache_hit) AS cache_hits,
                   avg(latency_ms)::int AS avg_latency,
                   count(*) FILTER (WHERE partial) AS partial
              FROM searches
             WHERE strategy <> 'proof'
             GROUP BY 1
            UNION ALL
            SELECT date_trunc('hour', created_at), 0, 0, NULL, 0
              FROM clicks
             WHERE date_trunc('hour', created_at) NOT IN (
               SELECT date_trunc('hour', created_at) FROM searches
             )
          )
          SELECT h.hour, sum(h.searches)::int AS searches,
                 sum(h.cache_hits)::int AS cache_hits,
                 (avg(h.avg_latency))::int AS avg_latency,
                 sum(h.partial)::int AS partial,
                 (SELECT count(*) FROM clicks c
                   WHERE date_trunc('hour', c.created_at) = h.hour)::int AS clicks
            FROM horas h
           GROUP BY h.hour ORDER BY h.hour DESC LIMIT 24`),

        pool.query(`
          SELECT p.id AS provider,
                 p.commission_pct AS commission,
                 coalesce(o.wins, 0)   AS wins,
                 coalesce(c.clicks, 0) AS clicks
            FROM providers p
            LEFT JOIN (
              SELECT provider, count(*) FILTER (WHERE chosen) AS wins
                FROM search_offers GROUP BY provider
            ) o ON o.provider = p.id
            LEFT JOIN (
              SELECT provider, count(*) AS clicks FROM clicks GROUP BY provider
            ) c ON c.provider = p.id
           ORDER BY p.id`),

        pool.query(`
          SELECT
            (SELECT count(*) FROM searches WHERE strategy <> 'proof')
                                                                AS total_searches,
            (SELECT count(*) FROM searches
              WHERE cache_hit AND strategy <> 'proof')          AS total_cache_hits,
            (SELECT count(*) FROM clicks)                       AS total_clicks,
            (SELECT coalesce(sum(c.price * p.commission_pct), 0)
               FROM clicks c
               JOIN providers p ON p.id = c.provider)           AS projected_revenue`),
        pool.query(`
          SELECT s.origin || ' → ' || s.destination AS route,
                 count(DISTINCT s.id) AS searches,
                 avg(s.latency_ms)::int AS avg_latency
            FROM searches s
           WHERE s.strategy <> 'proof'
           GROUP BY 1 ORDER BY searches DESC LIMIT 5`),
        pool.query(`
          SELECT percentile_cont(0.95) WITHIN GROUP (ORDER BY latency_ms)::int AS p95,
                 percentile_cont(0.50) WITHIN GROUP (ORDER BY latency_ms)::int AS p50
            FROM searches WHERE strategy <> 'proof'`),
      ])

    const totalSearches = Number(revenue.rows[0]!.total_searches)
    const cacheHits = Number(revenue.rows[0]!.total_cache_hits)

    return {
      volume: volume.rows,
      providers: providers.rows,
      routes: routes.rows,
      totals: {
        ...revenue.rows[0],
        cache_hits: cacheHits,
        cache_hit_rate:
          totalSearches > 0
            ? Math.round((cacheHits / totalSearches) * 100)
            : 0,
        p50_ms: latency.rows[0]!.p50,
        p95_ms: latency.rows[0]!.p95,
      },
    }
  }
