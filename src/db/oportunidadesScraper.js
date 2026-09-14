/**
 * Fila de candidatos a imóvel devolvidos pela pesquisa diária Idealista via
 * Apify (SOP 1, secção 5.2.1). Ver supabase/migrations/0051_oportunidades_scraper.sql.
 * Port de supabase/functions/_shared/oportunidadesScraper.ts.
 */
import pool from './pg.js'

let _oportunidadesScraperEnsured = false
export async function ensureOportunidadesScraperTable() {
  if (_oportunidadesScraperEnsured) return
  await pool.query(`
    CREATE TABLE IF NOT EXISTS oportunidades_scraper (
      id TEXT PRIMARY KEY,
      property_code TEXT NOT NULL,
      link TEXT,
      concelho TEXT,
      zona TEXT,
      preco NUMERIC,
      preco_m2 NUMERIC,
      area NUMERIC,
      quartos INTEGER,
      casas_banho INTEGER,
      morada TEXT,
      distrito TEXT,
      freguesia TEXT,
      tipologia TEXT,
      predio_tipo TEXT,
      ano_construcao INTEGER,
      condicao TEXT,
      latitude NUMERIC,
      longitude NUMERIC,
      thumbnail TEXT,
      fotos_urls JSONB DEFAULT '[]',
      agencia_nome TEXT,
      agencia_telefone TEXT,
      agencia_url TEXT,
      sinal_equity_ano BOOLEAN DEFAULT false,
      sinal_equity_preco_m2 BOOLEAN DEFAULT false,
      preco_m2_referencia_usado NUMERIC,
      sinal_obras BOOLEAN DEFAULT false,
      estado TEXT NOT NULL DEFAULT 'pendente',
      motivo_rejeicao TEXT,
      imovel_id TEXT REFERENCES imoveis(id),
      decidido_por TEXT,
      decidido_em TIMESTAMPTZ,
      raw JSONB,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_oportunidades_scraper_estado ON oportunidades_scraper(estado, created_at DESC);
    DO $do$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'oportunidades_scraper_property_code_key') THEN
        ALTER TABLE oportunidades_scraper ADD CONSTRAINT oportunidades_scraper_property_code_key UNIQUE (property_code);
      END IF;
    END $do$;
  `)
  _oportunidadesScraperEnsured = true
}

// Seed inicial (setembro 2026) a partir dos relatórios públicos idealista.pt/media/relatorios-preco-habitacao/venda/.
// Coimbra, Porto, Matosinhos, Gondomar e Vila Nova de Gaia vieram de relatórios
// confirmados; Condeixa-a-Nova e Maia são estimativas (não confirmadas num
// relatório directo) — corrigir manualmente assim que houver dado real.
// Actualizar a cada 3-6 meses (ver plano da feature).
const SEED_PRECO_M2 = [
  ['Coimbra', 2543, 'idealista.pt relatório venda — maio 2026'],
  ['Condeixa-a-Nova', 1500, 'estimativa — não confirmado num relatório directo'],
  ['Porto', 3844, 'idealista.pt relatório venda'],
  ['Matosinhos', 3616, 'idealista.pt relatório venda — abril 2026'],
  ['Maia', 2400, 'estimativa — não confirmado num relatório directo'],
  ['Gondomar', 2296, 'idealista.pt relatório venda — fevereiro 2026'],
  ['Vila Nova de Gaia', 2875, 'idealista.pt relatório venda — março 2026'],
]

let _precoM2ReferenciaEnsured = false
export async function ensurePrecoM2ReferenciaTable() {
  if (_precoM2ReferenciaEnsured) return
  await pool.query(`
    CREATE TABLE IF NOT EXISTS preco_m2_referencia (
      concelho TEXT PRIMARY KEY,
      preco_m2_medio NUMERIC NOT NULL,
      actualizado_em TIMESTAMPTZ DEFAULT NOW(),
      fonte TEXT
    );
  `)
  for (const [concelho, preco, fonte] of SEED_PRECO_M2) {
    await pool.query(
      `INSERT INTO preco_m2_referencia (concelho, preco_m2_medio, fonte) VALUES ($1, $2, $3)
       ON CONFLICT (concelho) DO NOTHING`,
      [concelho, preco, fonte]
    )
  }
  _precoM2ReferenciaEnsured = true
}
