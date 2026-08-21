/**
 * PostgreSQL connection pool (Supabase).
 * Drop-in replacement for schema.js SQLite.
 */
import pg from 'pg'
import { installAuditedQuery } from './audit.js'

const DATABASE_URL = process.env.DATABASE_URL
if (!DATABASE_URL) {
  console.error('[pg] ERRO: DATABASE_URL não está definido. Adiciona ao ficheiro .env')
  process.exit(1)
}

const pool = new pg.Pool({
  connectionString: DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  // 30 conexões para evitar congestão no boot (pre-warm + dashboard pode
  // disparar ~30-50 queries em paralelo via Promise.all).
  max: 30,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 8000,
})

pool.on('error', (err) => {
  console.error('[pg] Pool error:', err.message)
})

installAuditedQuery(pool)

setInterval(() => {
  if (pool.waitingCount > 0) {
    console.warn(`[pg] waiting=${pool.waitingCount} total=${pool.totalCount} idle=${pool.idleCount}`)
  }
}, 5000).unref?.()

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
        valor_cedencia_posicao REAL,
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

      -- Migration: PMO breakdown + Exit Alternativo (arrendamento) na tabela analises
      DO $$ BEGIN
        ALTER TABLE analises ADD COLUMN IF NOT EXISTS pmo_arq_perc REAL DEFAULT 0;
        ALTER TABLE analises ADD COLUMN IF NOT EXISTS pmo_fisc_perc REAL DEFAULT 0;
        ALTER TABLE analises ADD COLUMN IF NOT EXISTS pmo_seg_obra_perc REAL DEFAULT 0;
        ALTER TABLE analises ADD COLUMN IF NOT EXISTS pmo_outros_perc REAL DEFAULT 0;
        ALTER TABLE analises ADD COLUMN IF NOT EXISTS renda_mensal REAL DEFAULT 0;
        ALTER TABLE analises ADD COLUMN IF NOT EXISTS vacancy_pct REAL DEFAULT 5;
        ALTER TABLE analises ADD COLUMN IF NOT EXISTS gestao_arr_pct REAL DEFAULT 8;
      EXCEPTION WHEN OTHERS THEN NULL;
      END $$;

      -- Migration: categoria_irs (Cat. G | B-simplificado | B-organizada).
      -- Aplica-se quando regime_fiscal='Particular'. Default 'G' (mais-valia).
      DO $$ BEGIN
        ALTER TABLE analises ADD COLUMN IF NOT EXISTS categoria_irs TEXT DEFAULT 'G';
        UPDATE analises SET categoria_irs = 'G' WHERE regime_fiscal = 'Particular' AND categoria_irs IS NULL;
      EXCEPTION WHEN OTHERS THEN NULL;
      END $$;

      -- Migration: adicionar campos GCal à tabela tarefas existente
      DO $$ BEGIN
        ALTER TABLE tarefas ADD COLUMN IF NOT EXISTS gcal_event_id TEXT;
        ALTER TABLE tarefas ADD COLUMN IF NOT EXISTS gcal_synced_at TEXT;
      EXCEPTION WHEN OTHERS THEN NULL;
      END $$;

      -- Migration: regiao opcional em tarefas. Só preenchida quando a categoria
      -- é geográfica (Cold Call, Visita, etc.); restantes ficam NULL.
      DO $$ BEGIN
        ALTER TABLE tarefas ADD COLUMN IF NOT EXISTS regiao TEXT;
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

      -- Migration: marcar relatórios de reunião como vistos (alerta in-app)
      DO $$ BEGIN
        ALTER TABLE reunioes ADD COLUMN IF NOT EXISTS analise_vista BOOLEAN DEFAULT false;
      EXCEPTION WHEN OTHERS THEN NULL;
      END $$;

      -- Migration: adicionar ABD (area_bruta_dependente) à tabela imoveis
      DO $$ BEGIN
        ALTER TABLE imoveis ADD COLUMN IF NOT EXISTS area_bruta_dependente REAL;
      EXCEPTION WHEN OTHERS THEN NULL;
      END $$;

      -- Migration: módulo de documentação com IA — análises por documento
      DO $$ BEGIN
        ALTER TABLE imoveis ADD COLUMN IF NOT EXISTS documentacao_analise JSONB DEFAULT '[]';
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
        ALTER TABLE imoveis ADD COLUMN IF NOT EXISTS tipo_operacao TEXT;
        ALTER TABLE imoveis ADD COLUMN IF NOT EXISTS check_qualidade BOOLEAN DEFAULT false;
        -- check_ouro removida (migração 0030_drop_check_ouro.sql) — sem
        -- critérios definidos em código, sem uso a jusante.
        ALTER TABLE imoveis ADD COLUMN IF NOT EXISTS fotos TEXT DEFAULT '[]';
        ALTER TABLE imoveis ADD COLUMN IF NOT EXISTS fee_cedencia REAL;
        ALTER TABLE analises ADD COLUMN IF NOT EXISTS fee_cedencia REAL;
      EXCEPTION WHEN OTHERS THEN NULL;
      END $$;

      -- Migration: motivos para transições de estado em imóveis
      DO $$ BEGIN
        ALTER TABLE imoveis ADD COLUMN IF NOT EXISTS motivo_follow_up TEXT;
        ALTER TABLE imoveis ADD COLUMN IF NOT EXISTS motivo_nao_interessa TEXT;
      EXCEPTION WHEN OTHERS THEN NULL;
      END $$;

      -- Migration: pontos fortes/fracos/riscos + imagem de localização (relatórios investidor)
      DO $$ BEGIN
        ALTER TABLE imoveis ADD COLUMN IF NOT EXISTS pontos_fortes TEXT;
        ALTER TABLE imoveis ADD COLUMN IF NOT EXISTS pontos_fracos TEXT;
        ALTER TABLE imoveis ADD COLUMN IF NOT EXISTS riscos TEXT;
        ALTER TABLE imoveis ADD COLUMN IF NOT EXISTS mitigacao_riscos TEXT;
        ALTER TABLE imoveis ADD COLUMN IF NOT EXISTS localizacao_imagem TEXT;
      EXCEPTION WHEN OTHERS THEN NULL;
      END $$;

      -- Migration: estudo de localização — distâncias a pontos de interesse via Google Distance Matrix
      DO $$ BEGIN
        ALTER TABLE imoveis ADD COLUMN IF NOT EXISTS morada TEXT;
        ALTER TABLE imoveis ADD COLUMN IF NOT EXISTS pois_distancias JSONB DEFAULT '[]'::jsonb;
        ALTER TABLE imoveis ADD COLUMN IF NOT EXISTS pois_atualizado_em TIMESTAMPTZ;
      EXCEPTION WHEN OTHERS THEN NULL;
      END $$;

      -- Migration: ressincronizar ROI dos imóveis com a análise activa.
      -- Antes coexistiam duas fórmulas (autoCalcROI naive vs calcEngine),
      -- pelo que o valor podia divergir do que a calculadora mostra. A
      -- partir daqui o ROI dos imóveis é sempre o calculado pela análise
      -- activa; idempotente — corre em cada arranque sem efeitos colaterais.
      DO $$ BEGIN
        UPDATE imoveis i SET
          roi = a.retorno_total,
          roi_anualizado = a.retorno_anualizado
        FROM analises a
        WHERE a.imovel_id = i.id AND a.activa = true
          AND (i.roi IS DISTINCT FROM a.retorno_total OR i.roi_anualizado IS DISTINCT FROM a.retorno_anualizado);
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

      -- Log de interacções por investidor (espelho de consultor_interacoes).
      -- finalidade: 'discovery' (1ª chamada a novo investidor/lead) | 'follow_up'.
      CREATE TABLE IF NOT EXISTS investidor_interacoes (
        id TEXT PRIMARY KEY,
        investidor_id TEXT NOT NULL,
        data_hora TEXT NOT NULL DEFAULT (NOW()::TEXT),
        canal TEXT NOT NULL,
        direcao TEXT NOT NULL,
        finalidade TEXT NOT NULL DEFAULT 'follow_up',
        notas TEXT,
        created_at TEXT DEFAULT (NOW()::TEXT),
        updated_at TEXT DEFAULT (NOW()::TEXT)
      );
      CREATE INDEX IF NOT EXISTS idx_inv_interacoes_investidor ON investidor_interacoes(investidor_id);
      CREATE INDEX IF NOT EXISTS idx_inv_interacoes_data ON investidor_interacoes(data_hora DESC);
      CREATE INDEX IF NOT EXISTS idx_inv_interacoes_finalidade ON investidor_interacoes(finalidade);

      -- Histórico de follow-ups por consultor (multi-entrada)
      CREATE TABLE IF NOT EXISTS consultor_followups (
        id TEXT PRIMARY KEY,
        consultor_id TEXT NOT NULL,
        imovel_id TEXT,
        data TEXT NOT NULL,
        motivo TEXT,
        proximo_follow_up TEXT,
        created_at TEXT DEFAULT (NOW()::TEXT),
        updated_at TEXT DEFAULT (NOW()::TEXT)
      );
      ALTER TABLE consultor_followups ADD COLUMN IF NOT EXISTS imovel_id TEXT;
      CREATE INDEX IF NOT EXISTS idx_followups_consultor ON consultor_followups(consultor_id);
      CREATE INDEX IF NOT EXISTS idx_followups_data ON consultor_followups(data DESC);
      CREATE INDEX IF NOT EXISTS idx_followups_imovel ON consultor_followups(imovel_id);

      -- Gravacoes de chamadas com consultores (audio no Storage; transcricao
      -- por Whisper local + analise comercial por Claude para optimizar scripts).
      CREATE TABLE IF NOT EXISTS consultor_gravacoes (
        id TEXT PRIMARY KEY,
        consultor_id TEXT NOT NULL,
        followup_id TEXT,
        titulo TEXT,
        data_chamada TEXT,
        ficheiro_path TEXT,
        ficheiro_nome TEXT,
        duracao_seg INTEGER,
        estado TEXT NOT NULL DEFAULT 'pendente',
        erro TEXT,
        transcricao TEXT,
        analise JSONB,
        created_at TEXT DEFAULT (NOW()::TEXT),
        updated_at TEXT DEFAULT (NOW()::TEXT)
      );
      ALTER TABLE consultor_gravacoes ADD COLUMN IF NOT EXISTS followup_id TEXT;
      ALTER TABLE consultor_gravacoes ADD COLUMN IF NOT EXISTS imovel_id TEXT;
      CREATE INDEX IF NOT EXISTS idx_gravacoes_consultor ON consultor_gravacoes(consultor_id);
      CREATE INDEX IF NOT EXISTS idx_gravacoes_estado ON consultor_gravacoes(estado);
      CREATE INDEX IF NOT EXISTS idx_gravacoes_followup ON consultor_gravacoes(followup_id);
      CREATE INDEX IF NOT EXISTS idx_gravacoes_imovel ON consultor_gravacoes(imovel_id);

      -- SOP 2 (Cold/Discovery/Close Call + Pivot para Parceria): tipo de chamada
      -- e campos manuais estruturados por tipo. Campo manual e sempre a fonte de
      -- verdade — a IA so sugere dentro de analise (JSONB). Ver migration 0027.
      ALTER TABLE consultor_gravacoes ADD COLUMN IF NOT EXISTS tipo_chamada TEXT;
      ALTER TABLE consultor_gravacoes ADD COLUMN IF NOT EXISTS registo_fonte TEXT DEFAULT 'manual';
      ALTER TABLE consultor_gravacoes ADD COLUMN IF NOT EXISTS registo_confirmado_em TEXT;
      ALTER TABLE consultor_gravacoes ADD COLUMN IF NOT EXISTS registo_confirmado_por TEXT;
      ALTER TABLE consultor_gravacoes ADD COLUMN IF NOT EXISTS cc_resultado TEXT;
      ALTER TABLE consultor_gravacoes ADD COLUMN IF NOT EXISTS cc_aceita_negociar TEXT;
      ALTER TABLE consultor_gravacoes ADD COLUMN IF NOT EXISTS dc_score_objetivo SMALLINT;
      ALTER TABLE consultor_gravacoes ADD COLUMN IF NOT EXISTS dc_score_motivo_real SMALLINT;
      ALTER TABLE consultor_gravacoes ADD COLUMN IF NOT EXISTS dc_score_dor_desafio SMALLINT;
      ALTER TABLE consultor_gravacoes ADD COLUMN IF NOT EXISTS dc_score_impacto SMALLINT;
      ALTER TABLE consultor_gravacoes ADD COLUMN IF NOT EXISTS dc_score_urgencia SMALLINT;
      ALTER TABLE consultor_gravacoes ADD COLUMN IF NOT EXISTS dc_score_tentativas_anteriores SMALLINT;
      ALTER TABLE consultor_gravacoes ADD COLUMN IF NOT EXISTS dc_pontuacao_total SMALLINT;
      ALTER TABLE consultor_gravacoes ADD COLUMN IF NOT EXISTS dc_onus_verificado BOOLEAN;
      ALTER TABLE consultor_gravacoes ADD COLUMN IF NOT EXISTS dc_direito_preferencia_esclarecido BOOLEAN;
      ALTER TABLE consultor_gravacoes ADD COLUMN IF NOT EXISTS dc_notas_objetivo TEXT;
      ALTER TABLE consultor_gravacoes ADD COLUMN IF NOT EXISTS dc_notas_motivo_real TEXT;
      ALTER TABLE consultor_gravacoes ADD COLUMN IF NOT EXISTS dc_notas_dor_desafio TEXT;
      ALTER TABLE consultor_gravacoes ADD COLUMN IF NOT EXISTS dc_notas_impacto TEXT;
      ALTER TABLE consultor_gravacoes ADD COLUMN IF NOT EXISTS dc_notas_urgencia TEXT;
      ALTER TABLE consultor_gravacoes ADD COLUMN IF NOT EXISTS dc_notas_tentativas_anteriores TEXT;
      ALTER TABLE consultor_gravacoes ADD COLUMN IF NOT EXISTS cl_resultado TEXT;
      ALTER TABLE consultor_gravacoes ADD COLUMN IF NOT EXISTS cl_valor_ancora NUMERIC;
      ALTER TABLE consultor_gravacoes ADD COLUMN IF NOT EXISTS cl_valor_contraproposta NUMERIC;
      ALTER TABLE consultor_gravacoes ADD COLUMN IF NOT EXISTS cl_deadline TEXT;
      ALTER TABLE consultor_gravacoes ADD COLUMN IF NOT EXISTS cl_formalizado_escrito_mesmo_dia BOOLEAN;
      ALTER TABLE consultor_gravacoes ADD COLUMN IF NOT EXISTS pp_compromisso_confirmado BOOLEAN;
      ALTER TABLE consultor_gravacoes ADD COLUMN IF NOT EXISTS pp_criterios_pesquisa_enviados BOOLEAN;
      ALTER TABLE consultor_gravacoes ADD COLUMN IF NOT EXISTS pp_negocios_fechados INTEGER;
      CREATE INDEX IF NOT EXISTS idx_gravacoes_tipo_chamada ON consultor_gravacoes(tipo_chamada);
      CREATE INDEX IF NOT EXISTS idx_gravacoes_data_chamada ON consultor_gravacoes(data_chamada);

      -- Migrar follow-ups legados (campos directos no consultor) para o histórico
      INSERT INTO consultor_followups (id, consultor_id, data, motivo, proximo_follow_up, created_at, updated_at)
      SELECT gen_random_uuid()::text, c.id, c.data_follow_up, c.motivo_follow_up, c.data_proximo_follow_up,
             NOW()::TEXT, NOW()::TEXT
      FROM consultores c
      WHERE c.data_follow_up IS NOT NULL AND c.data_follow_up <> ''
        AND NOT EXISTS (SELECT 1 FROM consultor_followups f WHERE f.consultor_id = c.id);

      -- Migrar direcao 'Resposta' para 'Recebido' (correcao semantica)
      UPDATE consultor_interacoes SET direcao = 'Recebido'
        WHERE direcao = 'Resposta' AND notas NOT LIKE '[AGENTE]%' AND notas NOT LIKE '[FOLLOW-UP%' AND notas NOT LIKE '[REACTIVAÇÃO%';

      -- Tracking de "ultima vez que o utilizador viu" as mensagens WhatsApp de cada consultor
      CREATE TABLE IF NOT EXISTS whatsapp_last_seen (
        consultor_id TEXT PRIMARY KEY,
        last_seen_at TEXT NOT NULL DEFAULT (NOW()::TEXT)
      );

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
        -- user_id: liga investidor a row em users (auth via Supabase) - para portal investidor
        ALTER TABLE investidores ADD COLUMN IF NOT EXISTS user_id TEXT;
      EXCEPTION WHEN OTHERS THEN NULL;
      END $$;
      CREATE INDEX IF NOT EXISTS idx_investidores_user ON investidores(user_id);
      CREATE INDEX IF NOT EXISTS idx_investidores_tipo ON investidores(tipo_principal);

      -- Migration: consolidar estados legacy ("Investidor classificado", "Investidor em espera",
      -- "Acesso a Off-Market", "Investidor Activo") nos estados actuais.
      UPDATE investidores SET status = 'Investidor Qualificado em Carteira'
        WHERE status IN ('Investidor classificado', 'Investidor em espera', 'Acesso a Off-Market');
      UPDATE investidores SET status = 'Investidor Ativo' WHERE status = 'Investidor Activo';

      -- Migration: campos do Google Forms que antes iam para notas
      DO $$ BEGIN
        ALTER TABLE investidores ADD COLUMN IF NOT EXISTS profissao TEXT;
        ALTER TABLE investidores ADD COLUMN IF NOT EXISTS localizacao_preferida TEXT;
        ALTER TABLE investidores ADD COLUMN IF NOT EXISTS tipo_imovel_preferido TEXT;
        ALTER TABLE investidores ADD COLUMN IF NOT EXISTS equipa_obras TEXT;
        ALTER TABLE investidores ADD COLUMN IF NOT EXISTS roi_pretendido TEXT;
        ALTER TABLE investidores ADD COLUMN IF NOT EXISTS roi_anualizado_pretendido TEXT;
        ALTER TABLE investidores ADD COLUMN IF NOT EXISTS experiencia_imobiliario TEXT;
        ALTER TABLE investidores ADD COLUMN IF NOT EXISTS preferencia_contacto TEXT;
        ALTER TABLE investidores ADD COLUMN IF NOT EXISTS horizonte_investimento TEXT;
        ALTER TABLE investidores ADD COLUMN IF NOT EXISTS origem_capital TEXT;
        -- Churn: investidor em parceria que declarou que NÃO vai reinvestir.
        ALTER TABLE investidores ADD COLUMN IF NOT EXISTS nao_reinveste INTEGER DEFAULT 0;
        ALTER TABLE investidores ADD COLUMN IF NOT EXISTS data_nao_reinveste TEXT;
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

      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        email TEXT UNIQUE NOT NULL,
        nome TEXT NOT NULL,
        iniciais TEXT,
        cor TEXT DEFAULT '#C9A84C',
        role TEXT NOT NULL DEFAULT 'comercial',
        ativo BOOLEAN DEFAULT true,
        created_at TEXT DEFAULT (NOW()::TEXT),
        updated_at TEXT DEFAULT (NOW()::TEXT)
      );
      CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
      CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);

      -- Acessos granulares por registo (parceiros externos a imóveis/negócios específicos)
      CREATE TABLE IF NOT EXISTS acessos (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        entidade TEXT NOT NULL,           -- 'imovel' | 'negocio'
        entidade_id TEXT NOT NULL,
        granted_by TEXT,
        created_at TEXT DEFAULT (NOW()::TEXT),
        UNIQUE(user_id, entidade, entidade_id)
      );
      CREATE INDEX IF NOT EXISTS idx_acessos_user ON acessos(user_id);
      CREATE INDEX IF NOT EXISTS idx_acessos_entidade ON acessos(entidade, entidade_id);

      -- Orçamento de obra (1-para-1 com imoveis)
      CREATE TABLE IF NOT EXISTS orcamentos_obra (
        id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        imovel_id     text NOT NULL UNIQUE REFERENCES imoveis(id) ON DELETE CASCADE,
        pisos         jsonb DEFAULT '[]'::jsonb,
        seccoes       jsonb DEFAULT '{}'::jsonb,
        notas         text,
        iva_perc      real DEFAULT 23,
        regime_fiscal text DEFAULT 'normal',
        bdi           jsonb DEFAULT '{}'::jsonb,
        total_obra            real DEFAULT 0,
        total_licenciamento   real DEFAULT 0,
        total_geral           real DEFAULT 0,
        total_iva               real DEFAULT 0,
        total_iva_autoliquidado real DEFAULT 0,
        total_retencoes_irs     real DEFAULT 0,
        total_a_pagar           real DEFAULT 0,
        criado_por    text,
        created_at    timestamptz DEFAULT NOW(),
        updated_at    timestamptz DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_orcamentos_obra_imovel ON orcamentos_obra(imovel_id);
      DO $$ BEGIN
        ALTER TABLE orcamentos_obra ADD COLUMN IF NOT EXISTS regime_fiscal text DEFAULT 'normal';
        ALTER TABLE orcamentos_obra ADD COLUMN IF NOT EXISTS bdi jsonb DEFAULT '{}'::jsonb;
        ALTER TABLE orcamentos_obra ADD COLUMN IF NOT EXISTS total_iva real DEFAULT 0;
        ALTER TABLE orcamentos_obra ADD COLUMN IF NOT EXISTS total_iva_autoliquidado real DEFAULT 0;
        ALTER TABLE orcamentos_obra ADD COLUMN IF NOT EXISTS total_retencoes_irs real DEFAULT 0;
        ALTER TABLE orcamentos_obra ADD COLUMN IF NOT EXISTS total_a_pagar real DEFAULT 0;
        ALTER TABLE orcamentos_obra ADD COLUMN IF NOT EXISTS zona_aru boolean DEFAULT false;
        ALTER TABLE orcamentos_obra ADD COLUMN IF NOT EXISTS tipo_obra text DEFAULT 'remodelacao';
      EXCEPTION WHEN OTHERS THEN NULL;
      END $$;

      -- Relatorios semanais administracao (gerados a partir de reunioes "Reuniao Semanal")
      CREATE TABLE IF NOT EXISTS relatorios_semanais (
        id TEXT PRIMARY KEY,
        semana_iso TEXT NOT NULL,           -- ex: '2026-W18'
        data_inicio TEXT NOT NULL,          -- ISO date (segunda-feira)
        data_fim TEXT NOT NULL,             -- ISO date (domingo)
        titulo TEXT NOT NULL,
        subtitulo TEXT,
        reuniao_ids TEXT,                   -- JSON array de IDs reunioes incluidas
        conteudo_json TEXT,                 -- JSON estruturado do relatorio
        notas TEXT,
        pdf_original_path TEXT,             -- caminho para PDF importado (se nao gerado pelo template)
        created_at TEXT DEFAULT (NOW()::TEXT),
        updated_at TEXT DEFAULT (NOW()::TEXT)
      );
      CREATE INDEX IF NOT EXISTS idx_relatorios_semanais_semana ON relatorios_semanais(semana_iso);
      CREATE INDEX IF NOT EXISTS idx_relatorios_semanais_data ON relatorios_semanais(data_inicio DESC);

      -- Migration: adicionar pdf_original_path se ja existir tabela
      DO $$ BEGIN
        ALTER TABLE relatorios_semanais ADD COLUMN IF NOT EXISTS pdf_original_path TEXT;
      EXCEPTION WHEN OTHERS THEN NULL;
      END $$;

      -- Reunioes com documentos (PDF/PPTX) carregados manualmente pela equipa.
      -- Ficheiros vivem no bucket privado "Relatorios" do Storage em <pasta>/<ficheiro>.
      CREATE TABLE IF NOT EXISTS reunioes_documentos (
        id TEXT PRIMARY KEY,
        titulo TEXT NOT NULL,
        data TEXT,                          -- ISO date da reuniao
        semana_iso TEXT,                    -- derivada da data (etiqueta/agrupamento)
        notas TEXT,
        pasta TEXT NOT NULL,                -- prefixo no Storage (ex: 'reunioes/<id>' ou '2026-W23' legado)
        created_at TEXT DEFAULT (NOW()::TEXT),
        updated_at TEXT DEFAULT (NOW()::TEXT)
      );
      CREATE INDEX IF NOT EXISTS idx_reunioes_documentos_data ON reunioes_documentos(data DESC);

      -- ════════════════════════════════════════════════════════════════
      -- VISITAS (entidade propria) — substitui o campo unico imoveis.data_visita
      -- Permite multiplas visitas por imovel, com estado (agendada/realizada/
      -- cancelada), investidor opcional e historico completo. O campo
      -- imoveis.data_visita continua a existir mas passa a ser derivado:
      -- = MAX(data_hora) WHERE estado='realizada' AND data_hora <= NOW()
      -- mantido em sync pela API ao mutar visitas.
      -- ════════════════════════════════════════════════════════════════
      CREATE TABLE IF NOT EXISTS visitas (
        id TEXT PRIMARY KEY,
        imovel_id TEXT NOT NULL REFERENCES imoveis(id) ON DELETE CASCADE,
        data_hora TIMESTAMPTZ NOT NULL,
        estado TEXT NOT NULL DEFAULT 'agendada',
        investidor_id TEXT REFERENCES investidores(id) ON DELETE SET NULL,
        consultor_id TEXT REFERENCES consultores(id) ON DELETE SET NULL,
        resultado TEXT,
        notas TEXT,
        ficha JSONB,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_visitas_imovel ON visitas(imovel_id);
      CREATE INDEX IF NOT EXISTS idx_visitas_data ON visitas(data_hora DESC);
      CREATE INDEX IF NOT EXISTS idx_visitas_estado ON visitas(estado);
      -- Ficha de visita preenchivel (checklists B/R/M, medicoes, obra, relatorio).
      -- Idempotente para BDs ja existentes que nao tinham a coluna.
      ALTER TABLE visitas ADD COLUMN IF NOT EXISTS ficha JSONB;

      -- Backfill idempotente: para cada imovel com data_visita preenchida e
      -- SEM visitas registadas, criar uma. Datas no passado -> realizada;
      -- datas no futuro -> agendada. So corre uma vez por imovel.
      DO $$ BEGIN
        INSERT INTO visitas (id, imovel_id, data_hora, estado, notas, created_at, updated_at)
        SELECT gen_random_uuid()::text, i.id, i.data_visita::TIMESTAMPTZ,
               CASE WHEN i.data_visita::TIMESTAMPTZ <= NOW() THEN 'realizada' ELSE 'agendada' END,
               'Importado automaticamente de imoveis.data_visita',
               NOW(), NOW()
        FROM imoveis i
        WHERE i.data_visita IS NOT NULL AND TRIM(i.data_visita) <> ''
          AND NOT EXISTS (SELECT 1 FROM visitas v WHERE v.imovel_id = i.id);
      EXCEPTION WHEN OTHERS THEN
        RAISE NOTICE 'Backfill visitas falhou: %', SQLERRM;
      END $$;
      -- ════════════════════════════════════════════════════════════════
      -- PROJETO FIX AND FLIP: fases de obra, tarefas, fotos
      -- ════════════════════════════════════════════════════════════════
      CREATE TABLE IF NOT EXISTS projeto_fases (
        id TEXT PRIMARY KEY,
        negocio_id TEXT NOT NULL REFERENCES negocios(id) ON DELETE CASCADE,
        fase_key TEXT NOT NULL,
        nome TEXT NOT NULL,
        ordem INTEGER NOT NULL,
        estado TEXT DEFAULT 'pendente',
        perc_execucao INTEGER DEFAULT 0,
        data_inicio_prevista TEXT,
        data_fim_prevista TEXT,
        data_inicio_real TEXT,
        data_fim_real TEXT,
        orcamento_alocado REAL DEFAULT 0,
        custo_real REAL DEFAULT 0,
        responsavel TEXT,
        notas TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_projeto_fases_negocio ON projeto_fases(negocio_id);
      CREATE INDEX IF NOT EXISTS idx_projeto_fases_estado ON projeto_fases(estado);
      CREATE UNIQUE INDEX IF NOT EXISTS idx_projeto_fases_unique ON projeto_fases(negocio_id, fase_key);

      CREATE TABLE IF NOT EXISTS projeto_tarefas (
        id TEXT PRIMARY KEY,
        fase_id TEXT NOT NULL REFERENCES projeto_fases(id) ON DELETE CASCADE,
        descricao TEXT NOT NULL,
        ordem INTEGER DEFAULT 0,
        concluida INTEGER DEFAULT 0,
        responsavel TEXT,
        deadline TEXT,
        notas TEXT,
        concluida_em TIMESTAMPTZ,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_projeto_tarefas_fase ON projeto_tarefas(fase_id);

      CREATE TABLE IF NOT EXISTS projeto_fotos (
        id TEXT PRIMARY KEY,
        fase_id TEXT NOT NULL REFERENCES projeto_fases(id) ON DELETE CASCADE,
        negocio_id TEXT NOT NULL,
        url TEXT NOT NULL,
        legenda TEXT,
        tipo TEXT DEFAULT 'durante',
        ordem INTEGER DEFAULT 0,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_projeto_fotos_fase ON projeto_fotos(fase_id);
      CREATE INDEX IF NOT EXISTS idx_projeto_fotos_negocio ON projeto_fotos(negocio_id);

      -- P3.15: sync com Google Calendar (event IDs em fases e tarefas)
      ALTER TABLE projeto_fases ADD COLUMN IF NOT EXISTS gcal_event_id TEXT;
      ALTER TABLE projeto_tarefas ADD COLUMN IF NOT EXISTS gcal_event_id TEXT;

      -- Tipo do projecto: 'fracao_unica' (default) ou 'predio' (com várias frações + áreas comuns)
      ALTER TABLE negocios ADD COLUMN IF NOT EXISTS tipo_projeto TEXT DEFAULT 'fracao_unica';

      -- P4: comprovativos em despesas (factura/recibo) + categoria mais rica
      ALTER TABLE despesas ADD COLUMN IF NOT EXISTS comprovativo_url TEXT;
      ALTER TABLE despesas ADD COLUMN IF NOT EXISTS comprovativo_nome TEXT;
      ALTER TABLE despesas ADD COLUMN IF NOT EXISTS fornecedor TEXT;

      -- P4.1: Audit log do projecto (histórico de alterações em fases, tarefas, despesas, etc.)
      CREATE TABLE IF NOT EXISTS projeto_audit (
        id TEXT PRIMARY KEY,
        negocio_id TEXT NOT NULL,
        entidade TEXT NOT NULL,           -- fase | tarefa | foto | documento | despesa | investidor | fracao | negocio
        entidade_id TEXT,
        acao TEXT NOT NULL,                -- create | update | delete | status_change
        campo TEXT,                        -- nome do campo alterado (para updates)
        valor_antes TEXT,
        valor_depois TEXT,
        descricao TEXT,                    -- texto livre human-readable
        user_id TEXT,
        user_nome TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_projeto_audit_negocio ON projeto_audit(negocio_id, created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_projeto_audit_entidade ON projeto_audit(entidade, entidade_id);

      -- P4.3: Comentários por fase (thread interno da equipa)
      CREATE TABLE IF NOT EXISTS projeto_comentarios (
        id TEXT PRIMARY KEY,
        fase_id TEXT REFERENCES projeto_fases(id) ON DELETE CASCADE,
        negocio_id TEXT NOT NULL,
        autor_id TEXT,
        autor_nome TEXT,
        texto TEXT NOT NULL,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_projeto_comentarios_fase ON projeto_comentarios(fase_id, created_at DESC);

      -- P4.4: Preferência de canal de notificação por investidor
      ALTER TABLE investidores ADD COLUMN IF NOT EXISTS canal_notificacao TEXT DEFAULT 'email';
      -- valores: 'email' | 'whatsapp' | 'ambos' | 'nenhum'

      -- F15: assinaturas digitais in-house (hash do PDF + aceitação online)
      CREATE TABLE IF NOT EXISTS projeto_assinaturas (
        id TEXT PRIMARY KEY,
        negocio_id TEXT NOT NULL,
        documento_tipo TEXT NOT NULL,         -- 'saida_caep' | 'relatorio' | outro
        documento_hash TEXT NOT NULL,         -- SHA-256 do PDF
        token TEXT NOT NULL UNIQUE,
        investidor_id TEXT,
        investidor_nome TEXT,
        investidor_email TEXT,
        aceite_em TIMESTAMPTZ,
        aceite_ip TEXT,
        aceite_user_agent TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_assinaturas_negocio ON projeto_assinaturas(negocio_id);

      -- F18: analytics do investidor (acessos ao portal)
      CREATE TABLE IF NOT EXISTS investidor_acessos (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        negocio_id TEXT,
        pagina TEXT,
        tab TEXT,
        ip TEXT,
        user_agent TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_inv_acessos_user ON investidor_acessos(user_id, created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_inv_acessos_negocio ON investidor_acessos(negocio_id, created_at DESC);

      -- F19: notificações in-app (bell icon)
      CREATE TABLE IF NOT EXISTS notificacoes (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        tipo TEXT NOT NULL,           -- fase_mudou | tarefa_concluida | venda_concluida | comentario | outro
        titulo TEXT NOT NULL,
        mensagem TEXT,
        link TEXT,
        lida BOOLEAN DEFAULT false,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_notificacoes_user ON notificacoes(user_id, lida, created_at DESC);

      -- F16: templates customizáveis de fases (alternativa às 8 fases Fix and Flip)
      CREATE TABLE IF NOT EXISTS projeto_templates (
        id TEXT PRIMARY KEY,
        nome TEXT NOT NULL UNIQUE,
        descricao TEXT,
        fases_json TEXT NOT NULL,     -- JSON array de { key, nome, icon, tarefas: [] }
        publico BOOLEAN DEFAULT true,
        created_by TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );

      -- UX12: soft delete em negócios (projeto_fracoes.deleted_at é adicionado abaixo, depois da tabela existir)
      ALTER TABLE negocios ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
      CREATE INDEX IF NOT EXISTS idx_negocios_deleted ON negocios(deleted_at);

      -- Frações dentro de um projecto (prédios com várias frações)
      CREATE TABLE IF NOT EXISTS projeto_fracoes (
        id TEXT PRIMARY KEY,
        negocio_id TEXT NOT NULL REFERENCES negocios(id) ON DELETE CASCADE,
        nome TEXT NOT NULL,                  -- "Fração A", "Fachada", "Telhado"...
        tipo TEXT DEFAULT 'fracao',          -- 'fracao' | 'area_comum'
        categoria_comum TEXT,                 -- só para tipo='area_comum': fachada, telhado, jardim, escadas, elevador, instalacoes, garagem, outro
        tipologia TEXT,                       -- T0, T1, T2, T3, T0+1... (só frações)
        andar TEXT,                           -- R/C, 1º Andar, 2º Andar, Sótão, Cave
        area_m2 REAL,
        estado TEXT DEFAULT 'em_obra',        -- em_obra | pronto | em_venda | vendido
        valor_venda_estimado REAL DEFAULT 0,
        valor_venda_real REAL DEFAULT 0,
        data_venda_estimada TEXT,
        data_venda_real TEXT,
        comprador TEXT,
        notas TEXT,
        ordem INTEGER DEFAULT 0,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_projeto_fracoes_negocio ON projeto_fracoes(negocio_id);
      CREATE INDEX IF NOT EXISTS idx_projeto_fracoes_tipo ON projeto_fracoes(tipo);
      CREATE UNIQUE INDEX IF NOT EXISTS idx_projeto_fracoes_nome ON projeto_fracoes(negocio_id, nome);
      -- Migration: adicionar colunas tipo/categoria_comum/deleted_at a tabelas pré-existentes
      ALTER TABLE projeto_fracoes ADD COLUMN IF NOT EXISTS tipo TEXT DEFAULT 'fracao';
      ALTER TABLE projeto_fracoes ADD COLUMN IF NOT EXISTS categoria_comum TEXT;
      ALTER TABLE projeto_fracoes ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

      -- Ligação opcional fracao_id em fases, fotos, despesas (NULL = comum ao prédio)
      ALTER TABLE projeto_fases ADD COLUMN IF NOT EXISTS fracao_id TEXT;
      ALTER TABLE projeto_fotos ADD COLUMN IF NOT EXISTS fracao_id TEXT;
      ALTER TABLE despesas ADD COLUMN IF NOT EXISTS fracao_id TEXT;
      CREATE INDEX IF NOT EXISTS idx_projeto_fases_fracao ON projeto_fases(fracao_id);
      CREATE INDEX IF NOT EXISTS idx_projeto_fotos_fracao ON projeto_fotos(fracao_id);
      CREATE INDEX IF NOT EXISTS idx_despesas_fracao ON despesas(fracao_id);

      -- Documentos por fase (PDF, DOCX, imagens diversas)
      CREATE TABLE IF NOT EXISTS projeto_documentos (
        id TEXT PRIMARY KEY,
        fase_id TEXT REFERENCES projeto_fases(id) ON DELETE CASCADE,
        negocio_id TEXT NOT NULL,
        url TEXT NOT NULL,
        nome TEXT NOT NULL,
        tipo TEXT DEFAULT 'outro',  -- escritura | fatura | certificado | relatorio | licenca | outro
        tamanho INTEGER,
        mime TEXT,
        notas TEXT,
        uploaded_by TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_projeto_documentos_fase ON projeto_documentos(fase_id);
      CREATE INDEX IF NOT EXISTS idx_projeto_documentos_negocio ON projeto_documentos(negocio_id);
      CREATE INDEX IF NOT EXISTS idx_projeto_documentos_tipo ON projeto_documentos(tipo);

      -- Ligação de despesas a fases (F2.6): coluna fase_id em despesas
      ALTER TABLE despesas ADD COLUMN IF NOT EXISTS fase_id TEXT;
      ALTER TABLE despesas ADD COLUMN IF NOT EXISTS negocio_id TEXT;
      CREATE INDEX IF NOT EXISTS idx_despesas_fase ON despesas(fase_id);
      CREATE INDEX IF NOT EXISTS idx_despesas_negocio_fase ON despesas(negocio_id, fase_id);

      -- ════════════════════════════════════════════════════════════════
      -- SOPs (Standard Operating Procedures): biblioteca por departamento
      -- com edição Markdown inline e import opcional do Google Drive.
      -- ════════════════════════════════════════════════════════════════
      CREATE TABLE IF NOT EXISTS sops (
        id            SERIAL PRIMARY KEY,
        departamento  TEXT NOT NULL CHECK (departamento IN ('comercial','financeiro','administrativo','geral')),
        titulo        TEXT NOT NULL,
        conteudo_md   TEXT NOT NULL DEFAULT '',
        versao        INT  NOT NULL DEFAULT 1,
        drive_file_id TEXT UNIQUE,
        drive_url     TEXT,
        created_at    TIMESTAMPTZ DEFAULT NOW(),
        updated_at    TIMESTAMPTZ DEFAULT NOW(),
        created_by    TEXT,
        updated_by    TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_sops_departamento ON sops(departamento);
      CREATE INDEX IF NOT EXISTS idx_sops_updated ON sops(updated_at DESC);

      -- F2.8: multi-investidor por projecto com capital e % individuais
      CREATE TABLE IF NOT EXISTS projeto_investidores (
        id TEXT PRIMARY KEY,
        negocio_id TEXT NOT NULL REFERENCES negocios(id) ON DELETE CASCADE,
        investidor_id TEXT NOT NULL REFERENCES investidores(id) ON DELETE CASCADE,
        capital REAL DEFAULT 0,
        percentagem REAL DEFAULT 0,
        notas TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
      CREATE UNIQUE INDEX IF NOT EXISTS idx_projinv_unique ON projeto_investidores(negocio_id, investidor_id);
      CREATE INDEX IF NOT EXISTS idx_projinv_negocio ON projeto_investidores(negocio_id);
      CREATE INDEX IF NOT EXISTS idx_projinv_investidor ON projeto_investidores(investidor_id);

      -- ════════════════════════════════════════════════════════════════
      -- MULTI-REGIÃO (Coimbra | AMP) — expansão Porto/Gaia
      -- Cada entidade pertence a UMA região. Investidores podem ter
      -- preferências em ambas (regioes_preferidas array JSON).
      -- Backfill 'Coimbra' para dados existentes (estado anterior à
      -- expansão). Migrations idempotentes.
      -- ════════════════════════════════════════════════════════════════
      DO $$ BEGIN
        ALTER TABLE imoveis ADD COLUMN IF NOT EXISTS regiao TEXT;
        ALTER TABLE imoveis ADD COLUMN IF NOT EXISTS concelho TEXT;
        ALTER TABLE imoveis ADD COLUMN IF NOT EXISTS distrito TEXT;
        ALTER TABLE imoveis ADD COLUMN IF NOT EXISTS freguesia TEXT;
        UPDATE imoveis SET regiao = 'Coimbra' WHERE regiao IS NULL;
      EXCEPTION WHEN OTHERS THEN NULL;
      END $$;
      CREATE INDEX IF NOT EXISTS idx_imoveis_regiao ON imoveis(regiao);
      CREATE INDEX IF NOT EXISTS idx_imoveis_concelho ON imoveis(concelho);

      DO $$ BEGIN
        ALTER TABLE investidores ADD COLUMN IF NOT EXISTS regioes_preferidas TEXT DEFAULT '["Coimbra"]';
        UPDATE investidores SET regioes_preferidas = '["Coimbra"]' WHERE regioes_preferidas IS NULL;
      EXCEPTION WHEN OTHERS THEN NULL;
      END $$;

      DO $$ BEGIN
        ALTER TABLE consultores ADD COLUMN IF NOT EXISTS regiao TEXT;
        UPDATE consultores SET regiao = 'Coimbra' WHERE regiao IS NULL;
      EXCEPTION WHEN OTHERS THEN NULL;
      END $$;
      CREATE INDEX IF NOT EXISTS idx_consultores_regiao ON consultores(regiao);

      DO $$ BEGIN
        ALTER TABLE negocios ADD COLUMN IF NOT EXISTS regiao TEXT;
        UPDATE negocios SET regiao = 'Coimbra' WHERE regiao IS NULL;
      EXCEPTION WHEN OTHERS THEN NULL;
      END $$;
      CREATE INDEX IF NOT EXISTS idx_negocios_regiao ON negocios(regiao);

      DO $$ BEGIN
        ALTER TABLE despesas ADD COLUMN IF NOT EXISTS regiao TEXT;
        ALTER TABLE despesas ADD COLUMN IF NOT EXISTS concelho TEXT;
        UPDATE despesas SET regiao = 'Coimbra' WHERE regiao IS NULL;
      EXCEPTION WHEN OTHERS THEN NULL;
      END $$;
      CREATE INDEX IF NOT EXISTS idx_despesas_regiao ON despesas(regiao);

      -- Rateio para despesas partilhadas entre regiões. JSON com chaves
      -- region -> fracção (ex: {"Coimbra":0.6,"AMP":0.4}, soma = 1.0). Quando
      -- preenchido, sobrepoe-se a regiao: o custo e dividido proporcionalmente
      -- nos relatorios P&L de cada regiao. Caso tipico: software CRM 100 EUR/mes
      -- usado pelas duas equipas, antes ficava 100% em Coimbra a inflar custos.
      DO $$ BEGIN
        ALTER TABLE despesas ADD COLUMN IF NOT EXISTS rateio TEXT;
      EXCEPTION WHEN OTHERS THEN NULL;
      END $$;

      DO $$ BEGIN
        ALTER TABLE okrs ADD COLUMN IF NOT EXISTS regiao TEXT;
      EXCEPTION WHEN OTHERS THEN NULL;
      END $$;
      CREATE INDEX IF NOT EXISTS idx_okrs_regiao ON okrs(regiao);

      DO $$ BEGIN
        ALTER TABLE tarefas ADD COLUMN IF NOT EXISTS regiao TEXT;
        UPDATE tarefas SET regiao = 'Coimbra' WHERE regiao IS NULL;
      EXCEPTION WHEN OTHERS THEN NULL;
      END $$;
      CREATE INDEX IF NOT EXISTS idx_tarefas_regiao ON tarefas(regiao);

      -- Arquivamento de tarefas concluídas há mais de 90 dias (reversível).
      -- As tarefas continuam na BD; apenas ficam ocultas das listagens por
      -- defeito. Métricas e KPIs continuam a contá-las.
      DO $$ BEGIN
        ALTER TABLE tarefas ADD COLUMN IF NOT EXISTS arquivada BOOLEAN DEFAULT FALSE;
        ALTER TABLE tarefas ADD COLUMN IF NOT EXISTS arquivada_em TEXT;
      EXCEPTION WHEN OTHERS THEN NULL;
      END $$;
      -- Index parcial: 99% das queries filtram WHERE arquivada = FALSE.
      CREATE INDEX IF NOT EXISTS idx_tarefas_activas ON tarefas(inicio DESC) WHERE arquivada = FALSE;

      DO $$ BEGIN
        ALTER TABLE users ADD COLUMN IF NOT EXISTS regiao TEXT;
      EXCEPTION WHEN OTHERS THEN NULL;
      END $$;

      DO $$ BEGIN
        ALTER TABLE visitas ADD COLUMN IF NOT EXISTS regiao TEXT;
      EXCEPTION WHEN OTHERS THEN NULL;
      END $$;
      CREATE INDEX IF NOT EXISTS idx_visitas_regiao ON visitas(regiao);

      -- Audit log regista a região activa do operador no momento da acção.
      -- Permite analisar "actividade por região" sem precisar de inferir
      -- pela tabela alvo (que pode ser global, ex: investidores).
      DO $$ BEGIN
        ALTER TABLE audit_log ADD COLUMN IF NOT EXISTS regiao_activa TEXT;
      EXCEPTION WHEN OTHERS THEN NULL;
      END $$;
      CREATE INDEX IF NOT EXISTS idx_audit_regiao ON audit_log(regiao_activa, created_at DESC);

      -- ════════════════════════════════════════════════════════════════
      -- EMPREITEIROS / CONSTRUTORES — pool por região, especialidades,
      -- preço médio €/m², range geográfico, certificações. Antes só havia
      -- a sub-tab vazia "Construtores" no CRM (endpoint 404 ao gravar).
      -- ════════════════════════════════════════════════════════════════
      CREATE TABLE IF NOT EXISTS empreiteiros (
        id              TEXT PRIMARY KEY,
        nome            TEXT NOT NULL,
        empresa         TEXT,
        nif             TEXT,
        contacto        TEXT,
        email           TEXT,
        morada          TEXT,
        regiao          TEXT,
        concelhos_atuacao TEXT,            -- JSON array (ex: ["Porto","Vila Nova de Gaia"])
        especialidades  TEXT,              -- JSON array (ex: ["Carpintaria","AVAC","Pichelaria"])
        estado          TEXT DEFAULT 'Em avaliação',  -- 'Em avaliação' | 'Activo' | 'Inactivo'
        classificacao   TEXT,              -- 'A' | 'B' | 'C' | 'D'
        preco_m2_medio  REAL DEFAULT 0,    -- €/m² indicativo
        prazo_medio_dias INTEGER DEFAULT 0,
        regime_iva      TEXT DEFAULT 'Normal', -- 'Normal' | 'Autoliquidação' | 'Isento'
        retencao_irs    BOOLEAN DEFAULT false,
        seguro_responsabilidade BOOLEAN DEFAULT false,
        alvara          TEXT,
        notas           TEXT,
        lucro_gerado    REAL DEFAULT 0,
        obras_realizadas INTEGER DEFAULT 0,
        data_primeiro_contacto TEXT,
        data_ultima_obra TEXT,
        created_at      TEXT DEFAULT (NOW()::TEXT),
        updated_at      TEXT DEFAULT (NOW()::TEXT)
      );
      CREATE INDEX IF NOT EXISTS idx_empreiteiros_regiao ON empreiteiros(regiao);
      CREATE INDEX IF NOT EXISTS idx_empreiteiros_estado ON empreiteiros(estado);

      -- ════════════════════════════════════════════════════════════════
      -- MERCADO DE REFERÊNCIA — preços médios e tempo de absorção por
      -- concelho e tipologia. Crítico para wholesaling em AMP (preços
      -- diferem radicalmente entre concelhos). Popular manualmente ou
      -- via scraping mensal.
      -- ════════════════════════════════════════════════════════════════
      CREATE TABLE IF NOT EXISTS mercado_referencia (
        id TEXT PRIMARY KEY,
        regiao TEXT NOT NULL,
        concelho TEXT NOT NULL,
        freguesia TEXT,
        tipologia TEXT,
        eur_m2_compra REAL,
        eur_m2_venda REAL,
        tempo_medio_venda_dias INTEGER,
        taxa_absorcao_pct REAL,
        fonte TEXT,
        data_referencia TEXT,
        notas TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_mercado_regiao ON mercado_referencia(regiao, concelho);
      CREATE INDEX IF NOT EXISTS idx_mercado_tipologia ON mercado_referencia(tipologia);

      -- ════════════════════════════════════════════════════════════════
      -- COMPLIANCE REGIONAL — regras municipais (IMT, IMI, AIMI, ARU)
      -- por concelho. Usado pelas análises de rentabilidade.
      -- ════════════════════════════════════════════════════════════════
      CREATE TABLE IF NOT EXISTS compliance_regional (
        id TEXT PRIMARY KEY,
        regiao TEXT NOT NULL,
        concelho TEXT NOT NULL UNIQUE,
        imt_perc_base REAL,
        imi_perc REAL DEFAULT 0.3,
        aimi_perc REAL,
        zona_aru BOOLEAN DEFAULT false,
        notas_legais TEXT,
        contactos_uteis TEXT,
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_compliance_concelho ON compliance_regional(concelho);

      -- ════════════════════════════════════════════════════════════════
      -- LEAD INTERACTIONS — vista unificada de todas as comunicações
      -- (WhatsApp, Email, Chamada, Visita, Proposta) com qualquer
      -- entidade (imovel, investidor, consultor). Para vista Lead 360.
      -- ════════════════════════════════════════════════════════════════
      CREATE TABLE IF NOT EXISTS lead_interactions (
        id TEXT PRIMARY KEY,
        entidade_tipo TEXT NOT NULL,
        entidade_id TEXT NOT NULL,
        canal TEXT NOT NULL,
        direcao TEXT,
        assunto TEXT,
        conteudo TEXT,
        regiao TEXT,
        data_hora TIMESTAMPTZ DEFAULT NOW(),
        utilizador TEXT,
        metadata JSONB DEFAULT '{}'::jsonb,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_lead_int_entidade ON lead_interactions(entidade_tipo, entidade_id, data_hora DESC);
      CREATE INDEX IF NOT EXISTS idx_lead_int_regiao ON lead_interactions(regiao, data_hora DESC);
      CREATE INDEX IF NOT EXISTS idx_lead_int_canal ON lead_interactions(canal);

      -- ── Indexes de performance (hot paths identificados em audit 2026-05) ──
      -- /api/tarefas filtros + ordering
      CREATE INDEX IF NOT EXISTS idx_tarefas_inicio       ON tarefas(inicio DESC);
      CREATE INDEX IF NOT EXISTS idx_tarefas_status       ON tarefas(status);
      CREATE INDEX IF NOT EXISTS idx_tarefas_funcionario  ON tarefas(funcionario);
      -- calendarSync.js procura por gcal_event_id em vários sítios
      CREATE INDEX IF NOT EXISTS idx_tarefas_gcal_event   ON tarefas(gcal_event_id) WHERE gcal_event_id IS NOT NULL;
      CREATE INDEX IF NOT EXISTS idx_tarefas_pending_gcal ON tarefas(inicio) WHERE gcal_event_id IS NULL AND inicio IS NOT NULL;
      -- fireflies auto-fill (server.js:4259)
      CREATE INDEX IF NOT EXISTS idx_reunioes_analise_pendente ON reunioes(entidade_tipo, created_at DESC) WHERE entidade_id IS NOT NULL AND analise_completa IS NULL;
      CREATE INDEX IF NOT EXISTS idx_reunioes_created       ON reunioes(created_at DESC);
      -- imoveis: filtros temporais usados em weekly-pulse e /api/metricas
      CREATE INDEX IF NOT EXISTS idx_imoveis_data_adicionado  ON imoveis(data_adicionado);
      CREATE INDEX IF NOT EXISTS idx_imoveis_data_chamada     ON imoveis(data_chamada);
      CREATE INDEX IF NOT EXISTS idx_imoveis_data_proposta    ON imoveis(data_proposta);
      -- consultores: alertas de follow-up
      CREATE INDEX IF NOT EXISTS idx_consultores_proximo_fup  ON consultores(data_proximo_follow_up);
      -- negocios: filtros de venda/compra em /api/metricas
      CREATE INDEX IF NOT EXISTS idx_negocios_data_venda      ON negocios(data_venda);
      CREATE INDEX IF NOT EXISTS idx_negocios_data_compra     ON negocios(data_compra);
      -- despesas: filtros de timing já existem; índice em data
      CREATE INDEX IF NOT EXISTS idx_despesas_data            ON despesas(data);

      -- Seed compliance regional (idempotente, com taxas reais por município).
      -- Fontes: portarias municipais 2025/2026 + Lei Geral Tributária.
      -- IMT: taxa marginal usada como "base" — a calculadora aplica escalões.
      -- IMI: taxa fixada anualmente pela assembleia municipal (intervalo
      --      legal 0,3% — 0,45% para urbano avaliado).
      -- AIMI: taxa estatal sobre VPT > €600k (0,4%); 1,0% sobre > €1M.
      INSERT INTO compliance_regional (id, regiao, concelho, imt_perc_base, imi_perc, aimi_perc, zona_aru, notas_legais, contactos_uteis)
      VALUES
        ('compl-coimbra',     'Coimbra', 'Coimbra',            6.0, 0.30, 0.4, true,
         'IMI mínimo legal (0,30%). Centro histórico = ARU "Coimbra Património Mundial" — isenção IMT/IMI até 5 anos em reabilitação. IRS mais-valias isento se reinvestimento em habitação própria.',
         'Câmara: 239 702 000 · Finanças Coimbra-1: 239 798 300 · Conservatória Predial: 239 793 600'),
        ('compl-porto',       'AMP',     'Porto',              6.5, 0.40, 0.4, true,
         'IMI máximo legal (0,45%) prática (0,40% em 2025). Várias ARUs: Baixa do Porto, Bonfim, Campanhã, Cedofeita, Lapa, Massarelos. Isenção IMT até 3 anos e IMI até 5 anos em obras de reabilitação certificadas. AIMI agravado para fundos.',
         'Câmara: 222 097 000 · Finanças Porto-1: 222 098 200 · Conservatória 1ª Porto: 222 339 100'),
        ('compl-gaia',        'AMP',     'Vila Nova de Gaia',  6.5, 0.40, 0.4, true,
         'IMI 0,40%. ARUs: Santa Marinha (centro histórico), Afurada, Mafamude e Vilar do Paraíso, Avintes. Mercado em forte valorização — atenção ao VPT desactualizado vs valor de mercado (factor de avaliação).',
         'Câmara: 223 742 700 · Finanças Gaia-1: 227 869 100 · Conservatória Predial Gaia: 223 716 220'),
        ('compl-feira',       'AMP',     'Santa Maria da Feira', 6.5, 0.35, 0.4, false,
         'IMI 0,35% (escalão intermédio). Sem ARU activa ampla — verificar PDM por freguesia. Distrito de Aveiro, taxas IMT seguem regra nacional. Boa relação preço/m² vs Porto, menor pressão urbanística.',
         'Câmara: 256 370 800 · Finanças Feira-1: 256 379 100')
      ON CONFLICT (concelho) DO UPDATE SET
        imt_perc_base = EXCLUDED.imt_perc_base,
        imi_perc      = EXCLUDED.imi_perc,
        aimi_perc     = EXCLUDED.aimi_perc,
        zona_aru      = EXCLUDED.zona_aru,
        notas_legais  = EXCLUDED.notas_legais,
        contactos_uteis = EXCLUDED.contactos_uteis,
        updated_at    = NOW();
    `)

    // ── Foreign keys (migration 006) ──────────────────────────
    // Liga ~30 relacoes que so existiam como `text` solto. Criadas como
    // NOT VALID: enforcam escritas futuras sem fazer scan/bloquear o boot
    // por dados antigos. Sem CASCADE (nullable -> SET NULL; NOT NULL ->
    // NO ACTION) para nunca apagar filhos ao apagar o pai. Idempotente.
    // Validacao dos dados antigos: scripts/migrations/006b_validate_fks.sql.
    await client.query(`
      -- → imoveis(id)
      DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'negocios'::regclass AND conname = 'negocios_imovel_id_fkey') THEN
          ALTER TABLE negocios ADD CONSTRAINT negocios_imovel_id_fkey FOREIGN KEY (imovel_id) REFERENCES imoveis(id) ON DELETE SET NULL NOT VALID;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'analises'::regclass AND conname = 'analises_imovel_id_fkey') THEN
          ALTER TABLE analises ADD CONSTRAINT analises_imovel_id_fkey FOREIGN KEY (imovel_id) REFERENCES imoveis(id) ON DELETE CASCADE NOT VALID;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'checklist_imovel'::regclass AND conname = 'checklist_imovel_imovel_id_fkey') THEN
          ALTER TABLE checklist_imovel ADD CONSTRAINT checklist_imovel_imovel_id_fkey FOREIGN KEY (imovel_id) REFERENCES imoveis(id) ON DELETE CASCADE NOT VALID;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'consultor_interacoes'::regclass AND conname = 'consultor_interacoes_imovel_id_fkey') THEN
          ALTER TABLE consultor_interacoes ADD CONSTRAINT consultor_interacoes_imovel_id_fkey FOREIGN KEY (imovel_id) REFERENCES imoveis(id) ON DELETE SET NULL NOT VALID;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'documentos_investidor'::regclass AND conname = 'documentos_investidor_imovel_id_fkey') THEN
          ALTER TABLE documentos_investidor ADD CONSTRAINT documentos_investidor_imovel_id_fkey FOREIGN KEY (imovel_id) REFERENCES imoveis(id) ON DELETE SET NULL NOT VALID;
        END IF;
      END $$;

      -- → investidores(id)
      DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'scorecards'::regclass AND conname = 'scorecards_investidor_id_fkey') THEN
          ALTER TABLE scorecards ADD CONSTRAINT scorecards_investidor_id_fkey FOREIGN KEY (investidor_id) REFERENCES investidores(id) ON DELETE NO ACTION NOT VALID;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'classificacao_historico'::regclass AND conname = 'classificacao_historico_investidor_id_fkey') THEN
          ALTER TABLE classificacao_historico ADD CONSTRAINT classificacao_historico_investidor_id_fkey FOREIGN KEY (investidor_id) REFERENCES investidores(id) ON DELETE NO ACTION NOT VALID;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'documentos_investidor'::regclass AND conname = 'documentos_investidor_investidor_id_fkey') THEN
          ALTER TABLE documentos_investidor ADD CONSTRAINT documentos_investidor_investidor_id_fkey FOREIGN KEY (investidor_id) REFERENCES investidores(id) ON DELETE NO ACTION NOT VALID;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'projeto_assinaturas'::regclass AND conname = 'projeto_assinaturas_investidor_id_fkey') THEN
          ALTER TABLE projeto_assinaturas ADD CONSTRAINT projeto_assinaturas_investidor_id_fkey FOREIGN KEY (investidor_id) REFERENCES investidores(id) ON DELETE SET NULL NOT VALID;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'investidores'::regclass AND conname = 'investidores_duplicado_de_fkey') THEN
          ALTER TABLE investidores ADD CONSTRAINT investidores_duplicado_de_fkey FOREIGN KEY (duplicado_de) REFERENCES investidores(id) ON DELETE SET NULL NOT VALID;
        END IF;
      END $$;

      -- → consultores(id)
      DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'consultor_interacoes'::regclass AND conname = 'consultor_interacoes_consultor_id_fkey') THEN
          ALTER TABLE consultor_interacoes ADD CONSTRAINT consultor_interacoes_consultor_id_fkey FOREIGN KEY (consultor_id) REFERENCES consultores(id) ON DELETE NO ACTION NOT VALID;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'consultor_followups'::regclass AND conname = 'consultor_followups_consultor_id_fkey') THEN
          ALTER TABLE consultor_followups ADD CONSTRAINT consultor_followups_consultor_id_fkey FOREIGN KEY (consultor_id) REFERENCES consultores(id) ON DELETE NO ACTION NOT VALID;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'whatsapp_last_seen'::regclass AND conname = 'whatsapp_last_seen_consultor_id_fkey') THEN
          ALTER TABLE whatsapp_last_seen ADD CONSTRAINT whatsapp_last_seen_consultor_id_fkey FOREIGN KEY (consultor_id) REFERENCES consultores(id) ON DELETE NO ACTION NOT VALID;
        END IF;
      END $$;

      -- → negocios(id)
      DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'despesas'::regclass AND conname = 'despesas_negocio_id_fkey') THEN
          ALTER TABLE despesas ADD CONSTRAINT despesas_negocio_id_fkey FOREIGN KEY (negocio_id) REFERENCES negocios(id) ON DELETE SET NULL NOT VALID;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'projeto_audit'::regclass AND conname = 'projeto_audit_negocio_id_fkey') THEN
          ALTER TABLE projeto_audit ADD CONSTRAINT projeto_audit_negocio_id_fkey FOREIGN KEY (negocio_id) REFERENCES negocios(id) ON DELETE NO ACTION NOT VALID;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'projeto_assinaturas'::regclass AND conname = 'projeto_assinaturas_negocio_id_fkey') THEN
          ALTER TABLE projeto_assinaturas ADD CONSTRAINT projeto_assinaturas_negocio_id_fkey FOREIGN KEY (negocio_id) REFERENCES negocios(id) ON DELETE NO ACTION NOT VALID;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'projeto_share_tokens'::regclass AND conname = 'projeto_share_tokens_negocio_id_fkey') THEN
          ALTER TABLE projeto_share_tokens ADD CONSTRAINT projeto_share_tokens_negocio_id_fkey FOREIGN KEY (negocio_id) REFERENCES negocios(id) ON DELETE NO ACTION NOT VALID;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'projeto_comentarios'::regclass AND conname = 'projeto_comentarios_negocio_id_fkey') THEN
          ALTER TABLE projeto_comentarios ADD CONSTRAINT projeto_comentarios_negocio_id_fkey FOREIGN KEY (negocio_id) REFERENCES negocios(id) ON DELETE NO ACTION NOT VALID;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'projeto_documentos'::regclass AND conname = 'projeto_documentos_negocio_id_fkey') THEN
          ALTER TABLE projeto_documentos ADD CONSTRAINT projeto_documentos_negocio_id_fkey FOREIGN KEY (negocio_id) REFERENCES negocios(id) ON DELETE NO ACTION NOT VALID;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'projeto_fotos'::regclass AND conname = 'projeto_fotos_negocio_id_fkey') THEN
          ALTER TABLE projeto_fotos ADD CONSTRAINT projeto_fotos_negocio_id_fkey FOREIGN KEY (negocio_id) REFERENCES negocios(id) ON DELETE NO ACTION NOT VALID;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'investidor_acessos'::regclass AND conname = 'investidor_acessos_negocio_id_fkey') THEN
          ALTER TABLE investidor_acessos ADD CONSTRAINT investidor_acessos_negocio_id_fkey FOREIGN KEY (negocio_id) REFERENCES negocios(id) ON DELETE SET NULL NOT VALID;
        END IF;
      END $$;

      -- → users(id)
      DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'notificacoes'::regclass AND conname = 'notificacoes_user_id_fkey') THEN
          ALTER TABLE notificacoes ADD CONSTRAINT notificacoes_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE NO ACTION NOT VALID;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'investidor_acessos'::regclass AND conname = 'investidor_acessos_user_id_fkey') THEN
          ALTER TABLE investidor_acessos ADD CONSTRAINT investidor_acessos_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE NO ACTION NOT VALID;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'investidores'::regclass AND conname = 'investidores_user_id_fkey') THEN
          ALTER TABLE investidores ADD CONSTRAINT investidores_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL NOT VALID;
        END IF;
      END $$;

      -- → projeto_fases(id) / projeto_fracoes(id)
      DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'despesas'::regclass AND conname = 'despesas_fase_id_fkey') THEN
          ALTER TABLE despesas ADD CONSTRAINT despesas_fase_id_fkey FOREIGN KEY (fase_id) REFERENCES projeto_fases(id) ON DELETE SET NULL NOT VALID;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'despesas'::regclass AND conname = 'despesas_fracao_id_fkey') THEN
          ALTER TABLE despesas ADD CONSTRAINT despesas_fracao_id_fkey FOREIGN KEY (fracao_id) REFERENCES projeto_fracoes(id) ON DELETE SET NULL NOT VALID;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'projeto_fases'::regclass AND conname = 'projeto_fases_fracao_id_fkey') THEN
          ALTER TABLE projeto_fases ADD CONSTRAINT projeto_fases_fracao_id_fkey FOREIGN KEY (fracao_id) REFERENCES projeto_fracoes(id) ON DELETE SET NULL NOT VALID;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'projeto_fotos'::regclass AND conname = 'projeto_fotos_fracao_id_fkey') THEN
          ALTER TABLE projeto_fotos ADD CONSTRAINT projeto_fotos_fracao_id_fkey FOREIGN KEY (fracao_id) REFERENCES projeto_fracoes(id) ON DELETE SET NULL NOT VALID;
        END IF;
      END $$;

      -- → reunioes(id) / scorecards(id)
      DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'scorecards'::regclass AND conname = 'scorecards_reuniao_id_fkey') THEN
          ALTER TABLE scorecards ADD CONSTRAINT scorecards_reuniao_id_fkey FOREIGN KEY (reuniao_id) REFERENCES reunioes(id) ON DELETE SET NULL NOT VALID;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'classificacao_historico'::regclass AND conname = 'classificacao_historico_scorecard_id_fkey') THEN
          ALTER TABLE classificacao_historico ADD CONSTRAINT classificacao_historico_scorecard_id_fkey FOREIGN KEY (scorecard_id) REFERENCES scorecards(id) ON DELETE SET NULL NOT VALID;
        END IF;
      END $$;

      -- Formaliza 3 colunas usadas todos os dias (formulários, PDFs, auto-geração
      -- de ref_interna) mas que existiam só em produção, criadas manualmente fora
      -- do processo de migração (ver migration 0031_imoveis_campos_manuais.sql).
      DO $$ BEGIN
        ALTER TABLE imoveis ADD COLUMN IF NOT EXISTS ref_interna TEXT;
        ALTER TABLE imoveis ADD COLUMN IF NOT EXISTS imi_anual REAL;
        ALTER TABLE imoveis ADD COLUMN IF NOT EXISTS condominio_mensal_anunciado REAL;
      EXCEPTION WHEN OTHERS THEN NULL;
      END $$;

      -- Hierarquia de classificação do investidor (ver migration
      -- 0032_investidores_classificacao_origem.sql).
      DO $$ BEGIN
        ALTER TABLE investidores ADD COLUMN IF NOT EXISTS classificacao_origem TEXT DEFAULT 'automatica';
        ALTER TABLE investidores ADD COLUMN IF NOT EXISTS classificacao_definida_em TIMESTAMPTZ;
      EXCEPTION WHEN OTHERS THEN NULL;
      END $$;

      -- Documentos do investidor no Google Drive (ver migration
      -- 0033_investidores_drive_documentos.sql).
      DO $$ BEGIN
        ALTER TABLE investidores ADD COLUMN IF NOT EXISTS drive_folder_id TEXT;
        ALTER TABLE documentos_investidor ADD COLUMN IF NOT EXISTS storage_path TEXT;
        ALTER TABLE documentos_investidor ADD COLUMN IF NOT EXISTS drive_file_id TEXT;
      EXCEPTION WHEN OTHERS THEN NULL;
      END $$;
    `)

    // Bootstrap: garantir que somniumprs@gmail.com (owner) existe como admin
    await client.query(`
      INSERT INTO users (id, email, nome, iniciais, cor, role, ativo)
      VALUES ('owner', 'somniumprs@gmail.com', 'João Abreu', 'JA', '#C9A84C', 'admin', true)
      ON CONFLICT (id) DO UPDATE SET role = 'admin', ativo = true
    `)
    console.log('[pg] Schema criado/verificado')
  } finally {
    client.release()
  }
}

// ── Query helpers (compatible API with SQLite) ───────────────
export const query = (text, params) => pool.query(text, params)

export default pool
