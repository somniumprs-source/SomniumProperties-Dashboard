/**
 * Análise de reuniões com investidores.
 * Extrai informação da transcrição + gera sugestões de melhoria.
 * Usa Claude API se disponível, senão usa análise por padrões.
 */
import pool from './pg.js'

const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY || ''

/**
 * Analisa uma reunião e retorna:
 * - dados extraídos para preencher a ficha do investidor
 * - sugestões de melhoria para a reunião
 * - resumo executivo
 */
export async function analyzeReuniao(reuniaoId) {
  const { rows: [reuniao] } = await pool.query('SELECT * FROM reunioes WHERE id = $1', [reuniaoId])
  if (!reuniao) throw new Error('Reunião não encontrada')

  const transcricao = reuniao.transcricao || ''
  const resumo = reuniao.resumo || ''

  if (ANTHROPIC_KEY) {
    return analyzeWithClaude(reuniao, transcricao, resumo)
  }
  return analyzeWithPatterns(reuniao, transcricao, resumo)
}

/**
 * Análise com Claude API
 */
async function analyzeWithClaude(reuniao, transcricao, resumo) {
  const Anthropic = (await import('@anthropic-ai/sdk')).default
  const client = new Anthropic({ apiKey: ANTHROPIC_KEY })

  const message = await client.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 2000,
    messages: [{
      role: 'user',
      content: `Analisa esta transcrição de uma reunião com um potencial investidor imobiliário da Somnium Properties (empresa de investimento imobiliário em Coimbra, Portugal).

TÍTULO: ${reuniao.titulo}
DATA: ${reuniao.data}
RESUMO FIREFLIES: ${resumo}

TRANSCRIÇÃO:
${transcricao.slice(0, 8000)}

Responde APENAS em JSON válido com esta estrutura:
{
  "investidor_dados": {
    "capital_min": null ou número em EUR,
    "capital_max": null ou número em EUR,
    "estrategia": [] array de estratégias mencionadas (ex: "Wholesaling", "Fix & Flip", "CAEP", "Capital Passivo"),
    "perfil_risco": null ou "Conservador" ou "Moderado" ou "Agressivo",
    "tipo_investidor": [] array (ex: "Passivo", "Ativo", "Particular", "Institucional"),
    "experiencia_imobiliario": null ou texto breve,
    "motivacao": null ou texto breve,
    "objecoes": null ou texto breve,
    "profissao": null ou texto,
    "localizacao": null ou texto
  },
  "resumo_executivo": "2-3 frases resumindo a reunião",
  "pontos_chave": ["ponto 1", "ponto 2", ...],
  "proximos_passos": ["passo 1", "passo 2", ...],
  "sugestoes_melhoria": [
    "sugestão concreta para melhorar a abordagem",
    "sugestão sobre o que poderia ter sido perguntado",
    "sugestão sobre técnica de vendas ou comunicação"
  ],
  "classificacao_sugerida": "A" ou "B" ou "C" ou "D",
  "probabilidade_investimento": 0 a 100,
  "notas_adicionais": "informação relevante adicional",
  "scorecard": {
    "tipo_investidor": "Passivo" ou "Ativo",
    "c1_score": 1 a 5 (Capacidade Financeira — Passivo: mín €50k, Ativo: mín €200k. 1=sem capital, 3=mínimo OK, 5=muito acima),
    "c1_notas": "justificação breve",
    "c2_score": 1 a 5 (Experiência Imobiliária — Passivo: peso reduzido, foco sofisticação. Ativo: peso máximo, gestão obra),
    "c2_notas": "justificação breve",
    "c3_score": 1 a 5 (Alinhamento Estratégico — ROI realista, tolerância imprevistos, aceita modelo Somnium),
    "c3_notas": "justificação breve",
    "c4_score": 1 a 5 (Estabilidade e Credibilidade — coerência respostas, disposição KYC, origem capital),
    "c4_notas": "justificação breve",
    "c5_score": 1 a 5 (Disponibilidade e Compromisso — timing decisão, capital reservado, agenda livre),
    "c5_notas": "justificação breve"
  }
}`
    }]
  })

  try {
    const text = message.content[0].text
    const jsonMatch = text.match(/\{[\s\S]*\}/)
    return JSON.parse(jsonMatch[0])
  } catch {
    return { error: 'Erro ao processar resposta da AI', raw: message.content[0].text }
  }
}

/**
 * Análise por padrões de texto (fallback sem AI)
 */
function analyzeWithPatterns(reuniao, transcricao, resumo) {
  const text = (transcricao + ' ' + resumo).toLowerCase()

  // Extrair capital
  const capitalMatch = text.match(/(\d[\d.,]*)\s*(mil|k|euros?|€)/gi)
  let capital_min = null, capital_max = null
  if (capitalMatch) {
    const values = capitalMatch.map(m => {
      const num = parseFloat(m.replace(/[^\d.,]/g, '').replace(',', '.'))
      return m.toLowerCase().includes('mil') || m.toLowerCase().includes('k') ? num * 1000 : num
    }).filter(v => v > 1000 && v < 10000000).sort((a, b) => a - b)
    if (values.length >= 2) { capital_min = values[0]; capital_max = values[values.length - 1] }
    else if (values.length === 1) { capital_max = values[0] }
  }

  // Estratégias
  const estrategia = []
  if (/wholesal/i.test(text)) estrategia.push('Wholesaling')
  if (/fix\s*[&e]\s*flip/i.test(text)) estrategia.push('Fix & Flip')
  if (/caep/i.test(text)) estrategia.push('CAEP')
  if (/passivo|rendimento|renda/i.test(text)) estrategia.push('Capital Passivo')
  if (/media[çc][aã]o/i.test(text)) estrategia.push('Mediação')

  // Perfil de risco
  let perfil_risco = null
  if (/conservador|seguro|baixo risco|sem risco/i.test(text)) perfil_risco = 'Conservador'
  else if (/agressivo|alto retorno|risco elevado/i.test(text)) perfil_risco = 'Agressivo'
  else if (/moderado|equilibr/i.test(text)) perfil_risco = 'Moderado'

  // Tipo investidor
  const tipo_investidor = []
  if (/passivo/i.test(text)) tipo_investidor.push('Passivo')
  if (/ativo|quer participar|hands.on/i.test(text)) tipo_investidor.push('Ativo')
  if (/empresa|institucional|fundo/i.test(text)) tipo_investidor.push('Institucional')
  else tipo_investidor.push('Particular')

  // Sugestões de melhoria — análise estruturada
  const sugestoes = []
  if (!/(quanto|capital|dinheiro|valor|investir|montante)/i.test(text))
    sugestoes.push('Qualificação financeira: Na próxima reunião, abordar diretamente o capital disponível para investimento e o horizonte de retorno esperado.')
  if (!/(prazo|horizonte|quando|urgência|tempo)/i.test(text))
    sugestoes.push('Horizonte temporal: Definir se o investidor procura retorno a curto prazo (6-12 meses) ou está disponível para projetos de médio/longo prazo.')
  if (!/(risco|segur|garant)/i.test(text))
    sugestoes.push('Apetite ao risco: Explorar a tolerância ao risco — se prefere modelos com Plano B garantido (arrendamento) ou aceita operações com maior retorno e maior risco.')
  if (!/(experiência|já investiu|outros investimentos)/i.test(text))
    sugestoes.push('Experiência prévia: Questionar sobre investimentos anteriores em imobiliário ou noutras classes de ativos para calibrar a comunicação e as expectativas.')
  if (!/(próximo|follow|quando|marcar|agenda)/i.test(text))
    sugestoes.push('Compromisso de follow-up: Terminar sempre a reunião com data marcada para o próximo contacto e ação concreta atribuída a cada parte.')
  if (!/(obje[çc][ãa]|preocupa|receio|dúvida|mas )/i.test(text))
    sugestoes.push('Gestão de objeções: Identificar proativamente receios e preocupações do investidor — é o caminho mais rápido para fechar ou desqualificar.')
  if (!/(nda|contrato|formaliz|assin)/i.test(text))
    sugestoes.push('Formalização: Abordar a assinatura de NDA e formalização da relação na fase adequada para transmitir profissionalismo.')
  if (!/(concorr|compara|outr.*empresa|alternativ)/i.test(text))
    sugestoes.push('Posicionamento competitivo: Perguntar se está a avaliar outras oportunidades de investimento para entender a urgência e diferenciar a proposta Somnium.')
  if (sugestoes.length === 0)
    sugestoes.push('Reunião bem estruturada e abrangente. Recomendação: manter follow-up dentro de 48 horas com resumo escrito dos pontos acordados.')

  // Pontos-chave — limpar e filtrar
  const pontos_chave = []
  if (reuniao.keywords) {
    pontos_chave.push(...reuniao.keywords.split(',').map(k => k.trim()).filter(k => k.length > 2 && !k.startsWith('**')).slice(0, 6))
  }
  // Action items limpos
  const actionItems = (reuniao.action_items || '').split('\n')
    .filter(a => a.length > 5 && !a.startsWith('**'))
    .map(a => a.replace(/\(\d{2}:\d{2}\)/g, '').trim())
    .slice(0, 5)

  // Classificação mais inteligente
  let score = 30
  if (capital_max > 100000) score += 25
  else if (capital_max > 30000) score += 15
  if (estrategia.length > 0) score += 10
  if (perfil_risco) score += 5
  if (/(sim|interessado|quero|vamos|avanç)/i.test(text)) score += 15
  if (/(não|sem interesse|agora não|talvez)/i.test(text)) score -= 10
  score = Math.max(10, Math.min(95, score))

  const classificacao = score >= 70 ? 'A' : score >= 50 ? 'B' : score >= 30 ? 'C' : 'D'

  // Gerar scorecard por padrões
  const tipoInv = tipo_investidor.includes('Ativo') ? 'Ativo' : 'Passivo'
  const sc_c1 = capital_max >= 200000 ? 5 : capital_max >= 100000 ? 4 : capital_max >= 50000 ? 3 : capital_max > 0 ? 2 : 1
  const sc_c2 = /(já investiu|experiência|obras|gerido|remodelação)/i.test(text) ? 4
    : /(fundos|ações|depósitos)/i.test(text) ? 3 : /(primeira vez|nunca)/i.test(text) ? 1 : 2
  const sc_c3 = /(alinhado|aceito|modelo|parceria|longo prazo)/i.test(text) ? 4
    : /(dúvida|mas|condição|à minha maneira)/i.test(text) ? 2 : 3
  const sc_c4 = /(documento|BI|IBAN|coerente|origem)/i.test(text) ? 4
    : /(inconsist|recusa|litígio)/i.test(text) ? 2 : 3
  const sc_c5 = /(pronto|amanhã|imediato|reservado)/i.test(text) ? 5
    : /(60 dias|90 dias|talvez)/i.test(text) ? 2
    : /(30 dias|breve|próximo mês)/i.test(text) ? 4 : 3

  return {
    investidor_dados: {
      capital_min,
      capital_max,
      estrategia: estrategia.length > 0 ? estrategia : null,
      perfil_risco,
      tipo_investidor: tipo_investidor.length > 0 ? tipo_investidor : null,
      experiencia_imobiliario: null,
      motivacao: null,
      objecoes: null,
      profissao: null,
      localizacao: null,
    },
    resumo_executivo: resumo || `Reunião com ${reuniao.titulo} realizada a ${new Date(reuniao.data).toLocaleDateString('pt-PT')} com duração de ${reuniao.duracao_min} minutos.`,
    pontos_chave,
    proximos_passos: actionItems.length > 0 ? actionItems : ['Enviar follow-up por email dentro de 48 horas com resumo da reunião'],
    sugestoes_melhoria: sugestoes.slice(0, 5),
    classificacao_sugerida: classificacao,
    probabilidade_investimento: score,
    notas_adicionais: null,
    scorecard: {
      tipo_investidor: tipoInv,
      c1_score: sc_c1, c1_notas: `Capital detectado: ${capital_max ? '€' + capital_max.toLocaleString() : 'não mencionado'}`,
      c2_score: sc_c2, c2_notas: 'Avaliação por padrões de texto — validar manualmente',
      c3_score: sc_c3, c3_notas: 'Avaliação por padrões de texto — validar manualmente',
      c4_score: sc_c4, c4_notas: 'Avaliação por padrões de texto — validar manualmente',
      c5_score: sc_c5, c5_notas: 'Avaliação por padrões de texto — validar manualmente',
    },
  }
}

/**
 * Auto-preenche campos do investidor com dados extraídos da reunião
 */
export async function autoFillInvestidor(reuniaoId) {
  const analise = await analyzeReuniao(reuniaoId)
  if (analise.error) return analise

  // Buscar a reunião para saber o investidor
  const { rows: [reuniao] } = await pool.query('SELECT * FROM reunioes WHERE id = $1', [reuniaoId])
  if (!reuniao?.entidade_id || reuniao.entidade_tipo !== 'investidores') {
    return { ...analise, autoFilled: false, reason: 'Reunião não ligada a investidor' }
  }

  const { rows: [inv] } = await pool.query('SELECT * FROM investidores WHERE id = $1', [reuniao.entidade_id])
  if (!inv) return { ...analise, autoFilled: false, reason: 'Investidor não encontrado' }

  // Só preencher campos que estão vazios
  const updates = {}
  const dados = analise.investidor_dados

  if (!inv.capital_min && dados.capital_min) updates.capital_min = dados.capital_min
  if (!inv.capital_max && dados.capital_max) updates.capital_max = dados.capital_max
  if (!inv.perfil_risco && dados.perfil_risco) updates.perfil_risco = dados.perfil_risco
  if (!inv.estrategia && dados.estrategia?.length) updates.estrategia = JSON.stringify(dados.estrategia)
  if (!inv.tipo_investidor && dados.tipo_investidor?.length) updates.tipo_investidor = JSON.stringify(dados.tipo_investidor)
  if (!inv.classificacao && analise.classificacao_sugerida) updates.classificacao = analise.classificacao_sugerida

  // Adicionar notas da reunião
  const notaReuniao = `[${reuniao.data?.slice(0, 10)}] ${analise.resumo_executivo}`
  if (inv.notas) {
    if (!inv.notas.includes(notaReuniao.slice(0, 30))) {
      updates.notas = inv.notas + '\n\n' + notaReuniao
    }
  } else {
    updates.notas = notaReuniao
  }

  if (Object.keys(updates).length > 0) {
    const sets = Object.entries(updates).map(([k], i) => `${k} = $${i + 1}`)
    sets.push(`updated_at = $${Object.keys(updates).length + 1}`)
    const params = [...Object.values(updates), new Date().toISOString(), inv.id]
    await pool.query(
      `UPDATE investidores SET ${sets.join(', ')} WHERE id = $${params.length}`,
      params
    )
  }

  // Auto-criar scorecard se a análise incluir dados de scorecard
  let scorecardCreated = false
  if (analise.scorecard) {
    try {
      const sc = analise.scorecard
      const tipo = sc.tipo_investidor || 'Passivo'
      const c1 = Math.max(1, Math.min(5, +sc.c1_score || 3))
      const c2 = Math.max(1, Math.min(5, +sc.c2_score || 3))
      const c3 = Math.max(1, Math.min(5, +sc.c3_score || 3))
      const c4 = Math.max(1, Math.min(5, +sc.c4_score || 3))
      const c5 = Math.max(1, Math.min(5, +sc.c5_score || 3))

      // Pesos SOP 2
      const pesos = tipo === 'Ativo'
        ? { c1: 0.25, c2: 0.30, c3: 0.20, c4: 0.15, c5: 0.10 }
        : { c1: 0.20, c2: 0.10, c3: 0.30, c4: 0.20, c5: 0.20 }

      const total = c1 + c2 + c3 + c4 + c5
      const ponderado = Math.round((c1 * pesos.c1 + c2 * pesos.c2 + c3 * pesos.c3 + c4 * pesos.c4 + c5 * pesos.c5) * 20 * 100) / 100
      const classificacao = ponderado >= 88 ? 'A' : ponderado >= 72 ? 'B' : ponderado >= 56 ? 'C' : 'D'

      const { randomUUID } = await import('crypto')
      const scId = randomUUID()
      const now = new Date().toISOString()

      await pool.query(
        `INSERT INTO scorecards (id, investidor_id, reuniao_id, tipo_investidor,
          c1_score, c2_score, c3_score, c4_score, c5_score,
          c1_notas, c2_notas, c3_notas, c4_notas, c5_notas,
          pontuacao_total, pontuacao_ponderada, classificacao,
          avaliador, fonte, created_at, updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$20)`,
        [scId, inv.id, reuniaoId, tipo,
          c1, c2, c3, c4, c5,
          sc.c1_notas || null, sc.c2_notas || null, sc.c3_notas || null, sc.c4_notas || null, sc.c5_notas || null,
          total, ponderado, classificacao,
          'Claude AI', 'transcricao_automatica', now]
      )

      // Atualizar investidor com classificação do scorecard
      await pool.query(
        'UPDATE investidores SET classificacao = $1, pontuacao = $2, updated_at = $3 WHERE id = $4',
        [classificacao, ponderado, now, inv.id]
      )

      // Registar no histórico
      await pool.query(
        `INSERT INTO classificacao_historico (id, investidor_id, classificacao_anterior, classificacao_nova,
          pontuacao_anterior, pontuacao_nova, motivo, tipo, scorecard_id, created_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
        [randomUUID(), inv.id, inv.classificacao || null, classificacao,
          inv.pontuacao || 0, ponderado, 'Scorecard automático via transcrição de reunião', 'transcricao_automatica', scId, now]
      )

      scorecardCreated = true
    } catch (scErr) {
      console.error('[meetingAnalysis] Erro ao criar scorecard automático:', scErr.message)
    }
  }

  // Persistir análise completa na reunião (para cache e sistema de alertas)
  try {
    await pool.query(
      'UPDATE reunioes SET analise_completa = $1, analise_vista = false, updated_at = $2 WHERE id = $3',
      [JSON.stringify(analise), new Date().toISOString(), reuniaoId]
    )
  } catch (e) {
    console.warn('[meetingAnalysis] Erro ao persistir analise_completa (investidor):', e.message)
  }

  return {
    ...analise,
    autoFilled: true,
    scorecardCreated,
    fieldsUpdated: Object.keys(updates),
    investidor_id: inv.id,
    investidor_nome: inv.nome,
  }
}

/**
 * Análise focada em consultor imobiliário (parceiro Somnium).
 * Não usa scorecard 5C (esse é para investidores). Foca em qualidade de lead,
 * disponibilidade e alinhamento estratégico para parceria.
 */
async function analyzeConsultorWithClaude(reuniao, transcricao, resumo) {
  const Anthropic = (await import('@anthropic-ai/sdk')).default
  const client = new Anthropic({ apiKey: ANTHROPIC_KEY })

  const message = await client.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 2000,
    messages: [{
      role: 'user',
      content: `Analisa esta transcrição de uma reunião com um consultor imobiliário (potencial parceiro da Somnium Properties, empresa de investimento imobiliário em Coimbra).

TÍTULO: ${reuniao.titulo}
DATA: ${reuniao.data}
RESUMO FIREFLIES: ${resumo}

TRANSCRIÇÃO:
${transcricao.slice(0, 8000)}

Responde APENAS em JSON válido com esta estrutura:
{
  "consultor_dados": {
    "imobiliaria": null ou nome da imobiliária mencionada,
    "zonas": null ou texto com zonas de actuação (ex: "Coimbra, Figueira da Foz"),
    "tipo_imoveis": null ou texto (ex: "T2/T3 urbano", "rústicos", "comercial"),
    "equipa_remax": null ou nome da equipa se mencionada,
    "imoveis_estimados_mes": null ou número aproximado de leads/imóveis por mês,
    "interesse_parceria": null ou "Alto" ou "Médio" ou "Baixo",
    "objecoes": null ou texto breve com receios/objeções,
    "data_proximo_followup": null ou data ISO (YYYY-MM-DD) se houver compromisso explícito,
    "motivo_followup": null ou texto breve
  },
  "resumo_executivo": "2-3 frases resumindo a reunião",
  "pontos_chave": ["ponto 1", "ponto 2", ...],
  "proximos_passos": ["passo 1", "passo 2", ...],
  "sugestoes_melhoria": [
    "sugestão concreta para melhorar a abordagem comercial ao consultor",
    "sugestão sobre técnica de qualificação ou comunicação"
  ],
  "qualidade_lead": "Alta" ou "Média" ou "Baixa",
  "classificacao_sugerida": "A" ou "B" ou "C" ou "D",
  "scorecard_consultor": {
    "qualidade_lead_score": 1 a 5 (volume e qualidade dos imóveis que consegue trazer),
    "qualidade_lead_notas": "justificação breve",
    "disponibilidade_score": 1 a 5 (timing decisão, frequência contacto, agenda livre),
    "disponibilidade_notas": "justificação breve",
    "alinhamento_score": 1 a 5 (aceita modelo Somnium, comissões, exclusividade),
    "alinhamento_notas": "justificação breve"
  },
  "notas_adicionais": "informação relevante adicional"
}`
    }]
  })

  try {
    const text = message.content[0].text
    const jsonMatch = text.match(/\{[\s\S]*\}/)
    return JSON.parse(jsonMatch[0])
  } catch {
    return { error: 'Erro ao processar resposta da AI', raw: message.content[0].text }
  }
}

/**
 * Auto-preenche campos do consultor com dados extraídos da reunião.
 * Espelha autoFillInvestidor mas para a tabela consultores.
 */
export async function autoFillConsultor(reuniaoId) {
  const { rows: [reuniao] } = await pool.query('SELECT * FROM reunioes WHERE id = $1', [reuniaoId])
  if (!reuniao) throw new Error('Reunião não encontrada')
  if (!reuniao.entidade_id || reuniao.entidade_tipo !== 'consultores') {
    return { autoFilled: false, reason: 'Reunião não ligada a consultor' }
  }

  const { rows: [cons] } = await pool.query('SELECT * FROM consultores WHERE id = $1', [reuniao.entidade_id])
  if (!cons) return { autoFilled: false, reason: 'Consultor não encontrado' }

  const transcricao = reuniao.transcricao || ''
  const resumo = reuniao.resumo || ''

  const analise = ANTHROPIC_KEY
    ? await analyzeConsultorWithClaude(reuniao, transcricao, resumo)
    : { error: 'ANTHROPIC_API_KEY não configurada' }

  if (analise.error) {
    return { ...analise, autoFilled: false }
  }

  const updates = {}
  const dados = analise.consultor_dados || {}

  if (!cons.imobiliaria && dados.imobiliaria) updates.imobiliaria = dados.imobiliaria
  if (!cons.zonas && dados.zonas) updates.zonas = dados.zonas
  if (!cons.equipa_remax && dados.equipa_remax) updates.equipa_remax = dados.equipa_remax
  if (!cons.classificacao && analise.classificacao_sugerida) updates.classificacao = analise.classificacao_sugerida

  if (dados.data_proximo_followup) {
    const proximaData = new Date(dados.data_proximo_followup)
    const proximaCons = cons.data_proximo_follow_up ? new Date(cons.data_proximo_follow_up) : null
    if (!proximaCons || proximaData > proximaCons) {
      updates.data_proximo_follow_up = dados.data_proximo_followup
      if (dados.motivo_followup) updates.motivo_follow_up = dados.motivo_followup
    }
  }

  // Adicionar nota da reunião
  const notaReuniao = `[${reuniao.data?.slice(0, 10)}] ${analise.resumo_executivo || 'Reunião analisada por AI'}`
  if (cons.notas) {
    if (!cons.notas.includes(notaReuniao.slice(0, 30))) {
      updates.notas = cons.notas + '\n\n' + notaReuniao
    }
  } else {
    updates.notas = notaReuniao
  }

  if (Object.keys(updates).length > 0) {
    const sets = Object.entries(updates).map(([k], i) => `${k} = $${i + 1}`)
    sets.push(`updated_at = $${Object.keys(updates).length + 1}`)
    const params = [...Object.values(updates), new Date().toISOString(), cons.id]
    await pool.query(
      `UPDATE consultores SET ${sets.join(', ')} WHERE id = $${params.length}`,
      params
    )
  }

  // Persistir análise completa na reunião (cache + alerta)
  try {
    await pool.query(
      'UPDATE reunioes SET analise_completa = $1, analise_vista = false, updated_at = $2 WHERE id = $3',
      [JSON.stringify(analise), new Date().toISOString(), reuniaoId]
    )
  } catch (e) {
    console.warn('[meetingAnalysis] Erro ao persistir analise_completa (consultor):', e.message)
  }

  return {
    ...analise,
    autoFilled: true,
    fieldsUpdated: Object.keys(updates),
    consultor_id: cons.id,
    consultor_nome: cons.nome,
  }
}
