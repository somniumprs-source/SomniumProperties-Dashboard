import Database from 'better-sqlite3'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DB_PATH = process.env.DB_PATH || path.join(__dirname, '../../data/somnium.db')

// Ensure data directory exists
import fs from 'fs'
fs.mkdirSync(path.dirname(DB_PATH), { recursive: true })

const db = new Database(DB_PATH)
db.pragma('journal_mode = WAL')
db.pragma('foreign_keys = ON')

// ── Schema ──────────────────────────────────────────────────

db.exec(`
  -- Pipeline Imóveis
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
    zonas TEXT, -- JSON array
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
    pontos_fortes TEXT,
    pontos_fracos TEXT,
    riscos TEXT,
    localizacao_imagem TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now')),
    synced_at TEXT
  );

  -- Investidores
  CREATE TABLE IF NOT EXISTS investidores (
    id TEXT PRIMARY KEY,
    notion_id TEXT UNIQUE,
    nome TEXT NOT NULL,
    status TEXT DEFAULT 'Potencial Investidor',
    classificacao TEXT, -- A/B/C/D
    pontuacao INTEGER DEFAULT 0,
    capital_min REAL DEFAULT 0,
    capital_max REAL DEFAULT 0,
    montante_investido REAL DEFAULT 0,
    numero_negocios INTEGER DEFAULT 0,
    estrategia TEXT, -- JSON array
    origem TEXT,
    nda_assinado INTEGER DEFAULT 0,
    tipo_investidor TEXT, -- JSON array
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
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now')),
    synced_at TEXT
  );

  -- Consultores
  CREATE TABLE IF NOT EXISTS consultores (
    id TEXT PRIMARY KEY,
    notion_id TEXT UNIQUE,
    nome TEXT NOT NULL,
    estatuto TEXT DEFAULT 'Cold Call',
    tipo TEXT,
    classificacao TEXT, -- A/B/C/D
    imobiliaria TEXT, -- JSON array
    zonas TEXT, -- JSON array
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
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now')),
    synced_at TEXT
  );

  -- Faturação (Negócios/Deals)
  CREATE TABLE IF NOT EXISTS negocios (
    id TEXT PRIMARY KEY,
    notion_id TEXT UNIQUE,
    movimento TEXT NOT NULL,
    categoria TEXT, -- Wholesalling | CAEP | Mediação Imobiliária | Fix and Flip
    fase TEXT, -- Fase de obras | Fase de venda | Vendido
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
    investidor_ids TEXT, -- JSON array of IDs
    consultor_ids TEXT, -- JSON array of IDs
    notas TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now')),
    synced_at TEXT,
    FOREIGN KEY (imovel_id) REFERENCES imoveis(id)
  );

  -- Despesas
  CREATE TABLE IF NOT EXISTS despesas (
    id TEXT PRIMARY KEY,
    notion_id TEXT UNIQUE,
    movimento TEXT NOT NULL,
    categoria TEXT,
    data TEXT,
    custo_mensal REAL DEFAULT 0,
    custo_anual REAL DEFAULT 0,
    timing TEXT, -- Mensalmente | Anual | Único
    notas TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now')),
    synced_at TEXT
  );

  -- Tarefas
  CREATE TABLE IF NOT EXISTS tarefas (
    id TEXT PRIMARY KEY,
    notion_id TEXT UNIQUE,
    tarefa TEXT NOT NULL,
    status TEXT DEFAULT 'A fazer',
    inicio TEXT,
    fim TEXT,
    funcionario TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  );

  -- Documentos enviados a investidores (historico)
  CREATE TABLE IF NOT EXISTS documentos_investidor (
    id TEXT PRIMARY KEY,
    investidor_id TEXT NOT NULL,
    imovel_id TEXT,
    tipo TEXT NOT NULL,
    nome TEXT NOT NULL,
    notas TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS idx_docsinv_investidor ON documentos_investidor(investidor_id);

  -- Audit log (para backup e recovery)
  CREATE TABLE IF NOT EXISTS audit_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    tabela TEXT NOT NULL,
    registo_id TEXT NOT NULL,
    acao TEXT NOT NULL, -- INSERT | UPDATE | DELETE
    dados_anteriores TEXT, -- JSON
    dados_novos TEXT, -- JSON
    created_at TEXT DEFAULT (datetime('now'))
  );

  -- Sync state (controlo de sincronização Notion)
  CREATE TABLE IF NOT EXISTS sync_state (
    tabela TEXT PRIMARY KEY,
    last_sync TEXT,
    notion_db_id TEXT,
    status TEXT DEFAULT 'ok'
  );

  -- Índices para performance
  CREATE INDEX IF NOT EXISTS idx_imoveis_estado ON imoveis(estado);
  CREATE INDEX IF NOT EXISTS idx_imoveis_zona ON imoveis(zona);
  CREATE INDEX IF NOT EXISTS idx_investidores_status ON investidores(status);
  CREATE INDEX IF NOT EXISTS idx_investidores_classificacao ON investidores(classificacao);
  CREATE INDEX IF NOT EXISTS idx_consultores_estatuto ON consultores(estatuto);
  CREATE INDEX IF NOT EXISTS idx_negocios_fase ON negocios(fase);
  CREATE INDEX IF NOT EXISTS idx_negocios_categoria ON negocios(categoria);
  CREATE INDEX IF NOT EXISTS idx_despesas_timing ON despesas(timing);
  CREATE INDEX IF NOT EXISTS idx_audit_tabela ON audit_log(tabela, registo_id);
`)

export default db
export { DB_PATH }
