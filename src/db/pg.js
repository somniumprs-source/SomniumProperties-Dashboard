/**
 * PostgreSQL connection pool (Supabase).
 * Drop-in replacement for schema.js SQLite.
 */
import pg from 'pg'

const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://postgres.mjgusjuougzoeiyavsor:alexandre.joao.25@aws-0-eu-west-1.pooler.supabase.com:6543/postgres'

const pool = new pg.Pool({
  connectionString: DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  max: 10,
  idleTimeoutMillis: 30000,
})

pool.on('error', (err) => {
  console.error('[pg] Pool error:', err.message)
})

// ── Schema creation ──────────────────────────────────────────
export async function initSchema() {
  const client = await pool.connect()
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS imoveis (
        id TEXT PRIMARY KEY,
        notion_id TEXT UNIQUE,
        nome TEXT NOT NULL,
        estado TEXT DEFAULT 'Adicionado',
        tipologia TEXT,
        ask_price REAL DEFAULT 0,
        valor_proposta REAL DEFAULT 0,
        custo_estimado_obra REAL DEFAULT 0,
        valor_venda_remodelado REAL DEFAULT 0,
        roi REAL,
        roi_anualizado REAL,
        area_util REAL,
        area_bruta REAL,
        origem TEXT,
        zona TEXT,
        zonas TEXT,
        nome_consultor TEXT,
        modelo_negocio TEXT,
        motivo_descarte TEXT,
        link TEXT,
        data_adicionado TEXT,
        data_chamada TEXT,
        data_visita TEXT,
        data_estudo_mercado TEXT,
        data_proposta TEXT,
        data_proposta_aceite TEXT,
        data_follow_up TEXT,
        data_aceite_investidor TEXT,
        notas TEXT,
        created_at TEXT DEFAULT (NOW()::TEXT),
        updated_at TEXT DEFAULT (NOW()::TEXT),
        synced_at TEXT
      );

      CREATE TABLE IF NOT EXISTS investidores (
        id TEXT PRIMARY KEY,
        notion_id TEXT UNIQUE,
        nome TEXT NOT NULL,
        status TEXT DEFAULT 'Potencial Investidor',
        classificacao TEXT,
        pontuacao REAL DEFAULT 0,
        capital_min REAL DEFAULT 0,
        capital_max REAL DEFAULT 0,
        montante_investido REAL DEFAULT 0,
        numero_negocios INTEGER DEFAULT 0,
        estrategia TEXT,
        origem TEXT,
        nda_assinado INTEGER DEFAULT 0,
        tipo_investidor TEXT,
        perfil_risco TEXT,
        telemovel TEXT,
        email TEXT,
        proxima_acao TEXT,
        roi_investidor REAL,
        roi_anualizado_investidor REAL,
        motivo_nao_aprovacao TEXT,
        motivo_inatividade TEXT,
        data_reuniao TEXT,
        data_primeiro_contacto TEXT,
        data_ultimo_contacto TEXT,
        data_capital_transferido TEXT,
        data_proxima_acao TEXT,
        data_apresentacao_negocio TEXT,
        data_aprovacao_negocio TEXT,
        data_follow_up TEXT,
        notas TEXT,
        created_at TEXT DEFAULT (NOW()::TEXT),
        updated_at TEXT DEFAULT (NOW()::TEXT),
        synced_at TEXT
      );

      CREATE TABLE IF NOT EXISTS consultores (
        id TEXT PRIMARY KEY,
        notion_id TEXT UNIQUE,
        nome TEXT NOT NULL,
        estatuto TEXT DEFAULT 'Cold Call',
        tipo TEXT,
        classificacao TEXT,
        imobiliaria TEXT,
        zonas TEXT,
        contacto TEXT,
        email TEXT,
        equipa_remax TEXT,
        data_inicio TEXT,
        data_follow_up TEXT,
        data_proximo_follow_up TEXT,
        motivo_follow_up TEXT,
        imoveis_enviados INTEGER DEFAULT 0,
        imoveis_off_market INTEGER DEFAULT 0,
        meta_mensal_leads INTEGER DEFAULT 0,
        comissao REAL DEFAULT 0,
        data_primeira_call TEXT,
        lucro_gerado REAL DEFAULT 0,
        motivo_descontinuacao TEXT,
        notas TEXT,
        created_at TEXT DEFAULT (NOW()::TEXT),
        updated_at TEXT DEFAULT (NOW()::TEXT),
        synced_at TEXT
      );

      CREATE TABLE IF NOT EXISTS negocios (
        id TEXT PRIMARY KEY,
        notion_id TEXT UNIQUE,
        movimento TEXT NOT NULL,
        categoria TEXT,
        fase TEXT,
        lucro_estimado REAL DEFAULT 0,
        lucro_real REAL DEFAULT 0,
        custo_real_obra REAL DEFAULT 0,
        capital_total REAL DEFAULT 0,
        n_investidores INTEGER DEFAULT 0,
        quota_somnium REAL DEFAULT 0,
        pagamento_em_falta INTEGER DEFAULT 1,
        data TEXT,
        data_compra TEXT,
        data_estimada_venda TEXT,
        data_venda TEXT,
        imovel_id TEXT,
        investidor_ids TEXT,
        consultor_ids TEXT,
        notas TEXT,
        created_at TEXT DEFAULT (NOW()::TEXT),
        updated_at TEXT DEFAULT (NOW()::TEXT),
        synced_at TEXT
      );

      CREATE TABLE IF NOT EXISTS despesas (
        id TEXT PRIMARY KEY,
        notion_id TEXT UNIQUE,
        movimento TEXT NOT NULL,
        categoria TEXT,
        data TEXT,
        custo_mensal REAL DEFAULT 0,
        custo_anual REAL DEFAULT 0,
        timing TEXT,
        notas TEXT,
        created_at TEXT DEFAULT (NOW()::TEXT),
        updated_at TEXT DEFAULT (NOW()::TEXT),
        synced_at TEXT
      );

      CREATE TABLE IF NOT EXISTS tarefas (
        id TEXT PRIMARY KEY,
        notion_id TEXT UNIQUE,
        tarefa TEXT NOT NULL,
        status TEXT DEFAULT 'A fazer',
        inicio TEXT,
        fim TEXT,
        funcionario TEXT,
        tempo_horas REAL DEFAULT 0,
        grupo_id TEXT,
        created_at TEXT DEFAULT (NOW()::TEXT),
        updated_at TEXT DEFAULT (NOW()::TEXT),
        synced_at TEXT
      );

      CREATE TABLE IF NOT EXISTS audit_log (
        id SERIAL PRIMARY KEY,
        tabela TEXT NOT NULL,
        registo_id TEXT NOT NULL,
        acao TEXT NOT NULL,
        dados_anteriores TEXT,
        dados_novos TEXT,
        created_at TEXT DEFAULT (NOW()::TEXT)
      );

      CREATE TABLE IF NOT EXISTS sync_state (
        tabela TEXT PRIMARY KEY,
        last_sync TEXT,
        notion_db_id TEXT,
        status TEXT DEFAULT 'ok'
      );

      CREATE INDEX IF NOT EXISTS idx_imoveis_estado ON imoveis(estado);
      CREATE INDEX IF NOT EXISTS idx_investidores_status ON investidores(status);
      CREATE INDEX IF NOT EXISTS idx_consultores_estatuto ON consultores(estatuto);
      CREATE INDEX IF NOT EXISTS idx_negocios_fase ON negocios(fase);
      CREATE INDEX IF NOT EXISTS idx_audit_tabela ON audit_log(tabela, registo_id);
    `)
    console.log('[pg] Schema criado/verificado')
  } finally {
    client.release()
  }
}

// ── Query helpers (compatible API with SQLite) ───────────────
export const query = (text, params) => pool.query(text, params)

export default pool
