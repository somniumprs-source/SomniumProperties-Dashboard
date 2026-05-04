/**
 * Agregador de Relatorios Semanais Administracao.
 * Pega em N reunioes com titulo "Reuniao Semanal" da semana indicada,
 * concatena transcricoes e usa Claude Sonnet 4 para gerar JSON estruturado
 * compativel com pdfRelatorioSemanal.js.
 */
import pool from './pg.js'
import { randomUUID } from 'crypto'

const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY || ''

export async function gerarRelatorioSemanal({ semana_iso, data_inicio, data_fim, regenerar = false }) {
  // Determinar janela
  const range = resolveRange({ semana_iso, data_inicio, data_fim })

  // Verificar se ja existe
  const { rows: [existing] } = await pool.query(
    'SELECT id FROM relatorios_semanais WHERE semana_iso = $1 LIMIT 1', [range.semana_iso]
  )
  if (existing && !regenerar) {
    return { id: existing.id, semana_iso: range.semana_iso, status: 'existing', message: 'Relatorio ja existe; usar regenerar=true para reanalisar' }
  }

  // Procurar reunioes "Reuniao Semanal" da semana
  const { rows: reunioes } = await pool.query(
    `SELECT * FROM reunioes
     WHERE titulo ILIKE '%reuni%semanal%'
       AND data >= $1 AND data <= $2
     ORDER BY data ASC`,
    [range.data_inicio, range.data_fim + 'T23:59:59']
  )

  if (reunioes.length === 0) {
    throw new Error(`Sem reunioes "Reuniao Semanal" na semana ${range.semana_iso} (${range.data_inicio} a ${range.data_fim})`)
  }

  // Gerar conteudo via Claude
  const conteudo = ANTHROPIC_KEY
    ? await aggregateWithClaude(reunioes, range)
    : aggregateFallback(reunioes, range)

  const id = existing?.id || randomUUID()
  const now = new Date().toISOString()
  const titulo = 'Relatório de Reunião Semanal'
  const subtitulo = 'Estratégia Comercial e Captação de Capital'
  const reuniao_ids = JSON.stringify(reunioes.map(r => r.id))

  if (existing) {
    await pool.query(
      `UPDATE relatorios_semanais
       SET data_inicio=$1, data_fim=$2, titulo=$3, subtitulo=$4,
           reuniao_ids=$5, conteudo_json=$6, updated_at=$7
       WHERE id=$8`,
      [range.data_inicio, range.data_fim, titulo, subtitulo, reuniao_ids, JSON.stringify(conteudo), now, existing.id]
    )
  } else {
    await pool.query(
      `INSERT INTO relatorios_semanais
       (id, semana_iso, data_inicio, data_fim, titulo, subtitulo, reuniao_ids, conteudo_json, created_at, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [id, range.semana_iso, range.data_inicio, range.data_fim, titulo, subtitulo, reuniao_ids, JSON.stringify(conteudo), now, now]
    )
  }

  return {
    id,
    semana_iso: range.semana_iso,
    status: existing ? 'regenerated' : 'created',
    reunioes: reunioes.length,
    custo_estimado_eur: ANTHROPIC_KEY ? 0.10 : 0,
  }
}

/**
 * Auto-geracao em lote: para cada semana ISO com reunioes "Reuniao Semanal",
 * cria ou regenera o relatorio correspondente. Usado pelo auto-sync Fireflies
 * e pelo botao "Sincronizar Fireflies" da pagina Relatorios Administracao.
 */
export async function autoGerarRelatoriosSemanaisPendentes({ apenas_pendentes = false } = {}) {
  const { rows: semanas } = await pool.query(`
    SELECT to_char(data::timestamp, 'IYYY-"W"IW') AS semana_iso,
           MIN(data) AS primeira_reuniao
    FROM reunioes
    WHERE titulo ILIKE '%reuni%semanal%'
    GROUP BY to_char(data::timestamp, 'IYYY-"W"IW')
    ORDER BY MIN(data) DESC
  `)

  let criados = 0, actualizados = 0
  const erros = []
  for (const s of semanas) {
    if (apenas_pendentes) {
      const { rows: [exists] } = await pool.query(
        'SELECT 1 FROM relatorios_semanais WHERE semana_iso = $1', [s.semana_iso]
      )
      if (exists) continue
    }
    try {
      const r = await gerarRelatorioSemanal({ semana_iso: s.semana_iso, regenerar: true })
      if (r.status === 'created') criados++
      else if (r.status === 'regenerated') actualizados++
    } catch (e) {
      erros.push({ semana: s.semana_iso, erro: e.message })
    }
  }
  return {
    semanasProcessadas: semanas.length,
    criados,
    actualizados,
    custoEur: Number(((criados + actualizados) * 0.10).toFixed(2)),
    erros,
  }
}

// ─── Claude aggregation ─────────────────────────────────────────────
async function aggregateWithClaude(reunioes, range) {
  const Anthropic = (await import('@anthropic-ai/sdk')).default
  const client = new Anthropic({ apiKey: ANTHROPIC_KEY })

  const concat = reunioes.map(r =>
    `=== REUNIÃO: ${r.titulo} (${r.data}) ===\nDuração: ${r.duracao_min || '?'} min\n\n${r.transcricao || r.resumo || ''}`
  ).join('\n\n')
  const slice = concat.slice(0, 30000)
  const participantes = collectParticipantes(reunioes)

  const message = await client.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 4500,
    messages: [{
      role: 'user',
      content: `Es analista executivo da Somnium Properties (investimento imobiliário em Coimbra, Portugal).
Recebes transcrições de reuniões internas semanais (sócios Alexandre Mendes, João Abreu e Luís Pedro).
Compõe um relatório executivo CORPORATIVO em PT-PT formal, estruturado para PDF institucional.

Participantes habituais: ${participantes.join(', ')}
Período: ${range.data_inicio} a ${range.data_fim} (${range.semana_iso})

TRANSCRIÇÕES CONCATENADAS:
${slice}

Devolve APENAS JSON válido com esta estrutura (omite secções sem conteúdo relevante):
{
  "participantes": ["Nome 1", "Nome 2", ...],
  "distribuicao": "Equipa Somnium",
  "sumario_executivo": "Parágrafo formal de 4-6 frases sintetizando os eixos da semana, sem bullets, em registo executivo PT-PT.",
  "decisao_chave": "Frase declarativa única destacando a decisão estratégica mais importante da semana.",
  "indicadores": [
    {"indicador": "Capital total identificado", "valor": "€640k – €750k"},
    {"indicador": "Capital confirmado", "valor": "€250k – €260k"},
    {"indicador": "Risco crítico identificado", "valor": "...", "highlight": true}
  ],
  "captacao_capital": {
    "titulo": "Captação de Capital — Novo Parceiro",
    "perfil_titulo": "Perfil do Investidor (Nome, Localização)",
    "perfil_investidor": ["Bullet 1 sobre perfil", "Bullet 2", ...],
    "criterios": [["Cash-on-cash mínimo", "15% – 17%"], ["ROI anualizado", "..."]],
    "proposta_estrutural": "Parágrafo sobre proposta apresentada pelo investidor.",
    "pendencia": "Texto da pendência a validar.",
    "proximos_passos_relacionais": ["Reunião X agendada para...", "..."]
  },
  "pipeline_investidores": [
    {"investidor": "Luís Pedro", "capital": "€250k – €260k", "estatuto": "Confirmado", "observacoes": "..."},
    {"investidor": "Paulo (Braga)", "capital": "€50k – €150k", "estatuto": "Em validação", "observacoes": "..."}
  ],
  "cenarios_alocacao": [
    {
      "titulo": "Cenário A — Aquisição dos dois T2 Cávelage",
      "descricao": null,
      "composicao": [
        {"fracao": "T2 — Apt 1", "composicao": "€90k Lucas + €90k Luís Pedro", "total": "€180k"}
      ]
    },
    {
      "titulo": "Cenário B — Moradia Santo Varão",
      "descricao": "Estrutura alternativa em que o novo parceiro absorve a maioria do capital.",
      "composicao": []
    }
  ],
  "ativos": [
    {
      "nome": "Prédio T2 Cávelage",
      "estado_pipeline": ["Três frações disponíveis...", "Imóvel não anunciado..."],
      "analise_financeira": [
        {"indicador": "Aquisição", "apt_superior": "€115.000", "subcave": "€110.000"}
      ],
      "posicao_negocial": "Apresentar proposta global de €225k...",
      "risco_critico": true,
      "risco_critico_tabela": [
        {"fracao": "PI0", "planta": "54 m²", "tabela": "80 m²", "disparidade": "≈ 26 m²"}
      ],
      "risco_critico_impacto": "Texto sobre impacto da disparidade.",
      "riscos": [
        {"risco": "Disparidade de áreas", "categoria": "Crítico", "mitigacao": "Validação presencial..."}
      ]
    }
  ],
  "compliance": {
    "titulo": "Posicionamento Estratégico e Compliance",
    "seccoes": [
      {
        "titulo": "Modelo de Cedência de Posição",
        "texto": "Parágrafo sobre o modelo Somnium...",
        "bullets": [],
        "principio": null
      },
      {
        "titulo": "Origem de Capitais — Prevenção de Branqueamento",
        "texto": "Recomenda-se a adoção de procedimento sistemático:",
        "bullets": ["Declaração de compromisso...", "Solicitação de documentação..."],
        "principio": "Quando a oferta de capital é desproporcionada..."
      }
    ]
  },
  "plano_accao": [
    {"responsavel": "Luís Pedro", "tarefa": "Esclarecer com Sr. Félix...", "prazo": "Segunda"},
    {"responsavel": "Alexandre + João", "tarefa": "Reunião institucional com Paulo", "prazo": "Sexta, 14h"}
  ],
  "conclusao": "Parágrafo final em registo executivo, 3-4 frases."
}

REGRAS:
- PT-PT formal, sem emojis nem markdown.
- Valores monetários como "€250.000" ou "€250k". Percentagens com símbolo.
- Quando algo não é mencionado, omite a secção/bullet em vez de inventar.
- "decisao_chave" deve ser uma única frase, não bullet list.
- "participantes" são apenas os primeiros nomes ou "Nome Apelido" curto.`
    }]
  })

  try {
    const text = message.content[0].text
    const jsonMatch = text.match(/\{[\s\S]*\}/)
    return JSON.parse(jsonMatch[0])
  } catch (e) {
    console.error('[relatorioSemanal] erro parse JSON Claude:', e.message)
    return aggregateFallback(reunioes, range)
  }
}

// ─── Fallback sem Claude ────────────────────────────────────────────
function aggregateFallback(reunioes, range) {
  const participantes = collectParticipantes(reunioes)
  const sumarios = reunioes.map(r => r.resumo).filter(Boolean).join(' ')
  const acoes = reunioes.flatMap(r => (r.action_items || '').split('\n').filter(Boolean))
  return {
    participantes,
    distribuicao: 'Equipa Somnium',
    sumario_executivo: sumarios.slice(0, 600) || `Compilação de ${reunioes.length} reuniões da semana ${range.semana_iso}.`,
    plano_accao: acoes.slice(0, 12).map((a, i) => ({ responsavel: 'Equipa', tarefa: a, prazo: '—' })),
    conclusao: `Relatório gerado sem análise IA. ${reunioes.length} reuniões compiladas.`,
  }
}

function collectParticipantes(reunioes) {
  const set = new Set()
  for (const r of reunioes) {
    let parts = []
    try { parts = typeof r.participantes === 'string' ? JSON.parse(r.participantes) : (r.participantes || []) } catch {}
    for (const p of parts) {
      const name = typeof p === 'string'
        ? (p.includes('@') ? p.split('@')[0].replace(/[._-]/g, ' ').replace(/\b\w/g, c => c.toUpperCase()) : p)
        : (p?.name || p?.email)
      if (name) set.add(name)
    }
  }
  return Array.from(set).slice(0, 8)
}

// ─── Resolucao de janela temporal ───────────────────────────────────
function resolveRange({ semana_iso, data_inicio, data_fim }) {
  if (data_inicio && data_fim) {
    return {
      data_inicio,
      data_fim,
      semana_iso: semana_iso || isoWeek(new Date(data_inicio)),
    }
  }
  if (semana_iso) {
    const m = semana_iso.match(/^(\d{4})-W(\d{1,2})$/)
    if (!m) throw new Error('semana_iso inválida (formato esperado: 2026-W18)')
    const { start, end } = isoWeekRange(parseInt(m[1]), parseInt(m[2]))
    return {
      semana_iso,
      data_inicio: start.toISOString().slice(0, 10),
      data_fim: end.toISOString().slice(0, 10),
    }
  }
  // default: semana atual
  const today = new Date()
  const week = isoWeek(today)
  const m = week.match(/^(\d{4})-W(\d{1,2})$/)
  const { start, end } = isoWeekRange(parseInt(m[1]), parseInt(m[2]))
  return {
    semana_iso: week,
    data_inicio: start.toISOString().slice(0, 10),
    data_fim: end.toISOString().slice(0, 10),
  }
}

function isoWeek(d) {
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()))
  const dayNum = date.getUTCDay() || 7
  date.setUTCDate(date.getUTCDate() + 4 - dayNum)
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1))
  const weekNum = Math.ceil(((date - yearStart) / 86400000 + 1) / 7)
  return `${date.getUTCFullYear()}-W${String(weekNum).padStart(2, '0')}`
}

function isoWeekRange(year, week) {
  const simple = new Date(Date.UTC(year, 0, 1 + (week - 1) * 7))
  const dow = simple.getUTCDay()
  const start = new Date(simple)
  if (dow <= 4) start.setUTCDate(simple.getUTCDate() - simple.getUTCDay() + 1)
  else start.setUTCDate(simple.getUTCDate() + 8 - simple.getUTCDay())
  const end = new Date(start)
  end.setUTCDate(start.getUTCDate() + 6)
  return { start, end }
}
