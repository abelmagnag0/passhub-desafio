export const SCHEMA = `
CREATE TABLE IF NOT EXISTS providers (
  id CHAR(1) PRIMARY KEY,
  name TEXT NOT NULL,
  commission_pct NUMERIC(5,3) NOT NULL CHECK (commission_pct >= 0)
);

INSERT INTO providers (id, name, commission_pct) VALUES
  ('a', 'provider-a', 0.010),
  ('b', 'provider-b', 0.015),
  ('c', 'provider-c', 0.020)
ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS searches (
  id BIGSERIAL PRIMARY KEY,
  origin CHAR(3) NOT NULL,
  destination CHAR(3) NOT NULL,
  flight_date DATE NOT NULL,
  strategy TEXT NOT NULL,
  partial BOOLEAN NOT NULL,
  total_flights INT NOT NULL,
  latency_ms INT NOT NULL,
  cache_hit BOOLEAN NOT NULL DEFAULT false,
  agent_hash TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS search_offers (
  id BIGSERIAL PRIMARY KEY,
  search_id BIGINT NOT NULL REFERENCES searches(id) ON DELETE CASCADE,
  airline TEXT NOT NULL,
  provider CHAR(1) NOT NULL REFERENCES providers(id),
  chosen BOOLEAN NOT NULL,
  price NUMERIC(10,2) NOT NULL,
  departure_time TEXT,
  arrival_time TEXT
);

CREATE TABLE IF NOT EXISTS clicks (
  id BIGSERIAL PRIMARY KEY,
  search_id BIGINT REFERENCES searches(id) ON DELETE SET NULL,
  provider CHAR(1) NOT NULL REFERENCES providers(id),
  price NUMERIC(10,2) NOT NULL,
  route TEXT NOT NULL,
  agent_hash TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE searches ADD COLUMN IF NOT EXISTS cache_hit BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE searches ADD COLUMN IF NOT EXISTS agent_hash TEXT;

ALTER TABLE search_offers ADD COLUMN IF NOT EXISTS departure_time TEXT;
ALTER TABLE search_offers ADD COLUMN IF NOT EXISTS arrival_time TEXT;

ALTER TABLE search_offers DROP COLUMN IF EXISTS commission_pct;

CREATE INDEX IF NOT EXISTS idx_searches_created ON searches (created_at);
CREATE INDEX IF NOT EXISTS idx_searches_route ON searches (origin, destination, created_at);
CREATE INDEX IF NOT EXISTS idx_offers_search ON search_offers (search_id);
CREATE INDEX IF NOT EXISTS idx_offers_provider ON search_offers (provider);
CREATE INDEX IF NOT EXISTS idx_clicks_created ON clicks (created_at);
CREATE INDEX IF NOT EXISTS idx_clicks_search ON clicks (search_id);
`
