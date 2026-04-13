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

  // Sugestões baseadas em padrões
  const sugestoes = []
  if (!/(quanto|capital|dinheiro|valor|investir|montante)/i.test(text))
    sugestoes.push('Perguntar diretamente sobre o capital disponível para investimento — não foi abordado nesta reunião.')
  if (!/(prazo|horizonte|quando|urgência|tempo)/i.test(text))
    sugestoes.push('Definir o horizonte temporal do investidor — curto, médio ou longo prazo.')
  if (!/(risco|segur|garant)/i.test(text))
    sugestoes.push('Explorar o perfil de risco do investidor — quão confortável está com incerteza.')
  if (!/(experiência|já investiu|outros investimentos)/i.test(text))
    sugestoes.push('Perguntar sobre experiência prévia em investimento imobiliário.')
  if (!/(próximo|follow|quando|marcar|agenda)/i.test(text))
    sugestoes.push('Definir próximos passos concretos e data de follow-up no final da reunião.')
  if (!/(obje[çc][ãa]|preocupa|receio|dúvida|mas )/i.test(text))
    sugestoes.push('Explorar objeções e preocupações — essencial para avançar o processo.')
  if (sugestoes.length === 0)
    sugestoes.push('Reunião bem conduzida. Manter o follow-up dentro de 48h.')

  // Pontos-chave do resumo Fireflies
  const pontos_chave = []
  if (reuniao.keywords) pontos_chave.push(...reuniao.keywords.split(',').map(k => k.trim()).filter(Boolean).slice(0, 5))
  if (reuniao.action_items) pontos_chave.push(...reuniao.action_items.split('\n').filter(Boolean).slice(0, 3))

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
    resumo_executivo: resumo || `Reunião com ${reuniao.titulo} em ${reuniao.data?.slice(0, 10)}. Duração: ${reuniao.duracao_min} minutos.`,
    pontos_chave,
    proximos_passos: reuniao.action_items ? reuniao.action_items.split('\n').filter(Boolean) : ['Fazer follow-up dentro de 48h'],
    sugestoes_melhoria: sugestoes,
    classificacao_sugerida: capital_max > 100000 ? 'A' : capital_max > 30000 ? 'B' : 'C',
    probabilidade_investimento: capital_max ? 50 : 30,
    notas_adicionais: null,
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

  return {
    ...analise,
    autoFilled: true,
    fieldsUpdated: Object.keys(updates),
    investidor_id: inv.id,
    investidor_nome: inv.nome,
  }
}
