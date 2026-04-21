/**
 * PostgreSQL connection pool (Supabase).
 * Drop-in replacement for schema.js SQLite.
 */
import pg from 'pg'

const DATABASE_URL = process.env.DATABASE_URL
if (!DATABASE_URL) {
  console.error('[pg] ERRO: DATABASE_URL não está definido. Adiciona ao ficheiro .env')
  process.exit(1)
}

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
        documentos TEXT,
        notas TEXT,
        created_at TEXT DEFAULT (NOW()::TEXT),
        updated_at TEXT DEFAULT (NOW()::TEXT),
        synced_at TEXT
      );

      CREATE TABLE IF NOT EXISTS tarefas (
        id TEXT PRIMARY KEY,
        notion_id TEXT UNIQUE,
        gcal_event_id TEXT,
        tarefa TEXT NOT NULL,
        status TEXT DEFAULT 'A fazer',
        categoria TEXT,
        inicio TEXT,
        fim TEXT,
        funcionario TEXT,
        tempo_horas REAL DEFAULT 0,
        grupo_id TEXT,
        created_at TEXT DEFAULT (NOW()::TEXT),
        updated_at TEXT DEFAULT (NOW()::TEXT),
        synced_at TEXT,
        gcal_synced_at TEXT
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

      CREATE TABLE IF NOT EXISTS reunioes (
        id TEXT PRIMARY KEY,
        fireflies_id TEXT UNIQUE,
        titulo TEXT NOT NULL,
        data TEXT NOT NULL,
        duracao_min INTEGER DEFAULT 0,
        participantes TEXT,
        resumo TEXT,
        keywords TEXT,
        action_items TEXT,
        transcricao TEXT,
        entidade_tipo TEXT,
        entidade_id TEXT,
        organizador TEXT,
        created_at TEXT DEFAULT (NOW()::TEXT),
        updated_at TEXT DEFAULT (NOW()::TEXT)
      );
      CREATE INDEX IF NOT EXISTS idx_reunioes_entidade ON reunioes(entidade_tipo, entidade_id);
      CREATE INDEX IF NOT EXISTS idx_reunioes_data ON reunioes(data DESC);

      CREATE TABLE IF NOT EXISTS sync_state (
        tabela TEXT PRIMARY KEY,
        last_sync TEXT,
        notion_db_id TEXT,
        status TEXT DEFAULT 'ok'
      );

      CREATE TABLE IF NOT EXISTS okrs (
        id TEXT PRIMARY KEY,
        trimestre TEXT NOT NULL,
        objectivo TEXT NOT NULL,
        ordem INT DEFAULT 0,
        created_at TEXT DEFAULT (NOW()::TEXT),
        updated_at TEXT DEFAULT (NOW()::TEXT)
      );

      CREATE TABLE IF NOT EXISTS okr_krs (
        id TEXT PRIMARY KEY,
        okr_id TEXT NOT NULL REFERENCES okrs(id) ON DELETE CASCADE,
        kr TEXT NOT NULL,
        meta REAL NOT NULL DEFAULT 1,
        unidade TEXT DEFAULT '',
        tipo TEXT DEFAULT 'acumulado',
        fonte TEXT,
        invertido BOOLEAN DEFAULT false,
        ordem INT DEFAULT 0,
        created_at TEXT DEFAULT (NOW()::TEXT),
        updated_at TEXT DEFAULT (NOW()::TEXT)
      );

      CREATE TABLE IF NOT EXISTS analises (
        id TEXT PRIMARY KEY,
        imovel_id TEXT NOT NULL,
        nome TEXT NOT NULL DEFAULT 'Cenário Base',
        versao INTEGER DEFAULT 1,
        activa BOOLEAN DEFAULT false,

        -- A. Aquisição
        compra REAL DEFAULT 0,
        vpt REAL DEFAULT 0,
        finalidade TEXT DEFAULT 'Empresa_isencao',
        escritura REAL DEFAULT 700,
        cpcv_compra REAL DEFAULT 0,
        due_diligence REAL DEFAULT 0,
        imt REAL DEFAULT 0,
        imposto_selo REAL DEFAULT 0,
        total_aquisicao REAL DEFAULT 0,

        -- B. Financiamento
        perc_financiamento REAL DEFAULT 0,
        prazo_anos INTEGER DEFAULT 30,
        tan REAL DEFAULT 0,
        tipo_taxa TEXT DEFAULT 'Fixa',
        comissoes_banco REAL DEFAULT 0,
        hipoteca REAL DEFAULT 0,
        valor_financiado REAL DEFAULT 0,
        prestacao_mensal REAL DEFAULT 0,
        is_financiamento REAL DEFAULT 0,
        penalizacao_amort REAL DEFAULT 0,

        -- C. Obra
        modo_obra TEXT DEFAULT 'total',
        obra REAL DEFAULT 0,
        pmo_perc REAL DEFAULT 65,
        aru BOOLEAN DEFAULT false,
        ampliacao BOOLEAN DEFAULT false,
        licenciamento REAL DEFAULT 0,
        iva_obra REAL DEFAULT 0,
        obra_com_iva REAL DEFAULT 0,

        -- D. Detenção
        meses INTEGER DEFAULT 6,
        seguro_mensal REAL DEFAULT 0,
        condominio_mensal REAL DEFAULT 0,
        utilidades_mensal REAL DEFAULT 0,
        n_tranches INTEGER DEFAULT 1,
        custo_tranche REAL DEFAULT 0,
        taxa_imi REAL DEFAULT 0.3,
        ligacao_servicos REAL DEFAULT 0,
        excedente_capital REAL DEFAULT 0,
        imi_proporcional REAL DEFAULT 0,
        total_detencao REAL DEFAULT 0,

        -- E. Venda
        vvr REAL DEFAULT 0,
        comissao_perc REAL DEFAULT 2.5,
        cpcv_venda REAL DEFAULT 0,
        cert_energetico REAL DEFAULT 0,
        home_staging REAL DEFAULT 0,
        outros_venda REAL DEFAULT 0,
        comissao_com_iva REAL DEFAULT 0,
        total_venda REAL DEFAULT 0,

        -- F. Fiscalidade
        regime_fiscal TEXT DEFAULT 'Empresa',
        derrama_perc REAL DEFAULT 1.5,
        perc_dividendos REAL DEFAULT 100,
        ano_aquisicao INTEGER,
        englobamento BOOLEAN DEFAULT false,
        taxa_irs_marginal REAL DEFAULT 0,
        impostos REAL DEFAULT 0,
        retencao_dividendos REAL DEFAULT 0,

        -- G. Resultados
        capital_necessario REAL DEFAULT 0,
        lucro_bruto REAL DEFAULT 0,
        lucro_liquido REAL DEFAULT 0,
        retorno_total REAL DEFAULT 0,
        retorno_anualizado REAL DEFAULT 0,
        cash_on_cash REAL DEFAULT 0,
        break_even REAL DEFAULT 0,

        -- H. Comparáveis + CAEP + Stress (JSON)
        comparaveis JSONB DEFAULT '[]',
        caep JSONB,
        stress_tests JSONB,

        -- Meta
        criado_por TEXT,
        created_at TEXT DEFAULT (NOW()::TEXT),
        updated_at TEXT DEFAULT (NOW()::TEXT)
      );

      -- Migration: adicionar pagamentos faseados à tabela negocios
      DO $$ BEGIN
        ALTER TABLE negocios ADD COLUMN IF NOT EXISTS pagamentos_faseados JSONB DEFAULT '[]';
      EXCEPTION WHEN OTHERS THEN NULL;
      END $$;

      -- Migration: adicionar campos GCal à tabela tarefas existente
      DO $$ BEGIN
        ALTER TABLE tarefas ADD COLUMN IF NOT EXISTS gcal_event_id TEXT;
        ALTER TABLE tarefas ADD COLUMN IF NOT EXISTS gcal_synced_at TEXT;
      EXCEPTION WHEN OTHERS THEN NULL;
      END $$;

      -- Migration: adicionar coluna drive_folder_id à tabela imoveis
      DO $$ BEGIN
        ALTER TABLE imoveis ADD COLUMN IF NOT EXISTS drive_folder_id TEXT;
      EXCEPTION WHEN OTHERS THEN NULL;
      END $$;

      -- Migration: adicionar coluna documentos à tabela despesas
      DO $$ BEGIN
        ALTER TABLE despesas ADD COLUMN IF NOT EXISTS documentos TEXT;
      EXCEPTION WHEN OTHERS THEN NULL;
      END $$;

      -- Migration: adicionar coluna analise_completa à tabela reunioes
      DO $$ BEGIN
        ALTER TABLE reunioes ADD COLUMN IF NOT EXISTS analise_completa TEXT;
      EXCEPTION WHEN OTHERS THEN NULL;
      END $$;

      -- Migration: adicionar ABD (area_bruta_dependente) à tabela imoveis
      DO $$ BEGIN
        ALTER TABLE imoveis ADD COLUMN IF NOT EXISTS area_bruta_dependente REAL;
      EXCEPTION WHEN OTHERS THEN NULL;
      END $$;

      -- Migration: módulo gestão de consultores — novas colunas
      DO $$ BEGIN
        ALTER TABLE consultores ADD COLUMN IF NOT EXISTS score_prioridade REAL DEFAULT 0;
        ALTER TABLE consultores ADD COLUMN IF NOT EXISTS taxa_qualidade REAL DEFAULT 0;
        ALTER TABLE consultores ADD COLUMN IF NOT EXISTS tempo_medio_resposta REAL;
        ALTER TABLE consultores ADD COLUMN IF NOT EXISTS estado_avaliacao TEXT DEFAULT 'Em avaliação';
      EXCEPTION WHEN OTHERS THEN NULL;
      END $$;

      -- Migration: campos para agente WhatsApp + follow-up automático
      DO $$ BEGIN
        ALTER TABLE consultores ADD COLUMN IF NOT EXISTS canal_followup TEXT DEFAULT 'whatsapp_auto';
        ALTER TABLE consultores ADD COLUMN IF NOT EXISTS controlo_manual BOOLEAN DEFAULT false;
        ALTER TABLE consultores ADD COLUMN IF NOT EXISTS reactivado BOOLEAN DEFAULT false;
      EXCEPTION WHEN OTHERS THEN NULL;
      END $$;

      DO $$ BEGIN
        ALTER TABLE imoveis ADD COLUMN IF NOT EXISTS tipo_oportunidade TEXT;
        ALTER TABLE imoveis ADD COLUMN IF NOT EXISTS check_qualidade BOOLEAN DEFAULT false;
        ALTER TABLE imoveis ADD COLUMN IF NOT EXISTS check_ouro BOOLEAN DEFAULT false;
        ALTER TABLE imoveis ADD COLUMN IF NOT EXISTS fotos TEXT DEFAULT '[]';
      EXCEPTION WHEN OTHERS THEN NULL;
      END $$;

      -- Nova tabela: log de interacções por consultor
      CREATE TABLE IF NOT EXISTS consultor_interacoes (
        id TEXT PRIMARY KEY,
        consultor_id TEXT NOT NULL,
        data_hora TEXT NOT NULL DEFAULT (NOW()::TEXT),
        canal TEXT NOT NULL,
        direcao TEXT NOT NULL,
        notas TEXT,
        created_at TEXT DEFAULT (NOW()::TEXT),
        updated_at TEXT DEFAULT (NOW()::TEXT)
      );
      DO $$ BEGIN
        ALTER TABLE consultor_interacoes ADD COLUMN IF NOT EXISTS updated_at TEXT DEFAULT (NOW()::TEXT);
      EXCEPTION WHEN OTHERS THEN NULL;
      END $$;
      DO $$ BEGIN
        ALTER TABLE consultor_interacoes ADD COLUMN IF NOT EXISTS imovel_id TEXT;
      EXCEPTION WHEN OTHERS THEN NULL;
      END $$;
      CREATE INDEX IF NOT EXISTS idx_interacoes_consultor ON consultor_interacoes(consultor_id);
      CREATE INDEX IF NOT EXISTS idx_interacoes_data ON consultor_interacoes(data_hora DESC);
      CREATE INDEX IF NOT EXISTS idx_interacoes_imovel ON consultor_interacoes(imovel_id);

      -- Migrar direcao 'Resposta' para 'Recebido' (correcao semantica)
      UPDATE consultor_interacoes SET direcao = 'Recebido'
        WHERE direcao = 'Resposta' AND notas NOT LIKE '[AGENTE]%' AND notas NOT LIKE '[FOLLOW-UP%' AND notas NOT LIKE '[REACTIVAÇÃO%';

      -- Checklist obrigatória por estado do imóvel
      CREATE TABLE IF NOT EXISTS checklist_imovel (
        id TEXT PRIMARY KEY,
        imovel_id TEXT NOT NULL,
        estado TEXT NOT NULL,
        template_key TEXT NOT NULL,
        titulo TEXT NOT NULL,
        campo_crm TEXT,
        categoria TEXT,
        tempo_estimado REAL DEFAULT 0.25,
        obrigatoria BOOLEAN DEFAULT true,
        concluida BOOLEAN DEFAULT false,
        concluida_por TEXT,
        concluida_em TEXT,
        notas TEXT,
        ordem INTEGER DEFAULT 0,
        created_at TEXT DEFAULT (NOW()::TEXT),
        updated_at TEXT DEFAULT (NOW()::TEXT)
      );
      CREATE UNIQUE INDEX IF NOT EXISTS idx_checklist_unique ON checklist_imovel(imovel_id, template_key);
      CREATE INDEX IF NOT EXISTS idx_checklist_imovel_id ON checklist_imovel(imovel_id);
      CREATE INDEX IF NOT EXISTS idx_checklist_estado ON checklist_imovel(imovel_id, estado);

      -- Documentos enviados a investidores (historico)
      CREATE TABLE IF NOT EXISTS documentos_investidor (
        id TEXT PRIMARY KEY,
        investidor_id TEXT NOT NULL,
        imovel_id TEXT,
        tipo TEXT NOT NULL,
        nome TEXT NOT NULL,
        notas TEXT,
        created_at TEXT DEFAULT (NOW()::TEXT)
      );
      CREATE INDEX IF NOT EXISTS idx_docsinv_investidor ON documentos_investidor(investidor_id);

      -- Migration: tipo_principal (Ativo/Passivo) para separação clara de investidores
      DO $$ BEGIN
        ALTER TABLE investidores ADD COLUMN IF NOT EXISTS tipo_principal TEXT DEFAULT 'Passivo';
        ALTER TABLE investidores ADD COLUMN IF NOT EXISTS duplicado_de TEXT;
      EXCEPTION WHEN OTHERS THEN NULL;
      END $$;
      CREATE INDEX IF NOT EXISTS idx_investidores_tipo ON investidores(tipo_principal);

      -- Migration: renomear status "Investidor classificado" → "Investidor em espera"
      UPDATE investidores SET status = 'Investidor em espera' WHERE status = 'Investidor classificado';

      -- Migration: campos do Google Forms que antes iam para notas
      DO $$ BEGIN
        ALTER TABLE investidores ADD COLUMN IF NOT EXISTS profissao TEXT;
        ALTER TABLE investidores ADD COLUMN IF NOT EXISTS localizacao_preferida TEXT;
        ALTER TABLE investidores ADD COLUMN IF NOT EXISTS tipo_imovel_preferido TEXT;
        ALTER TABLE investidores ADD COLUMN IF NOT EXISTS equipa_obras TEXT;
        ALTER TABLE investidores ADD COLUMN IF NOT EXISTS roi_pretendido TEXT;
        ALTER TABLE investidores ADD COLUMN IF NOT EXISTS experiencia_imobiliario TEXT;
        ALTER TABLE investidores ADD COLUMN IF NOT EXISTS preferencia_contacto TEXT;
        ALTER TABLE investidores ADD COLUMN IF NOT EXISTS horizonte_investimento TEXT;
        ALTER TABLE investidores ADD COLUMN IF NOT EXISTS origem_capital TEXT;
      EXCEPTION WHEN OTHERS THEN NULL;
      END $$;

      -- Scorecards de Discovery Call (SOP 2)
      CREATE TABLE IF NOT EXISTS scorecards (
        id TEXT PRIMARY KEY,
        investidor_id TEXT NOT NULL,
        reuniao_id TEXT,
        tipo_investidor TEXT NOT NULL DEFAULT 'Passivo',

        -- Critério 1: Capacidade Financeira (1-5)
        c1_score INTEGER DEFAULT 0,
        c1_notas TEXT,

        -- Critério 2: Experiência Imobiliária (1-5)
        c2_score INTEGER DEFAULT 0,
        c2_notas TEXT,

        -- Critério 3: Alinhamento Estratégico (1-5)
        c3_score INTEGER DEFAULT 0,
        c3_notas TEXT,

        -- Critério 4: Estabilidade e Credibilidade (1-5)
        c4_score INTEGER DEFAULT 0,
        c4_notas TEXT,

        -- Critério 5: Disponibilidade e Compromisso (1-5)
        c5_score INTEGER DEFAULT 0,
        c5_notas TEXT,

        -- Totais calculados
        pontuacao_total REAL DEFAULT 0,
        pontuacao_ponderada REAL DEFAULT 0,
        classificacao TEXT,

        avaliador TEXT,
        fonte TEXT DEFAULT 'manual',
        created_at TEXT DEFAULT (NOW()::TEXT),
        updated_at TEXT DEFAULT (NOW()::TEXT)
      );
      CREATE INDEX IF NOT EXISTS idx_scorecards_investidor ON scorecards(investidor_id);
      CREATE INDEX IF NOT EXISTS idx_scorecards_data ON scorecards(created_at DESC);

      -- Histórico de classificação (reclassificação periódica)
      CREATE TABLE IF NOT EXISTS classificacao_historico (
        id TEXT PRIMARY KEY,
        investidor_id TEXT NOT NULL,
        classificacao_anterior TEXT,
        classificacao_nova TEXT NOT NULL,
        pontuacao_anterior REAL DEFAULT 0,
        pontuacao_nova REAL DEFAULT 0,
        motivo TEXT NOT NULL,
        tipo TEXT DEFAULT 'manual',
        scorecard_id TEXT,
        created_at TEXT DEFAULT (NOW()::TEXT)
      );
      CREATE INDEX IF NOT EXISTS idx_class_hist_investidor ON classificacao_historico(investidor_id);
      CREATE INDEX IF NOT EXISTS idx_class_hist_data ON classificacao_historico(created_at DESC);

      CREATE INDEX IF NOT EXISTS idx_imoveis_estado ON imoveis(estado);
      CREATE INDEX IF NOT EXISTS idx_investidores_status ON investidores(status);
      CREATE INDEX IF NOT EXISTS idx_consultores_estatuto ON consultores(estatuto);
      CREATE INDEX IF NOT EXISTS idx_negocios_fase ON negocios(fase);
      CREATE INDEX IF NOT EXISTS idx_audit_tabela ON audit_log(tabela, registo_id);
      CREATE INDEX IF NOT EXISTS idx_analises_imovel ON analises(imovel_id);
      CREATE INDEX IF NOT EXISTS idx_analises_activa ON analises(imovel_id, activa);
    `)
    console.log('[pg] Schema criado/verificado')
  } finally {
    client.release()
  }
}

// ── Query helpers (compatible API with SQLite) ───────────────
export const query = (text, params) => pool.query(text, params)

export default pool
