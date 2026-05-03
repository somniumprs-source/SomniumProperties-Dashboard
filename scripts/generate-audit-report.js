/**
 * Auditoria multi-perfil dos 13 relatórios PDF do sistema Somnium.
 * Cada renderer auditado adoptando o perfil profissional do consumidor primário.
 * Output: /tmp/auditoria-relatorios-somnium.pdf
 */
import PDFDocument from 'pdfkit'
import { readFileSync, createWriteStream } from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')
const LOGO = path.resolve(ROOT, 'public/logo-dark.png')
const OUT = '/tmp/auditoria-relatorios-somnium.pdf'

const C = {
  gold: '#C9A84C', dark: '#0d0d0d', white: '#ffffff',
  body: '#2a2a2a', muted: '#888888', border: '#e0ddd5',
  light: '#f0efe9', soft: '#faf9f5',
  green: '#2d6a2d', red: '#8b2020', amber: '#b87a1f', blue: '#2c5282',
  tier1: '#8b2020', tier2: '#b87a1f', tier3: '#2c5282', tier4: '#888888',
}
const ML = 50, MR = 50, PW = 595.28, PH = 841.89, CW = PW - ML - MR
const NOW = () => new Date().toLocaleDateString('pt-PT', { day: '2-digit', month: 'long', year: 'numeric' })

const doc = new PDFDocument({ size: 'A4', margin: 0, autoFirstPage: false, bufferPages: true })
doc.pipe(createWriteStream(OUT))

const state = { page: 0, total: 18 }

function newPage(opts = {}) {
  doc.addPage({ size: 'A4', margin: 0 })
  state.page++
  if (opts.cover) return
  try { doc.image(readFileSync(LOGO), ML, 18, { height: 16 }) } catch {}
  T(7, C.muted, `Auditoria PDFs Somnium · pág. ${state.page}/${state.total}`, ML, 22, CW, { align: 'right' })
  doc.rect(ML, 42, CW, 1).fill(C.gold)
  doc.rect(ML, PH - 42, CW, 0.4).fill(C.gold)
  T(6.5, C.muted, `Confidencial · Somnium Properties · Gerado em ${NOW()}`, ML, PH - 35, CW, { align: 'center' })
}

const T = (size, color, text, x, y, w, opts = {}) =>
  doc.fontSize(size).fillColor(color).text(text, x, y, { width: w, lineBreak: false, ...opts })

function header(y, title, subtitle) {
  T(13, C.body, title.toUpperCase(), ML, y, CW, { characterSpacing: 0.5 })
  y += 17
  doc.rect(ML, y, CW, 1).fill(C.gold)
  y += 7
  if (subtitle) {
    T(8.5, C.muted, subtitle, ML, y, CW)
    y += 12
  }
  return y
}

function tierBadge(y, tier, x = ML) {
  const colors = [null, C.tier1, C.tier2, C.tier3, C.tier4]
  const labels = [null, 'TIER 1 — CRÍTICO', 'TIER 2 — IMPORTANTE', 'TIER 3 — POLISH', 'TIER 4 — ANALÍTICO']
  const color = colors[tier]
  const label = labels[tier]
  doc.roundedRect(x, y, 130, 16, 2).fill(color)
  T(7, C.white, label, x + 6, y + 4, 130, { characterSpacing: 0.8 })
  return y + 16
}

function profileBox(y, profession, context) {
  doc.roundedRect(ML, y, CW, 38, 4).fill(C.soft)
  doc.rect(ML, y, 3, 38).fill(C.gold)
  T(7, C.gold, 'PERFIL ADOPTADO', ML + 12, y + 5, CW - 12, { characterSpacing: 1 })
  T(9.5, C.body, profession, ML + 12, y + 16, CW - 24)
  doc.fontSize(7.5).fillColor(C.muted).text(context, ML + 12, y + 28, { width: CW - 24, lineGap: 1, lineBreak: true, height: 8 })
  return y + 46
}

function bulletBlock(y, title, items, bulletColor = C.gold) {
  T(8, C.body, title.toUpperCase(), ML, y, CW, { characterSpacing: 1 })
  y += 11
  doc.rect(ML, y, CW, 0.4).fill(C.border)
  y += 5
  items.forEach(it => {
    T(8, bulletColor, '▸', ML, y, 10)
    doc.fontSize(8).fillColor(C.body).text(it, ML + 14, y, { width: CW - 14, lineGap: 1.5 })
    y = doc.y + 3
  })
  return y + 4
}

function actionsBlock(y, items) {
  doc.roundedRect(ML, y, CW, 4 + items.length * 16 + 6, 3).fill(C.dark)
  T(7, C.gold, 'TOP 3 ACÇÕES PRIORIZADAS', ML + 10, y + 5, CW - 20, { characterSpacing: 1 })
  y += 18
  items.forEach((it, i) => {
    doc.circle(ML + 16, y + 5, 6).fill(C.gold)
    T(7.5, C.dark, String(i + 1), ML + 13, y + 2, 10, { align: 'center' })
    T(8, C.white, it, ML + 30, y + 1, CW - 40)
    y += 16
  })
  return y + 8
}

// ═══════════════════════════════════════════════════════════════════
// PÁG 1 — CAPA
// ═══════════════════════════════════════════════════════════════════
newPage({ cover: true })
doc.rect(0, 0, PW, 6).fill(C.dark)
try { doc.image(readFileSync(LOGO), (PW - 130) / 2, 90, { width: 130 }) } catch {}
T(8, C.muted, 'SOMNIUM PROPERTIES', ML, 200, CW, { align: 'center', characterSpacing: 2.5 })
T(8, C.muted, 'Auditoria Interna de Documentos PDF', ML, 214, CW, { align: 'center' })

doc.rect(ML + 80, 240, CW - 160, 0.5).fill(C.gold)

T(28, C.body, 'Auditoria Multi-Perfil', ML, 280, CW, { align: 'center' })
T(28, C.body, 'dos 13 Relatórios PDF', ML, 312, CW, { align: 'center' })
T(10, C.gold, 'CADA RELATÓRIO AVALIADO PELO SEU CONSUMIDOR PROFISSIONAL', ML, 360, CW, { align: 'center', characterSpacing: 1.5 })

doc.roundedRect(ML + 30, 410, CW - 60, 110, 6).lineWidth(1).stroke(C.dark)
doc.rect(ML + 30, 410, CW - 60, 4).fill(C.gold)
T(8, C.muted, 'ESCOPO', ML + 50, 430, CW - 100, { characterSpacing: 1.5 })
doc.fontSize(9).fillColor(C.body).text(
  '13 renderers do ficheiro src/db/pdfImovelDocs.js auditados sob a lente do profissional que consome cada documento (captador, perito avaliador, advogado imobiliário, advogado fiscal, notário, negociador, director de obra, sales ops, avaliador RICS, tax advisor, risk officer). Os 3 relatórios para investidor já foram auditados em documento separado.',
  ML + 50, 446, { width: CW - 100, lineGap: 3, align: 'justify' }
)

T(8, C.muted, 'RESULTADO', ML + 30, 540, CW - 60, { align: 'center', characterSpacing: 1.5 })
T(20, C.body, '4 críticos · 5 importantes · 4 polish · 1 analítico', ML, 560, CW, { align: 'center' })
T(9, C.muted, '~14 dias úteis de implementação em 4 sprints sequenciais', ML, 590, CW, { align: 'center' })

T(8, C.muted, `Documento gerado em ${NOW()}  ·  Confidencial`, ML, 740, CW, { align: 'center' })
doc.rect(0, PH - 6, PW, 6).fill(C.gold)

// ═══════════════════════════════════════════════════════════════════
// PÁG 2 — SUMÁRIO EXECUTIVO
// ═══════════════════════════════════════════════════════════════════
newPage()
let y = 60
y = header(y, 'Sumário Executivo', 'Visão geral · método · achados principais')

y = bulletBlock(y, 'Método', [
  'Para cada um dos 13 renderers, foi adoptado o perfil profissional do consumidor primário do documento (não o emissor).',
  'Auditoria estruturada em três blocos: lacunas críticas de conteúdo, melhorias de layout, top 3 acções priorizadas.',
  'Priorização final por impacto × frequência de uso, em 4 tiers de execução.',
  'Identificados padrões transversais que justificam helpers centralizados no DocBuilder.',
])

y = bulletBlock(y, 'Achados Principais', [
  'Tier 1 (4 relatórios) expõe a Somnium a risco legal/fiscal/reputacional — proposta_formal, ficha_cedencia, estudo_comparaveis, relatorio_caep.',
  'A peça de maior risco é proposta_formal: tem efeito juridicamente vinculativo após aceite mas é gerada como formulário em branco.',
  'estudo_comparaveis e relatorio_comparaveis partilham defeitos metodológicos RICS — sem rastreabilidade, sem distinção asking/sold, sem estatística inferencial.',
  'ficha_visita é a peça mais sólida do sistema (10 secções, ~80 itens) — apenas precisa de polish (mini-planta, ranges €/m², cross-ref fotográfico).',
  'ficha_acompanhamento_obra é estática (4 semanas hardcoded) — não escala para obra de 6 meses (24 semanas reais).',
  '6 padrões transversais (timeline, traffic lights, audit footer, identificação registal, sparkline, decomposição fiscal) reduzem ~40% do trabalho de implementação.',
])

y = bulletBlock(y, 'Recomendação', [
  'Avançar com Sprint A (Tier 1 jurídico-fiscal) em prioridade absoluta — 5 dias.',
  'Sprints B e C podem correr em paralelo a Sprint A se houver largura de equipa.',
  'proposta_formal não deve ser auto-gerada sem validação prévia por advogado da Somnium. Esta é a única peça com bloqueio externo.',
  'Antes de iniciar Sprint A, validar perfis profissionais escolhidos para cada relatório.',
])

// ═══════════════════════════════════════════════════════════════════
// PÁG 3-15 — UM RELATÓRIO POR PÁGINA
// ═══════════════════════════════════════════════════════════════════

const audits = [
  {
    n: '8.1', file: 'ficha_imovel', lines: 'pdfImovelDocs.js:534-558', tier: 3,
    profession: 'Captador imobiliário sénior (AMI)',
    context: '15+ anos de mercado em Coimbra, gere pipeline de 30-40 imóveis. Usa o documento como ficha sumária impressa que carrega na pasta durante visitas a vendedores.',
    gaps: [
      'Sem score de oportunidade (qualificação A/B/C). Captador sénior precisa de ranking visual imediato para priorizar pipeline.',
      'Falta % desconto Ask vs Mercado estimado — KPI #1 do captador. Sem isto a ficha é informação morta.',
      'Sem histórico de interacções (chamadas, visitas, propostas anteriores). Não vê se este lead já passou pelo CRM antes.',
      'Origem aparece mas sem indicação se é fonte produtiva (ex: off-market via referência tem hit rate 3× superior a anúncio Idealista).',
      'Não mostra DOM (days on market) — imóvel com 200+ DOM tem perfil de negociação muito diferente de 15 DOM.',
      'Flags de qualidade (check_qualidade, check_ouro existem em BD) não aparecem no PDF.',
      'Notas é texto corrido sem estrutura. "Vendedor com pressa, divórcio, 30k abaixo" devia ser flagged em destaque.',
    ],
    layout: [
      'Títulos "INFORMAÇÃO GERAL" e "VALORES" são genéricos — renomear para "QUALIFICAÇÃO" e "OPORTUNIDADE FINANCEIRA".',
      'Sem hero badge tipo "GRADE A · OFF-MARKET · 18% DESCONTO".',
      'KPIs (Ask, Proposta, VVR) sem contextualização. Falta margem potencial calculada e visualizada.',
    ],
    actions: [
      'Adicionar header card de qualificação com grade A/B/C, origem, DOM e flags de qualidade/ouro.',
      'Calcular e mostrar margem potencial bruta (VVR − Ask − Obra estimada) como KPI primário.',
      'Adicionar histórico de eventos do CRM (chamada, visita, follow-up) cronologicamente como timeline.',
    ],
  },
  {
    n: '8.2', file: 'ficha_visita', lines: 'pdfImovelDocs.js:560-832', tier: 3,
    profession: 'Perito avaliador / engenheiro civil (cédula CMVM)',
    context: 'Faz 8-12 visitas técnicas por semana. Usa o documento em mão durante a visita, com prancheta e caneta, regista B/R/M em checkboxes. Compila em laudo formal.',
    gaps: [
      'Excelente cobertura de checklist (10 secções, ~80 itens) — peça mais sólida do sistema. Falta codificação NP4106 (Norma Portuguesa de Avaliação) que formaliza patologias.',
      'Sem diagrama de planta em branco para o perito desenhar layout actual e marcar humidades, fissuras (essencial em laudo formal).',
      'Estimativa de obra usa categorias L/P (Ligeira/Profunda) sem range €/m² aproximado. Perito precisa de âncora numérica.',
      'Não há secção dedicada de patologias estruturais críticas (fissuras escada, assentamentos, infiltrações activas) que disparam recomendação "PERITO ESPECIALISTA".',
      'Áreas anunciadas vs medidas tem só 3 linhas. Falta tabela com cada compartimento medido + verificação cruzada com Caderneta Predial.',
      'Sem escala de risco fotográfico — checklist diz "fotografar" mas não numera/categoriza fotos.',
      'Documentos a solicitar não tem campo para registar quais já foram entregues vs. promessa de envio.',
    ],
    layout: [
      '5+ páginas de checklist sem TOC nem paginação numerada por secção.',
      'Tabelas B/R/M com 4 colunas — falta uma 5ª "Foto #" para vincular checklist à galeria fotográfica.',
      'Decisão final (GO/SEGUNDA VISITA/PERITO/STAND-BY/NO GO) é apenas checkbox sem campo de evidência.',
    ],
    actions: [
      'Adicionar mini-planta editável (ou área para o perito desenhar/anexar) na secção de áreas.',
      'Range €/m² por categoria L/P ao lado de cada trabalho na estimativa de obra (valores Coimbra 2026).',
      'Coluna Foto # em cada linha das checklists B/R/M para cross-reference com galeria.',
    ],
  },
  {
    n: '8.3', file: 'analise_rentabilidade', lines: 'pdfImovelDocs.js:834-934', tier: 2,
    profession: 'Analista financeiro RE (uso interno)',
    context: 'Prepara o ficheiro completo antes de qualquer decisão de "ir/não ir" para investidor. Documento é arquivo técnico auditável — não peça de venda. Tem de ser denso, completo, replicável.',
    gaps: [
      'OK como folha de cálculo, fraca como documento auditável. Falta data de geração + versão da análise (an.versao existe em BD mas não aparece).',
      'Sem assunções declaradas numa secção própria (taxas de juro de referência, ano fiscal, derrama por município).',
      'VPT aparece como linha mas não há explicação de origem. Foi importado da Caderneta? Estimado? Crítico para auditoria fiscal.',
      'Não há comparação com versões anteriores da análise (versão é incrementada mas histórico não é exposto).',
      'Cash-on-Cash, Retorno Anualizado repetem nomenclaturas problemáticas (RA usa lucro bruto, CoC mal aplicado em fix&flip).',
      'Custos de detenção tem meses, seguro_mensal, mas IMI proporcional, n_tranches, custo_tranche (em BD) não são mostrados.',
      'Stress tests delegado a renderStressTests — sem resumo numérico no topo para arquivo rápido.',
    ],
    layout: [
      'Secções A-H em estrutura tipo memorando técnico — apropriado. Mas tabelas planas sem subtotais visuais cumulativos.',
      'Sem footer de auditoria (gerado por: usuário X · em data Y · análise versão Z).',
    ],
    actions: [
      'Adicionar header de auditoria com versão, data, autor, hash dos inputs.',
      'Secção "Pressupostos" com derrama, ano fiscal, fonte VPT, taxa Euribor de referência, tipo de IVA.',
      'Sumário de mudanças vs versão anterior (delta de cada KPI relevante) se versão > 1.',
    ],
  },
  {
    n: '8.4', file: 'estudo_comparaveis', lines: 'pdfImovelDocs.js:936-1017', tier: 1,
    profession: 'Avaliador certificado RICS / TEGOVA + cédula CMVM',
    context: 'Lê comparáveis com olhar metodológico estrito — qualquer estudo abaixo de standard RICS Red Book é descartado em arbitragem judicial ou em laudo bancário.',
    gaps: [
      'Sem critérios de selecção dos comparáveis declarados. Quantos foram considerados? Quais excluídos e porquê? RICS exige rastreabilidade.',
      'Ajustes em % sem benchmark. Cada ajuste (negociação -5%, localização ±5%) é aplicado sem indicação se segue tabela TEGOVA, AVALIA, ou método interno. Não defensável em laudo.',
      'Falta idade dos comparáveis (data_anuncio ou data_venda). Comparável de há 18 meses não vale o mesmo que de há 2 meses.',
      'Sem distinção entre preço pedido (asking) e preço fechado (sold) — diferença mais crítica em avaliação. Listagem €/m² em portais é asking.',
      'Não há estatística inferencial — só média simples. Avaliador sénior pede mediana, P25, P75, IQR e teste de outliers Tukey.',
      'Yield bruta calcula com renda × 12 / VVR mas falta yield líquida (após custos gestão, IMI, vacancy).',
      'Sem GIS / mapa de comparáveis com distância ao imóvel-alvo.',
    ],
    layout: [
      '7 colunas estreitas em colTable — texto pode estourar para fontes pequenas.',
      'Ajustes individuais (neg, loc, idade, conserv) só aparecem como soma "ajuste total". Avaliador precisa de decomposição.',
      'Sem distribution chart (P10-P50-P90).',
    ],
    actions: [
      'Acrescentar metadados RICS por comparável: data, fonte (asking/sold), distância ao imóvel-alvo, link arquivado.',
      'Decompor ajustes em subtabela (não somar a 1 só) e adicionar tabela TEGOVA de referência.',
      'Estatísticas inferenciais (mediana, IQR, outliers Tukey) e mini-mapa com pontos georreferenciados.',
    ],
  },
  {
    n: '8.5', file: 'proposta_formal', lines: 'pdfImovelDocs.js:1019-1037', tier: 1,
    profession: 'Advogado imobiliário (OA secção Coimbra)',
    context: 'Redige propostas formais que vão para o vendedor com efeito jurídico de proposta vinculativa após aceite. Cada palavra conta.',
    gaps: [
      'Inadequado como peça jurídica. Tem 4 campos preenchidos automaticamente e 4 campos em branco. Não é proposta — é formulário de campo.',
      'Falta identificação clara das partes (Comprador: Somnium NIF, sede, capital social; Vendedor: nome, NIF, morada, estado civil, regime bens).',
      'Sem identificação registal do imóvel (Conservatória, freguesia, número descrição, artigo matricial). Sem isto a proposta não vincula nada.',
      'Valor proposto sem decomposição CPCV vs escritura: quanto é sinal? Quanto à escritura? Há reforço de sinal? Datas?',
      'Não há cláusula de validade da proposta (válida até DD-MM-AAAA).',
      'Condições suspensivas ausentes (aprovação bancária, levantamento hipoteca, vistoria).',
      'Foro, lei aplicável, comunicações — todos ausentes. Sem espaço de assinatura nem rubrica.',
    ],
    layout: [
      '1 página única é insuficiente para proposta formal vinculativa. Mínimo 2 páginas (proposta + termos).',
      'Sem cabeçalho com referência interna (REF: SP/2026/Lages/01) que permita ao vendedor responder citando.',
    ],
    actions: [
      'Reformular como minuta jurídica com identificação registal, partes, valor decomposto (sinal/escritura), validade, condições suspensivas.',
      'Adicionar espaço de assinatura + rubrica + 2 testemunhas + foro de Coimbra.',
      'Validar com advogado da Somnium os campos obrigatórios — esta peça não pode ser auto-gerada sem validação legal.',
    ],
  },
  {
    n: '8.6', file: 'resumo_negociacao', lines: 'pdfImovelDocs.js:1135-1154', tier: 2,
    profession: 'Negociador profissional (técnica BATNA/ZOPA/anchoring — Harvard Negotiation Project)',
    context: 'Acompanha múltiplas negociações em paralelo e precisa de rastrear evolução de cada uma para detectar padrões de cedência.',
    gaps: [
      'Estrutura "Proposta 1, 2, 3, 4" é correcta mas sem registo do BATNA (Best Alternative To a Negotiated Agreement) próprio nem do vendedor.',
      'Não regista anchor inicial (Ask Price), target (valor objectivo), walkaway (valor máximo aceitável). São os 3 números fundamentais de qualquer negociação.',
      'Resposta do proprietário é campo livre. Falta tipologia (aceite, contraproposta, rejeição definitiva, silêncio, pedido de tempo) com cor codificada.',
      'Sem timeline visual entre propostas — quanto tempo entre cada round? Velocidade de concessão?',
      'Notas sem estrutura. Negociador profissional usa frameworks ("argumento utilizado: ancorar em comparável X; contra-argumento dele: Y; emoção observada: Z").',
      'Falta resultado da negociação numerado: ZOPA confirmada, gap em €, % cedência média por round.',
    ],
    layout: [
      '4 caixas de proposta idênticas — perde-se evolução. Devia ser tabela longitudinal com proposta, data, valor, gap vs Ask, resposta, dias entre rounds.',
      '"Estado actual" no fim sem cor/ícone (em curso / encerrado a favor / encerrado contra / parado).',
    ],
    actions: [
      'Substituir 4 caixas por tabela longitudinal com timeline e cálculo automático de gap e velocidade de concessão.',
      'Adicionar 3 hero numbers: BATNA, target, walkaway.',
      'Tipologia de resposta padronizada com cor codificada (verde/amarelo/vermelho).',
    ],
  },
  {
    n: '8.7', file: 'resumo_acordo', lines: 'pdfImovelDocs.js:1156-1183', tier: 2,
    profession: 'Notário / advogado de transações',
    context: 'Prepara CPCV e escritura. O resumo serve de briefing legal com termos acordados antes de redigir minuta de CPCV.',
    gaps: [
      'Sinal, prazo escritura, condições suspensivas, penalizações — todos em branco, sem estrutura.',
      'Falta calendário fiscal (até quando pagar IMT, IS, derrama).',
      'Sem identificação do notário ou conservatória prevista para escritura.',
      'Passos legais existem como checklist (validação documental, licenciamento, aprovação bancária, CPCV, escritura) mas sem datas associadas.',
      'Não há lista de documentos pendentes vs. recebidos com data de entrega.',
      'Sem cláusulas atípicas negociadas (inquilino arrendado, acesso antecipado para vistoria de obra).',
    ],
    layout: [
      'Tabelas planas, sem diagrama de timeline CPCV → Pagamento Sinal → Período Suspensivo → Escritura → Registo.',
      'Falta valor do sinal em destaque como bigNumber separado do valor total.',
    ],
    actions: [
      'Diagrama de timeline CPCV → Escritura com datas-marco e responsável.',
      'Tabela documentos pendentes com data prevista de entrega + responsável.',
      'Secção cláusulas atípicas dedicada para registar particularidades negociadas.',
    ],
  },
  {
    n: '8.8', file: 'ficha_follow_up', lines: 'pdfImovelDocs.js:1185-1199', tier: 3,
    profession: 'Sales operations manager',
    context: 'Disciplina de pipeline e cadência de contacto. Trabalha com cohorts e taxa de conversão.',
    gaps: [
      'Demasiado fininha (15 linhas de código). Não há disciplina de cadência (T+3, T+7, T+14 dias).',
      'Falta histórico de tentativas anteriores de follow-up (chamada não atendida, email enviado, mensagem WhatsApp).',
      'Sem motivo do follow-up estruturado (motivo_follow_up existe em BD mas não aparece).',
      'Próximas acções é checklist com 5 espaços vazios — sem template das 3-4 acções típicas.',
      'Sem probabilidade actualizada de conversão após follow-up (cohort de 30, 60, 90 dias).',
      'Falta data limite de decisão (se passar X dias sem resposta, mover para descarte automático).',
    ],
    layout: [
      'Secção "Ponto de Situação" é apenas linha de input. Devia mostrar diff vs último ponto de situação.',
      'Sem traffic light de saúde do lead (verde = activo, amarelo = stalled >7d, vermelho = stalled >30d).',
    ],
    actions: [
      'Adicionar histórico de interacções cronológico com tipo (chamada, email, WhatsApp, mensagem).',
      'Probabilidade de conversão actualizada + traffic light de saúde do lead.',
      'Templates das 3-4 acções típicas de follow-up (em vez de input em branco).',
    ],
  },
  {
    n: '8.9', file: 'ficha_cedencia', lines: 'pdfImovelDocs.js:1201-1221', tier: 1,
    profession: 'Advogado fiscal especialista em cessão de posição contratual',
    context: 'Cessão tem regime fiscal próprio em Portugal (CIRC art. 18º, CIRS art. 10º). Conhece os impactos: IRS mais-valias se particular, IRC se empresa, IS sobre cessão, IMT na nova posição.',
    gaps: [
      'Cessão de posição contratual tem regime fiscal próprio em Portugal e não há nenhuma menção à fiscalidade no PDF.',
      'Falta valor de aquisição da posição original vs valor de cedência vs mais-valia tributável.',
      'Sem cálculo de IS sobre cessão (0,5% sobre valor — frequente em wholesaling).',
      'Comprador / Cessionário tem campos básicos mas não há NIF, sede social, capital social — necessários para validação fiscal.',
      'Não há evidência da posição contratual original (referência ao CPCV de origem, data, valor).',
      'Sem cláusula de aprovação do vendedor original à cessão (cessão sem autorização pode invalidar negócio).',
      'Falta cláusula de garantia do cedente sobre saneamento da posição.',
    ],
    layout: [
      'Tabelas planas. Não há timeline da cessão (CPCV original → cedência → escritura final).',
      '"Margem" aparece como linha em branco — devia ser KPI calculado automaticamente.',
    ],
    actions: [
      'Adicionar secção fiscal dedicada com IS sobre cessão, mais-valias e enquadramento (particular vs empresa).',
      'Identificação completa do cessionário (NIF, sede, capital social) e referência ao CPCV original.',
      'Cláusulas de saneamento (cedente garante posição livre de ónus, vendedor original autoriza).',
    ],
  },
  {
    n: '8.10', file: 'ficha_acompanhamento_obra', lines: 'pdfImovelDocs.js:1223-1257', tier: 2,
    profession: 'Director de obra / project manager construção',
    context: 'Engenharia civil. Gere obra média de 6 meses com orçamento 50-200k€. Faz medição de progresso semanal, controla desvios em €/dia, valida tranches a empreiteiro.',
    gaps: [
      '4 semanas de registo manual com campos em branco. Não tem gráfico de Gantt nem curva S (% planeado vs % executado).',
      'Falta medição percentual de obra por especialidade (demolições %, electricidade %, canalização %, acabamentos %).',
      'Sem tabela de tranches ao empreiteiro (data, valor, % obra exigido para libertação, validação por director).',
      'Não há registo fotográfico estruturado com timestamp e geo-tag (essencial para reporting ao investidor + SLA).',
      'Desvios ao orçamento é tabela com 5 linhas em branco — sem categorização (mat-prima, mão-de-obra, imprevisto, ampliação scope).',
      'Falta cumprimento de prazo com diff vs cronograma original (atrasou X dias por razão Y).',
      'Sem registo de incidentes (acidente de trabalho, paragem por chuva, falha de fornecedor).',
    ],
    layout: [
      '4 secções "Semana 1, 2, 3, 4" presumem obra de 4 semanas — obra de 6 meses tem 24 semanas. Estrutura não escala.',
      'Falta dashboard no topo: % obra · % gasto · dias atraso/avanço · próximo milestone.',
    ],
    actions: [
      'Curva S ou Gantt simplificado mostrando planeado vs executado por especialidade.',
      'Tabela dinâmica de tranches ao empreiteiro com validação por milestone.',
      'Reformular semanas para N semanas dinâmicas (baseadas em meses × 4) com dashboard agregado.',
    ],
  },
  {
    n: '8.11', file: 'ficha_descarte', lines: 'pdfImovelDocs.js:1571-1614', tier: 4,
    profession: 'Analista de pipeline / sales operations',
    context: 'Quer aprender com cada lead descartado: porque caiu e que padrões emergem para refinar critérios de captação futura.',
    gaps: [
      'Boa estrutura básica (motivo, timeline, valores). Falta categorização do motivo (preço, estado, localização, vendedor, financiamento, regulatório) para análise agregada.',
      'Sem lessons learned: o que evitou? O que se aprendeu? Coluna estruturada permite análises futuras.',
      'Não há score do lead à entrada vs descarte — qual a etapa em que caiu (chamada / visita / VVR / proposta)?',
      'Sem flagging para reactivação (alguns descartes são "agora não" — devem voltar ao pipeline em 6-12 meses).',
      'Custo do lead ausente (horas gastas em captação, visita, análise) — métrica de eficiência operacional.',
      'Falta autor do descarte (quem decidiu e quando aprovou).',
    ],
    layout: [
      'Motivo aparece em bigNumbers — formato inadequado, é texto não número.',
      'Sem secção lições do mercado que agregue patterns ("5 descartes recentes em Santa Clara por preço — zona ficou cara").',
    ],
    actions: [
      'Motivo categorizado com taxonomia fixa (preço, estado, localização, vendedor, financiamento, regulatório).',
      'Campo etapa de descarte + score à entrada + custo do lead (horas).',
      'Flag reactivar em (data) para leads que possam voltar ao pipeline.',
    ],
  },
  {
    n: '8.12', file: 'relatorio_comparaveis', lines: 'pdfImovelDocs.js:1314-1352', tier: 2,
    profession: 'Avaliador certificado + economista urbano',
    context: 'Pega o estudo de comparáveis e contextualiza-o com dinâmicas da zona: gentrificação, projectos urbanos, infraestrutura, demografia.',
    gaps: [
      'Versão "investidor" do estudo de comparáveis — mais limpa mas com mesmos defeitos metodológicos do estudo_comparaveis (auditado em 8.4).',
      'Sem narrativa sobre a zona. Investidor sénior pergunta sempre: "porquê aqui? o que está a acontecer em Santa Clara que justifique este crescimento?"',
      'Falta série temporal de €/m² da zona (últimos 3-5 anos, fonte INE/Idealista Pulse).',
      'Sem projectos urbanos planeados que afectem valor (linha BRT, novo polo universitário, requalificação).',
      'Demografia ausente (perfil etário da zona, % estudantes, % proprietário vs arrendatário).',
      'Não há mapa da zona com pontos de interesse (universidade, transportes, comércio).',
      'Sem liquidez de mercado (DOM médio na zona, % imóveis vendidos vs listados).',
    ],
    layout: [
      'Mesma tabela colTable de 9 colunas estreitas — pode estourar.',
      'Sem mini-charts (sparkline de €/m² ao longo do tempo, histograma de tipologia).',
    ],
    actions: [
      'Secção narrativa "Dinâmica da zona" com 3-4 parágrafos sobre tendências (fonte INE Pulse, JE, autarquia).',
      'Sparkline temporal de €/m² dos últimos 3-5 anos.',
      'Mini-mapa com pontos de interesse + comparáveis georreferenciados.',
    ],
  },
  {
    n: '8.13', file: 'relatorio_caep', lines: 'pdfImovelDocs.js:1354-1401', tier: 1,
    profession: 'Tax advisor + estruturador de SPVs',
    context: 'Especialista em Associação em Participação (CAEP — figura jurídico-fiscal portuguesa, art. 21º Código Comercial + CIRC art. 5º).',
    gaps: [
      'Termo "Associação em Participação" é juridicamente preciso. Falta enquadramento fiscal completo: CAEP é tratada como sociedade transparente para alguns efeitos e opaca para outros.',
      'Não há fluxograma fiscal: lucro empresa → IRC → distribuição → tributação no associado (particular = retenção 28% liberatória; empresa = lucro distribuído com possibilidade de eliminação dupla tributação).',
      'Quota Somnium aparece sem explicação da contrapartida (gestão operacional, conhecimento, GP commitment).',
      'Tabela de investidores tem nome, tipo, capital, % capital — falta % lucro contratual (que não tem de ser igual a % capital — é a graça da CAEP).',
      'Sem cláusula de saída antecipada (e se um investidor quer sair antes do fim?).',
      'Falta declaração fiscal modelo 30 (entrega obrigatória pela empresa) referenciada.',
      'ROI individual aparece mas não há TIR, MOIC, nem comparação com aplicação alternativa para o perfil daquele investidor.',
      'Não há calendário de capital calls (CAEP pode ter fases — 30% à entrada, 70% antes de obra).',
    ],
    layout: [
      'Duas tabelas largas (capital, distribuição) — falta fluxograma visual do dinheiro: investidor → CAEP → empresa → obra → venda → IRC → distribuição → investidor.',
      'Cobertura % é hero number bom mas falta gap em € se cobertura < 100%.',
    ],
    actions: [
      'Fluxograma fiscal mostrando o caminho do dinheiro com tributações em cada nó.',
      'Adicionar % lucro contratual (separado de % capital) e calendário de capital calls se faseado.',
      'TIR/MOIC por investidor + comparação com alternativa (OT 10Y, REIT).',
    ],
  },
  {
    n: '8.14', file: 'relatorio_stress', lines: 'pdfImovelDocs.js:1403-1407', tier: 3,
    profession: 'Risk officer / quant em real estate (CFA + FRM)',
    context: 'Aplica metodologia tipo Solvency II / Basel III adaptada a real estate. Lê stress tests com olhar de "o que pode partir e que evidência tenho de tail risk".',
    gaps: [
      'Wrapper minimalista (5 linhas de código) que delega tudo a renderStressTests. Já auditado na Parte 1 (downside/upside genéricos, falta sensitivity isolada por variável).',
      'Sem VaR (Value at Risk) ou CVaR/Expected Shortfall — standard em risk officer. Pior cenário em -20% VVR é determinístico, não VaR.',
      'Não há probabilidade associada a cada cenário (P5 worst case, P50 base case, P95 best case). Stress tests sem distribuição não defendem em comité de risco.',
      'Falta histórico de variabilidade real dos comparáveis (qual o desvio-padrão histórico de €/m² nos últimos 3 anos? base para definir o ±20%).',
      'Sem correlação entre variáveis (VVR ↓ está correlacionado com tempo de venda ↑ — stress combinado deveria reflectir).',
      'Não há horizonte de stress diferenciado (1 mês para liquidez, 3 meses para obra, 6 meses para venda).',
      'Veredicto "resiliente vs risco" é binário sem nuance. Risk officer pede classificação Verde/Amarelo/Laranja/Vermelho.',
    ],
    layout: [
      'Capa "Análise de Risco" mas conteúdo é só stress test. Falta cobertura mais ampla: risco de mercado, crédito, liquidez, operacional, regulatório.',
      'Sem risk register estruturado.',
    ],
    actions: [
      'Adicionar VaR/CVaR sobre distribuição empírica de comparáveis (Monte Carlo simples).',
      'Probabilidades associadas a cada cenário (assumir log-normal ou histórica) e classificação V/A/L/V.',
      'Estender de stress test para risk register completo (5-7 categorias com impacto × probabilidade × mitigação).',
    ],
  },
]

audits.forEach(a => {
  newPage()
  let py = 60
  // Section header
  T(7, C.muted, a.n, ML, py, 50, { characterSpacing: 1 })
  T(7, C.muted, a.lines, ML + 50, py, CW - 50, { align: 'right' })
  py += 12
  T(18, C.body, a.file, ML, py, CW)
  py += 22
  py = tierBadge(py, a.tier)
  py += 8
  py = profileBox(py, a.profession, a.context)
  py = bulletBlock(py, 'Lacunas críticas', a.gaps, C.red)
  py = bulletBlock(py, 'Layout', a.layout, C.amber)
  py = actionsBlock(py, a.actions)
})

// ═══════════════════════════════════════════════════════════════════
// PÁG — TABELA DE PRIORIZAÇÃO
// ═══════════════════════════════════════════════════════════════════
newPage()
y = 60
y = header(y, 'Resumo Priorizado', 'Ordenado por risco actual ao negócio · criticidade × frequência de uso')

const rows = [
  ['8.5',  'proposta_formal',           'Advogado imobiliário',     'Alta',   'Alta',  1],
  ['8.9',  'ficha_cedencia',            'Advogado fiscal',          'Alta',   'Média', 1],
  ['8.4',  'estudo_comparaveis',        'Avaliador RICS',           'Alta',   'Alta',  1],
  ['8.13', 'relatorio_caep',            'Tax advisor + SPV',        'Alta',   'Média', 1],
  ['8.10', 'ficha_acompanhamento_obra', 'Director obra',            'Média',  'Alta',  2],
  ['8.6',  'resumo_negociacao',         'Negociador profissional',  'Média',  'Alta',  2],
  ['8.7',  'resumo_acordo',             'Notário/advogado',         'Média',  'Média', 2],
  ['8.3',  'analise_rentabilidade',     'Analista financeiro RE',   'Média',  'Alta',  2],
  ['8.12', 'relatorio_comparaveis',     'Avaliador + econ. urbano', 'Média',  'Média', 2],
  ['8.14', 'relatorio_stress',          'Risk officer',             'Média',  'Média', 3],
  ['8.2',  'ficha_visita',              'Perito avaliador',         'Baixa',  'Alta',  3],
  ['8.1',  'ficha_imovel',              'Captador imobiliário',     'Baixa',  'Alta',  3],
  ['8.8',  'ficha_follow_up',           'Sales ops',                'Baixa',  'Alta',  3],
  ['8.11', 'ficha_descarte',            'Pipeline analyst',         'Baixa',  'Média', 4],
]

doc.rect(ML, y, CW, 18).fill(C.dark)
const cols = [['#', 30], ['Renderer', 130], ['Profissão', 160], ['Crit.', 50], ['Freq.', 50], ['Tier', 75]]
let cx = ML + 6
cols.forEach(([l, w]) => { T(7, C.gold, l, cx, y + 5, w, { characterSpacing: 0.5 }); cx += w })
y += 20

const tierColors = [null, C.tier1, C.tier2, C.tier3, C.tier4]
const tierLabels = [null, 'Crítico', 'Importante', 'Polish', 'Analítico']
rows.forEach((r, i) => {
  if (i % 2 === 1) doc.rect(ML, y - 2, CW, 18).fill(C.soft)
  cx = ML + 6
  T(7.5, C.muted, r[0], cx, y + 3, cols[0][1]); cx += cols[0][1]
  T(8.5, C.body, r[1], cx, y + 3, cols[1][1]); cx += cols[1][1]
  T(8, C.muted, r[2], cx, y + 3, cols[2][1]); cx += cols[2][1]
  const cClr = r[3] === 'Alta' ? C.red : r[3] === 'Média' ? C.amber : C.green
  T(8, cClr, r[3], cx, y + 3, cols[3][1]); cx += cols[3][1]
  T(8, C.body, r[4], cx, y + 3, cols[4][1]); cx += cols[4][1]
  doc.roundedRect(cx, y + 1, 70, 14, 2).fill(tierColors[r[5]])
  T(7, C.white, `T${r[5]} · ${tierLabels[r[5]]}`, cx + 4, y + 5, 66, { characterSpacing: 0.3 })
  doc.rect(ML, y + 16, CW, 0.3).fill(C.border)
  y += 18
})
y += 12

T(8, C.gold, 'LEGENDA', ML, y, CW, { characterSpacing: 1 }); y += 11
doc.rect(ML, y, CW, 0.3).fill(C.border); y += 5
const tiers = [
  ['Tier 1 — Crítico',     'Correcção urgente — expõe a Somnium a risco legal/fiscal/reputacional.', C.tier1],
  ['Tier 2 — Importante',  'Melhoria operacional — afecta margem real e hit rate de captação.',     C.tier2],
  ['Tier 3 — Polish',      'Qualidade percebida — eleva profissionalismo do output.',                C.tier3],
  ['Tier 4 — Analítico',   'Não bloqueante — uso interno para análise agregada.',                    C.tier4],
]
tiers.forEach(([k, v, c]) => {
  doc.rect(ML, y, 4, 12).fill(c)
  T(8, C.body, k, ML + 12, y + 1, 130)
  T(8, C.muted, v, ML + 150, y + 1, CW - 150)
  y += 16
})

// ═══════════════════════════════════════════════════════════════════
// PÁG — PADRÕES TRANSVERSAIS + ROADMAP
// ═══════════════════════════════════════════════════════════════════
newPage()
y = 60
y = header(y, 'Padrões Transversais', 'Lacunas que aparecem em 3+ renderers · helpers a centralizar no DocBuilder')

const patterns = [
  ['Auditoria de geração',        'versão, autor, data, hash dos inputs · helper b.auditFooter()',                    'analise_rentabilidade · todos os internos'],
  ['Timeline visual',             'eventos cronológicos com data e responsável · helper b.timeline(events)',           'ficha_visita · resumo_acordo · follow_up · obra · cedencia'],
  ['Traffic lights / classific.', 'classificação V/A/V codificada em cor · helper b.statusBadge()',                   'follow_up · descarte · risk officer · proposta'],
  ['Identificação registal',      'partes (NIF, sede, capital), imóvel (Conservatória, descrição, artigo)',           'proposta_formal · resumo_acordo · cedencia · caep'],
  ['Sparkline temporal',          'série temporal compacta para tendências',                                          'comparáveis · análise rentabilidade · obra'],
  ['Decomposição fiscal',         'IMT, IS, IRC, IRS, IS Fin., IS Cessão, derrama por contexto · centralizar calcEngine.js', '5+ renderers'],
]

doc.rect(ML, y, CW, 18).fill(C.light)
const pcols = [['Padrão', 140], ['Helper', 230], ['Aparece em', CW - 140 - 230]]
cx = ML + 6
pcols.forEach(([l, w]) => { T(7.5, C.gold, l, cx, y + 5, w, { characterSpacing: 0.5 }); cx += w })
y += 20

patterns.forEach((p, i) => {
  if (i % 2 === 1) doc.rect(ML, y - 2, CW, 26).fill(C.soft)
  cx = ML + 6
  T(8.5, C.body, p[0], cx, y + 3, pcols[0][1]); cx += pcols[0][1]
  doc.fontSize(7.5).fillColor(C.muted).text(p[1], cx, y + 3, { width: pcols[1][1] - 6, lineGap: 1 })
  cx += pcols[1][1]
  doc.fontSize(7.5).fillColor(C.body).text(p[2], cx, y + 3, { width: pcols[2][1] - 6, lineGap: 1 })
  doc.rect(ML, y + 22, CW, 0.3).fill(C.border)
  y += 26
})
y += 8
T(7.5, C.muted, 'Estes 6 helpers, se construídos uma vez, reduzem em ~40% o trabalho de implementação dos Tiers 1-3.', ML, y, CW)
y += 20

y = header(y, 'Roadmap Proposto', '4 sprints sequenciais ou paralelos · ~14 dias úteis no total')

const sprints = [
  { tier: 1, label: 'A · Tier 1 jurídico-fiscal', days: '5 dias', items: 'proposta_formal · ficha_cedencia · estudo_comparaveis · relatorio_caep · helper b.legalParties()' },
  { tier: 2, label: 'B · Tier 2 operacional', days: '5 dias', items: 'ficha_acompanhamento_obra · resumo_negociacao · resumo_acordo · analise_rentabilidade · relatorio_comparaveis · helpers b.timeline() + b.auditFooter()' },
  { tier: 3, label: 'C · Tier 3 polish', days: '3 dias', items: 'ficha_visita · ficha_imovel · ficha_follow_up · relatorio_stress · helpers b.statusBadge() + b.sparkline()' },
  { tier: 4, label: 'D · Tier 4 analítico', days: '1 dia', items: 'ficha_descarte (taxonomia motivo, etapa, custo, reactivação)' },
]
sprints.forEach(s => {
  doc.roundedRect(ML, y, CW, 42, 4).lineWidth(0.5).stroke(C.border)
  doc.rect(ML, y, 4, 42).fill(tierColors[s.tier])
  T(9.5, C.body, `Sprint ${s.label}`, ML + 14, y + 6, CW - 100)
  T(8, C.gold, s.days, PW - MR - 80, y + 6, 70, { align: 'right' })
  doc.fontSize(7.5).fillColor(C.muted).text(s.items, ML + 14, y + 22, { width: CW - 24, lineGap: 1.5 })
  y += 48
})

y += 4
doc.rect(ML, y, CW, 0.3).fill(C.border); y += 6
T(7, C.muted, 'NOTA · Em adição aos ~3 dias do CIM institucional para investidor (auditado em documento separado). Total ~17 dias se sequencial; ~10 dias se A+B em paralelo.', ML, y, CW)

// ═══════════════════════════════════════════════════════════════════
// PÁG — DECISÕES PEDIDAS
// ═══════════════════════════════════════════════════════════════════
newPage()
y = 60
y = header(y, 'Decisões pedidas antes de avançar', '5 pontos a validar com o Alexandre')

const questions = [
  ['1. Validação dos perfis profissionais', 'Concorda com o perfil adoptado para cada relatório, ou há algum que devia ser auditado por outra lente? Ex: proposta_formal como advogado litigante em vez de transaccional.'],
  ['2. Sprints isolados ou paralelos',     'Sprint A (jurídico-fiscal) tem maior urgência por exposição legal. Começar por aí em isolado, ou correr A+B em paralelo se houver largura de equipa?'],
  ['3. Mock-ups visuais adicionais',       'Quer que gere PDF-exemplo (como o T2 Sub-Cave Lages) para mais 1-2 destes relatórios antes da implementação? Sugestão: proposta_formal (maior risco legal) e ficha_acompanhamento_obra (maior impacto em margem real).'],
  ['4. Track record / dados históricos',    'Para construir narrativa de zona em relatorio_comparaveis precisamos de série temporal €/m². Existe em BD ou requer scrape de Idealista Pulse / INE?'],
  ['5. Validação legal de proposta_formal', 'Esta peça não pode ser auto-gerada sem revisão por advogado da Somnium. Há advogado de cabeça? Senão, fica em risco mesmo após implementação.'],
]

questions.forEach((q, i) => {
  doc.roundedRect(ML, y, CW, 56, 4).fill(C.soft)
  doc.rect(ML, y, 3, 56).fill(C.gold)
  T(9, C.body, q[0], ML + 12, y + 8, CW - 24)
  doc.fontSize(8).fillColor(C.muted).text(q[1], ML + 12, y + 24, { width: CW - 24, lineGap: 2 })
  y += 64
})

y += 8
doc.rect(ML, y, CW, 0.5).fill(C.gold); y += 12
T(10, C.body, 'Próximo passo', ML, y, CW)
y += 16
doc.fontSize(8.5).fillColor(C.body).text(
  'Após validação destas 5 decisões, abre-se plano de implementação separado para Sprint A. Os 5 helpers transversais devem ser construídos primeiro (1-2 dias) antes dos renderers que os consomem, para evitar refactor a meio do ciclo.',
  ML, y, { width: CW, lineGap: 3, align: 'justify' }
)

doc.flushPages()
doc.end()
console.log(`PDF de auditoria gerado em: ${OUT}`)
