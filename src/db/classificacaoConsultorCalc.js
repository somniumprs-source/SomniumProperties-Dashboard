/**
 * Classificação de consultores (spec v1, nov 2026): parâmetros iniciais,
 * critérios C1–C5 e cálculo puro da classe. Sem BD nem rede, para ser usado
 * igual no servidor e nos ecrãs (ficha, revisão pós-chamada).
 *
 * Gémeo Deno em supabase/functions/_shared/classificacaoConsultorCalc.ts — o
 * código é o mesmo. Portar qualquer alteração para os dois.
 *
 * Os números são parâmetros iniciais do piloto, configuráveis em
 * parametros_classificacao — não padrões do setor.
 */

export const CRITERIOS = [
  {
    chave: 'C1', label: 'Originação de oportunidades viáveis',
    mede: 'Frequência e qualidade de oportunidades dentro dos critérios; acesso direto ao proprietário; off-market/pré-mercado; negociação dentro das margens.',
    naoMede: 'Capacidade de vender (C2); cumprimento de prazos (C3).',
    ancoras: {
      1: 'Não tem oportunidades nas zonas/tipologias, ou só reenvia anúncios sem análise e sem acesso ao proprietário.',
      3: 'Exemplos concretos recentes dentro dos critérios, sobretudo publicados; acesso ao proprietário em parte.',
      5: 'Envia com regularidade oportunidades qualificadas, parte off-market, com acesso direto ao proprietário e informação mínima completa.',
    },
  },
  {
    chave: 'C2', label: 'Capacidade de comercialização',
    mede: 'Vendas recentes comparáveis; carteira de compradores; plano comercial; qualidade de marketing.',
    naoMede: 'Angariação de imóveis para compra (C1).',
    ancoras: {
      1: 'Sem vendas recentes verificáveis na zona; sem compradores.',
      3: 'Vendas recentes na zona; compradores com exemplos; plano genérico.',
      5: 'Vendas verificáveis de imóveis remodelados ou semelhantes; plano concreto (preço, canais, prazos) cumprido numa operação Somnium.',
    },
  },
  {
    chave: 'C3', label: 'Fiabilidade e execução',
    mede: 'Cumpre o que combina, nos prazos; informação correta e completa; responde.',
    naoMede: 'Iniciativa extra na operação (C5).',
    ancoras: {
      1: 'Falha prazos, dá informação errada ou omissa, não responde.',
      3: 'Cumpre a maioria dos compromissos, com atrasos pontuais; informação com lacunas.',
      5: 'Cumpre todos os prazos acordados, informação completa à primeira, avisa antes de falhar.',
    },
  },
  {
    chave: 'C4', label: 'Adequação à estratégia Somnium',
    mede: 'Atua nas zonas e tipologias-alvo; percebe Fix and Flip, Wholesaling e margens; aceita triagem rigorosa.',
    naoMede: 'Encaixe das oportunidades enviadas (C1).',
    ancoras: {
      1: 'Atua fora das zonas ou tipologias, ou não aceita o modelo e as margens.',
      3: 'Atua em parte das zonas; percebe o modelo depois de explicado.',
      5: 'Atua nas zonas e tipologias-alvo, percebe as margens e filtra antes de enviar.',
    },
  },
  {
    chave: 'C5', label: 'Colaboração ao longo da operação',
    mede: 'Apoio na negociação, visitas, documentação e escritura; feedback de mercado; compradores e investidores apresentados.',
    naoMede: 'Cumprir o mínimo combinado (C3).',
    ancoras: {
      1: 'Desaparece depois de enviar a lead.',
      3: 'Acompanha visitas e responde quando lhe pedem.',
      5: 'Apoia ativamente a negociação e o processo até à escritura; dá feedback de mercado.',
    },
  },
]
export const CHAVES = CRITERIOS.map(c => c.chave)

export const ETAPAS = { cold_call: 'Cold call', discovery: 'Discovery', acompanhamento: 'Acompanhamento' }
export const TIPOS_EVIDENCIA = { declaracao: 'Declaração', exemplo: 'Exemplo concreto', observada: 'Evidência observada' }
export const VALIDACOES = ['Por validar', 'Em teste', 'Validado']
export const ESTADOS_RELACAO = ['Ativo', 'Acompanhamento pontual', 'Inativo', 'Encerrado']
export const ESTATUTOS = ['Cold Call', 'Discovery Call', 'Follow Up', 'Parceria']
export const CAUSAS_PERDA = { consultor: 'Consultor', somnium: 'Somnium', investidor: 'Investidor', proprietario: 'Proprietário', mercado: 'Mercado', terceiros: 'Terceiros' }
export const CONSENTIMENTO_MODOS = { verbal_gravado: 'Verbal, no início da gravação', escrito: 'Por escrito' }

// Zonas-alvo do pedido v1.0: Coimbra, Condeixa, Miranda do Corvo, Mealhada,
// Lousã e os 17 municípios da Área Metropolitana do Porto. Editável.
const CONCELHOS_AMP = [
  'Arouca', 'Espinho', 'Gondomar', 'Maia', 'Matosinhos', 'Oliveira de Azeméis', 'Paredes', 'Porto',
  'Póvoa de Varzim', 'Santa Maria da Feira', 'Santo Tirso', 'São João da Madeira', 'Trofa',
  'Vale de Cambra', 'Valongo', 'Vila do Conde', 'Vila Nova de Gaia',
]

export const PARAMETROS_PADRAO = {
  pesos: { C1: 35, C2: 20, C3: 20, C4: 15, C5: 10 },
  cortes: { A: 75, B: 55, C: 35 },
  cobertura_minima: 70,
  regras: { A: { C1: 4, C3: 4, todos: true }, B: { C1: 3 } },
  tetos: { declaracao: 3, exemplo: 4, observada: 5 },
  limiares: { preco_max: 300000, roi_min: 20, roi_anualizado_min: 30, wholesaling_min: 5000 },
  concelhos_alvo: ['Coimbra', 'Condeixa-a-Nova', 'Miranda do Corvo', 'Mealhada', 'Lousã', ...CONCELHOS_AMP],
  concelhos_lentos: [],
  cadencias: { A: 14, B: 30, C: 90, D: null, Pendente: 14 },
  prazo_analise: { A: '48 h', B: '3 dias úteis', C: 'Depois de A e B', D: 'Só se passar a triagem' },
  inativo_dias: 60,
  adequacao_min: 30,
  amostra_minima: 5,
  compromissos_falhados_max: 2,
  teste_execucao_dias_uteis: 5,
  conservacao: { audio_dias: 90, transcricao_meses_apos_fim: 12 },
  modelos: { cold_call: 'claude-sonnet-5-5', discovery: 'claude-opus-5-5', acompanhamento: 'claude-opus-5-5', pontuacao: 'claude-opus-5-5' },
}

// Guiões da cold call e da discovery (spec v1, secção 2). A discovery serve
// também de base ao acompanhamento.
export const GUIOES = {
  cold_call: {
    titulo: 'Cold call (10–15 min, sem classe)',
    abertura: 'Olá [nome], fala [associado], da Somnium Properties. Compramos imóveis para remodelar e revender, e para cedência de posição, em [zona]. Procuro dois ou três consultores com quem trabalhar de perto. Tem cinco minutos? Antes de mais: posso gravar a chamada, só para uso interno?',
    perguntas: [
      'Em que concelhos e tipos de imóveis faz mais angariação?',
      'Costuma apresentar imóveis antes de os publicar? Qual foi o exemplo mais recente?',
      'Nos últimos meses, teve imóveis para obra até 300 mil euros? Consegue falar diretamente com o proprietário?',
      'Quando vende, como trabalha a comercialização? Que venda recente lhe correu melhor?',
    ],
    decisao: [
      ['Avançar para discovery', 'Atua nas zonas e deu pelo menos um exemplo concreto nas perguntas 2 ou 3.'],
      ['Follow-up com data', 'Atua nas zonas, sem exemplos ou sem tempo agora.'],
      ['Descartar', 'Atua só fora das zonas, ou não trabalha imóveis com obra.'],
    ],
    fecho: 'Faz sentido conversarmos 40 minutos com calma sobre como trabalhamos? Pode ser [dia] às [hora]? (Em follow-up: envio-lhe hoje os nossos critérios e volto a ligar a [data].)',
  },
  discovery: {
    titulo: 'Discovery (40–45 min + 20 min de revisão)',
    abertura: 'Regra: perguntar por casos passados, nunca por opiniões. “Como faria?” dá uma declaração; “como fez da última vez?” dá um exemplo. Confirmar logo no início que a chamada pode ser gravada.',
    perguntas: [
      'C1 · Fale-me dos últimos três imóveis para obra que angariou. Como chegou ao proprietário? Esteve publicado? Por quanto fechou?',
      'C2 · Qual foi a última venda de um imóvel remodelado que fez? Em quanto tempo e a que preço face ao pedido? Quem comprou?',
      'C3 · Da última vez que um investidor lhe pediu documentos, quanto tempo demorou? Já teve de corrigir informação de um imóvel? O que fez?',
      'C4 · Com que investidores trabalha hoje e o que lhes envia? Um imóvel a 250 mil que precisa de 80 mil de obra: enviava-nos? Porquê?',
      'C5 · Conte-me uma negociação em que ajudou o comprador a fechar. Esteve nas visitas? E até à escritura?',
      'Proposta (só no fim): comissão de comercialização 4% + IVA, até 5% + IVA com boa margem; preferência de comercialização condicionada a plano comercial, qualidade e cumprimento.',
      'Teste de execução: envio hoje os critérios por escrito; responde até [data, 5 dias úteis] com os imóveis da carteira que encaixam, mesmo que seja nenhum?',
    ],
    decisao: [],
    fecho: 'A aceitação verbal da proposta fica registada, mas não dá pontos. O teste de execução mede C3 pela resposta no prazo.',
  },
}

// Junta os parâmetros guardados aos padrão (chaves novas ganham o padrão).
export function comPadrao(valores) {
  const v = valores || {}
  const out = { ...PARAMETROS_PADRAO, ...v }
  for (const k of ['pesos', 'cortes', 'regras', 'tetos', 'limiares', 'cadencias', 'prazo_analise', 'conservacao', 'modelos']) {
    out[k] = { ...PARAMETROS_PADRAO[k], ...(v[k] || {}) }
  }
  return out
}

const eNota = n => Number.isInteger(n) && n >= 1 && n <= 5

// Nota máxima pelo tipo de evidência mais forte (declaração 3, exemplo 4,
// observada 5). Sem evidência não há nota: fica "por verificar".
export function tetoDaEvidencia(evidencias, params = PARAMETROS_PADRAO) {
  const tetos = (params.tetos || PARAMETROS_PADRAO.tetos)
  const valores = (evidencias || []).map(e => tetos[e?.tipo]).filter(n => Number.isFinite(n))
  return valores.length ? Math.max(...valores) : null
}

export function aplicarTeto(nota, evidencias, params) {
  if (!eNota(nota)) return null
  const teto = tetoDaEvidencia(evidencias, params)
  return teto == null ? null : Math.min(nota, teto)
}

/**
 * Classe a partir das notas por critério.
 * notas: { C1: 1-5|null, ... } (null/ausente = por verificar ou não avaliado)
 * bloqueios: alertas bloqueantes ativos (texto) — classe máxima D.
 * Pontuação = média ponderada dos critérios avaliados, normalizada 0–100
 * ((nota − 1) / 4 × 100); cobertura = soma dos pesos avaliados.
 */
export function calcularClasse(notas, params = PARAMETROS_PADRAO, bloqueios = []) {
  const p = comPadrao(params)
  const pesoTotal = CHAVES.reduce((s, k) => s + (Number(p.pesos[k]) || 0), 0) || 100
  const avaliados = CHAVES.filter(k => eNota(notas?.[k]))
  const somaPesos = avaliados.reduce((s, k) => s + (Number(p.pesos[k]) || 0), 0)
  const cobertura = Math.round(somaPesos / pesoTotal * 1000) / 10
  const pontuacao = somaPesos
    ? Math.round(avaliados.reduce((s, k) => s + (Number(p.pesos[k]) || 0) * (notas[k] - 1) / 4 * 100, 0) / somaPesos * 10) / 10
    : null
  const regrasAplicadas = []

  const bloqueiosAtivos = [...(bloqueios || [])]
  if (notas?.C1 === 1) bloqueiosAtivos.push('C1 = 1: incapacidade de originar demonstrada')

  if (!eNota(notas?.C1) || cobertura < p.cobertura_minima) {
    if (bloqueiosAtivos.length) return { pontuacao, cobertura, classe: 'D', classe_por_corte: null, regras: ['Alerta bloqueante: classe máxima D'], bloqueios: bloqueiosAtivos }
    const falta = !eNota(notas?.C1) ? 'C1 por verificar' : `cobertura ${cobertura}% < ${p.cobertura_minima}%`
    return { pontuacao, cobertura, classe: 'Pendente', classe_por_corte: null, regras: [`Pendente: ${falta}`], bloqueios: [] }
  }

  const porCorte = pontuacao >= p.cortes.A ? 'A' : pontuacao >= p.cortes.B ? 'B' : pontuacao >= p.cortes.C ? 'C' : 'D'
  let classe = porCorte
  const cumpre = (c) => {
    const r = p.regras[c]
    if (!r) return true
    if (r.todos && avaliados.length < CHAVES.length) return false
    return CHAVES.every(k => r[k] == null || (eNota(notas[k]) && notas[k] >= r[k]))
  }
  const ordem = ['A', 'B', 'C', 'D']
  while (classe !== 'D' && !cumpre(classe)) {
    const r = p.regras[classe]
    const partes = [r.C1 && `C1 ≥ ${r.C1}`, r.C3 && `C3 ≥ ${r.C3}`, r.todos && 'os 5 avaliados'].filter(Boolean).join(', ')
    regrasAplicadas.push(`${classe} exige ${partes}`)
    classe = ordem[ordem.indexOf(classe) + 1]
  }
  if (bloqueiosAtivos.length && classe !== 'D') {
    regrasAplicadas.push('Alerta bloqueante: classe máxima D')
    classe = 'D'
  }
  return { pontuacao, cobertura, classe, classe_por_corte: porCorte, regras: regrasAplicadas, bloqueios: bloqueiosAtivos }
}

const normaliza = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()

/**
 * Qualificação automática de uma oportunidade (imóvel) pelos campos que o
 * CRM tem. Interlocutor acessível e necessidade de licenciamento não estão em
 * campos: o associado corrige à mão (qualificacao_manual).
 * Devolve { qualificada: true|false|null, motivos: [] } — null = falta informação.
 */
export function qualificarImovel(im, params = PARAMETROS_PADRAO) {
  const p = comPadrao(params)
  const falhas = []
  const faltas = []
  const alvo = (p.concelhos_alvo || []).map(normaliza)
  const lentos = (p.concelhos_lentos || []).map(normaliza)
  const concelho = normaliza(im?.concelho)
  const zonaTxt = normaliza([im?.zona, im?.zonas].filter(Boolean).join(' '))
  if (concelho) {
    if (!alvo.includes(concelho)) falhas.push(`Concelho fora das zonas-alvo (${im.concelho})`)
    else if (lentos.includes(concelho)) faltas.push('Concelho com licenciamento lento: confirmar se precisa de projeto')
  } else if (zonaTxt) {
    if (!alvo.some(c => zonaTxt.includes(c))) faltas.push('Concelho por indicar')
  } else faltas.push('Localização por indicar')

  const tip = normaliza([im?.tipologia, im?.predio_tipo].filter(Boolean).join(' '))
  if (/loja|terreno|armazem|escritorio|garagem|lote/.test(tip)) falhas.push(`Tipologia fora dos critérios (${im.tipologia || im.predio_tipo})`)

  const preco = Number(im?.ask_price) || 0
  if (!preco) faltas.push('Preço por indicar')
  else if (preco > p.limiares.preco_max) falhas.push(`Preço acima de ${p.limiares.preco_max.toLocaleString('pt-PT')} €`)

  // Estado de obra: custo_estimado_obra tem 0 por defeito na BD, por isso não
  // distingue "sem obra" de "por preencher" — fica para a correção manual.

  const temArea = Number(im?.area_bruta) > 0 || Number(im?.area_util) > 0
  let temFotos = false
  try { temFotos = (typeof im?.fotos === 'string' ? JSON.parse(im.fotos || '[]') : (im?.fotos || [])).length > 0 } catch { temFotos = false }
  if (!temArea) faltas.push('Área por indicar')
  if (!temFotos && !im?.link) faltas.push('Sem fotografias nem link')

  if (falhas.length) return { qualificada: false, motivos: [...falhas, ...faltas] }
  if (faltas.length) return { qualificada: null, motivos: faltas }
  return { qualificada: true, motivos: [] }
}

// Data + n dias (AAAA-MM-DD), a contar de hoje.
export function diasDepois(n, base = new Date()) {
  const d = new Date(base)
  d.setDate(d.getDate() + n)
  return d.toISOString().slice(0, 10)
}

// Taxa só com amostra suficiente: mostra sempre o n ao lado.
export function taxa(a, b, minimo = PARAMETROS_PADRAO.amostra_minima) {
  if (!b) return { valor: null, n: 0, insuficiente: true }
  return { valor: Math.round(a / b * 100), n: b, insuficiente: b < minimo }
}
