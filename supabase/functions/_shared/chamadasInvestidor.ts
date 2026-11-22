// @ts-nocheck
/**
 * Chamadas gravadas com investidores, avaliadas contra o SOP 23 v2.1 (Contacto
 * e Qualificação de Investidores): cold_call = Chamada 1 – Qualificação (3.6 e
 * 3.7), follow_up = Recontacto de quem está em Follow Up (3.5), discovery =
 * Chamada 2 – Discovery com bifurcação (4.2 a 4.11). O SOP 23 integrou e
 * revogou o SOP 9 e substitui o SOP 4 na avaliação das chamadas.
 *
 * Fluxo igual ao das gravações dos consultores: upload do áudio → worker
 * Whisper local (launchd) transcreve → análise pelo Claude Code no Mac do
 * worker (plano Claude, sem API paga). O backend só prepara os prompts e grava
 * as respostas; a síntese do período segue o mesmo caminho. O registo manual
 * (resultado, próximo passo, temperatura, data de follow-up) é sempre a fonte
 * de verdade; a IA só deixa sugestões dentro de `analise`.
 *
 * Gémeo Node em src/db/chamadasInvestidor.js — o código é o mesmo. Portar
 * qualquer alteração para os dois.
 */

import { aposAnaliseGravacao, instrucoesExtracaoGravacao } from "./autopreenchimento.ts"
import { compactarTranscricao, RE_LIMITE_PLANO } from "./filaIA.ts"
import { CRITERIOS_DISCOVERY } from "./classeInvestidor.js"

export const TIPOS_CHAMADA_INV = ['cold_call', 'follow_up', 'discovery']
export const RESULTADOS_INV = ['atendeu', 'nao_atendeu', 'recusou', 'numero_errado']
export const PROXIMOS_PASSOS_INV = ['entrevista_marcada', 'follow_up_agendado', 'enviar_forms', 'sem_interesse', 'nao_elegivel']
export const TEMPERATURAS_INV = ['quente', 'intermedio', 'frio']

// Passos avaliados (0 = não feito, 1 = superficial, 2 = bem feito).
export const PASSOS_INV = {
  // Chamada 1 – Qualificação (SOP 23, 3.6 e 3.7): 5 a 10 min, só decide se vale uma discovery.
  cold_call: [
    { chave: 'abertura', label: 'Abertura', guia: 'Apresenta-se, refere a origem concreta (formulário, referência, quem indicou), diz que são três ou quatro perguntas rápidas e pergunta "Pode ser agora?". Nunca abre com "tem 2 minutos?". Se não puder, marca dia e hora com duas opções antes de desligar.' },
    { chave: 'gravacao', label: 'Permissão para gravar', guia: 'Pede permissão para gravar no início ("Esta chamada fica gravada para eu não perder nada do que me disser. Pode ser?") (SOP 18).' },
    { chave: 'experiencia', label: 'Experiência', guia: 'Pergunta fechada por intervalos: "Já investiu em imobiliário? Nunca, 1 a 2 imóveis, 3 ou mais?"' },
    { chave: 'montante', label: 'Montante por intervalos', guia: 'Pergunta o montante confortável num primeiro negócio por intervalos: menos de 50 mil, 50 a 200 mil, 200 a 300 mil, mais de 300 mil. Nunca pergunta "quanto dinheiro tem". Lê o montante: <50 mil = Follow Up frio; 50 a 200 mil = só via passiva; 200 mil ou mais = qualquer via.' },
    { chave: 'disponibilidade', label: 'Disponibilidade do capital', guia: 'Apura se o capital está disponível hoje ou depende de vender ou resgatar alguma coisa (e quando).' },
    { chave: 'decisor', label: 'Decisor', guia: '"Decide sozinho ou há mais alguém na decisão?" Se houver outra pessoa, garante que vai estar na discovery.' },
    { chave: 'sem_retornos', label: 'Sem oportunidades nem retornos', guia: 'Não mostra oportunidades concretas nem fala de números ou retornos. A "Quanto rende?" responde que os retornos estão no dossiê de cada projeto e se mostram na apresentação.' },
    { chave: 'objeccoes', label: 'Objeções (secção 5)', guia: 'Responde com a resposta da secção 5 do SOP 23, no máximo uma tentativa por objeção, sem urgência inventada. Se não houve objeções, avalia como confirmou o interesse.' },
    { chave: 'fecho', label: 'Vender a discovery', guia: 'Dá uma razão concreta para a discovery ("perceber o que quer que este capital faça por si e mostrar as duas formas como trabalhamos") e propõe dois horários, no máximo a 48 horas, com o decisor presente. Se houver sinais de adiar (3.8), passa a Follow Up com temperatura e data. Nunca termina sem próximo passo com data e hora.' },
  ],
  // Recontacto de quem está em Follow Up (SOP 23, 3.5).
  follow_up: [
    { chave: 'retoma', label: 'Retoma do que faltava', guia: 'Abre com o que faltava da última vez: "Da última vez disse-me que [o que faltava]. Isso já mudou?". Personaliza e não repete o mesmo texto.' },
    { chave: 'valor', label: 'Ângulo novo', guia: 'Traz uma razão nova para falar (projeto concluído, mudança no que o investidor disse que faltava), sem números de retorno. Nunca o mesmo texto do contacto anterior.' },
    { chave: 'qualifica_falta', label: 'Qualifica só o que faltava', guia: 'Se mudou, qualifica só o que faltava (critérios em branco ou baixos do scorecard 4.10: capital, via, objetivo, urgência, experiência e confiança, decisor). Não refaz a conversa toda.' },
    { chave: 'sem_retornos', label: 'Sem oportunidades nem retornos', guia: 'Não mostra oportunidades concretas nem fala de números ou retornos fora da apresentação (SOP 11).' },
    { chave: 'objeccoes', label: 'Objeções (secção 5)', guia: 'No máximo uma tentativa por objeção, sem urgência inventada.' },
    { chave: 'fecho', label: 'Fecho e próximo passo', guia: 'Se mudou: discovery marcada no máximo a 48 horas (ou, se a discovery já foi feita e era o único ponto, propõe a classe e marca a apresentação). Se não mudou: nova data de recontacto com a temperatura revista (quente 30 dias, intermédio 60, frio 90) e um ângulo novo para a próxima conversa.' },
  ],
  // Chamada 2 – Discovery com bifurcação (SOP 23, 4.2 a 4.11).
  discovery: [
    { chave: 'abertura', label: 'Abertura e gravação', guia: 'Abertura 4.2 ("Antes de falarmos de negócios ou números, quero perceber bem a sua situação... Se não fizer, digo-lhe.") e permissão para gravar.' },
    { chave: 'objetivo', label: 'Bloco 1: Objetivo', guia: '"O que quer que este capital faça por si nos próximos 1 a 2 anos?" e "O que teria de acontecer para sentir que valeu a pena?". Se vago, leva ao concreto (rendimento por mês, valor no fim).' },
    { chave: 'porque', label: 'Bloco 2: Porquê real e urgência', guia: '"Porquê agora e não daqui a um ano?" e "O que acontece se o dinheiro ficar onde está mais um ano?". Aprofunda com "E isso é importante porquê?" até um motivo específico.' },
    { chave: 'dor', label: 'Bloco 3: Desafios (a dor)', guia: 'Onde está o capital e quanto rende, o que já tentou, o que o impede, último negócio que deixou passar. Quantifica sem inventar (ordem de grandeza) e liga a dor ao objetivo ("Concorda que, se resolvêssemos X, ficava mais perto de Y?"), com o investidor a dizer que sim. É o bloco mais longo.' },
    { chave: 'bifurcacao', label: 'Bifurcação', guia: 'Só depois dos três blocos apresenta as duas vias (ativa: imóvel em nome dele por cessão de posição; passiva: capital num CAEP, nós tratamos de tudo) e deixa o investidor escolher. Confirma com os sinais (horas por mês, obra, empreiteiro, controlo, montante). Se a escolha não bate com os sinais, di-lo como consultor.' },
    { chave: 'criterios_ativa', label: 'Critérios de compra (só via ativa)', guia: 'Tipologia e zona (1 ou 2 de cada, dentro do universo do SOP 2), teto de compra mais obra, margem mínima e prazo de decisão. Se a via for passiva, nota null.' },
    { chave: 'montante', label: 'Pré-qualificar o montante', guia: 'Usa a frase da via: passiva "a partir de 50 mil euros", ativa "a partir de 200 mil euros, entre compra e obra". "Está dentro do que pensou, ou fora?"' },
    { chave: 'confirmacao', label: 'Confirmar antes de terminar', guia: 'Recapitula 4.9: "quer [objetivo], porque [motivo real], e o que o trava é [desafio]. A via que faz mais sentido é [ativa/passiva]. Há algo que me esteja a escapar?"' },
    { chave: 'regra_70_30', label: 'Regra 70/30 e sem retornos', guia: 'Quem liga fala 30% do tempo ou menos. Não apresenta oportunidades concretas nem números de retorno na discovery.' },
    { chave: 'fecho', label: 'Fecho 4.11', guia: 'Pontua o scorecard antes de desligar. A ou B: apresentação marcada ainda na call para daqui a 1 a 2 dias; na via passiva promete o NDA no próprio dia. Sem projeto ou negócio disponível: Investidor Qualificado em Carteira com data de reativação. C: Follow Up quente ou intermédio com o que falta. D: Inactivo com motivo.' },
  ],
}

export const CRITERIOS_CLASSIFICACAO = [
  ['capacidade_financeira', 'Capacidade financeira'],
  ['experiencia', 'Experiência imobiliária'],
  ['alinhamento', 'Alinhamento estratégico'],
  ['credibilidade', 'Estabilidade e credibilidade'],
  ['compromisso', 'Disponibilidade e compromisso'],
]

// ── Gravação ligada à call agendada (tarefa da Agenda) ────────
// Categoria da tarefa => tipo de chamada (o guião do SOP 23 usado na análise).
export const TIPO_POR_CATEGORIA_INV = {
  'Cold Call a Investidores': 'cold_call',
  'Follow-up de Investidores': 'follow_up',
  'Discovery Call a Investidores': 'discovery',
}
const FECHADA = ['Concluída', 'Concluida']

// Calls deste investidor para escolher ao carregar o áudio: dos últimos 14 dias
// até amanhã, mais recentes primeiro, com a gravação já ligada (se houver).
export async function callsParaGravacao(pool, investidorId) {
  await ensureInvestidorGravacoesTable(pool)
  const desde = new Date(Date.now() - 14 * 86400000).toISOString().slice(0, 10)
  const ate = new Date(Date.now() + 86400000).toISOString().slice(0, 10)
  const { rows } = await pool.query(
    `SELECT t.id, t.tarefa, t.categoria, COALESCE(t.inicio, t.data_limite) AS quando, t.status, t.funcionario,
            (SELECT g.id FROM investidor_gravacoes g WHERE g.tarefa_id = t.id LIMIT 1) AS gravacao_id
       FROM tarefas t
      WHERE t.origem_tipo = 'investidor' AND t.origem_id = $1 AND t.categoria = ANY($2)
        AND COALESCE(t.arquivada, false) = false AND t.tarefa NOT LIKE 'Cancelada:%'
        AND left(COALESCE(t.inicio, t.data_limite), 10) BETWEEN $3 AND $4
      ORDER BY COALESCE(t.inicio, t.data_limite) DESC`,
    [investidorId, Object.keys(TIPO_POR_CATEGORIA_INV), desde, ate])
  return rows.map(r => ({ ...r, tipo_chamada: TIPO_POR_CATEGORIA_INV[r.categoria] || 'cold_call' }))
}

// Valida a tarefa escolhida e devolve tipo, data e título para a gravação.
export async function dadosDaTarefaParaGravacao(pool, investidorId, tarefaId) {
  if (!tarefaId) return null
  const { rows: [t] } = await pool.query(
    `SELECT id, tarefa, categoria, inicio, data_limite, status FROM tarefas WHERE id = $1 AND origem_tipo = 'investidor' AND origem_id = $2`,
    [tarefaId, investidorId])
  if (!t || !TIPO_POR_CATEGORIA_INV[t.categoria]) throw new Error('A call escolhida não pertence a este investidor')
  const data = String(t.inicio || t.data_limite || '').slice(0, 10) || new Date().toISOString().slice(0, 10)
  return { tarefa_id: t.id, tipo: TIPO_POR_CATEGORIA_INV[t.categoria], data, titulo: t.tarefa }
}

// A call aconteceu (há gravação): a tarefa fica concluída.
export async function concluirTarefaDaGravacao(pool, tarefaId) {
  if (!tarefaId) return
  await pool.query(`UPDATE tarefas SET status = 'Concluída', updated_at = NOW() WHERE id = $1 AND status <> ALL($2)`, [tarefaId, FECHADA])
}

let _tabelaGarantida = false
export async function ensureInvestidorGravacoesTable(pool) {
  if (_tabelaGarantida) return
  await pool.query(`
    CREATE TABLE IF NOT EXISTS investidor_gravacoes (
      id TEXT PRIMARY KEY,
      investidor_id TEXT NOT NULL REFERENCES investidores(id) ON DELETE CASCADE,
      tipo_chamada TEXT NOT NULL DEFAULT 'cold_call',
      titulo TEXT,
      data_chamada TEXT,
      realizada_por TEXT,
      ficheiro_path TEXT,
      ficheiro_nome TEXT,
      duracao_seg INTEGER,
      estado TEXT NOT NULL DEFAULT 'pendente',
      erro TEXT,
      transcricao TEXT,
      analise JSONB,
      nota_sop SMALLINT,
      resultado TEXT,
      proximo_passo TEXT,
      temperatura TEXT,
      data_follow_up TEXT,
      notas TEXT,
      registo_fonte TEXT,
      registo_confirmado_em TEXT,
      tarefa_id TEXT,
      created_at TEXT DEFAULT (NOW()::TEXT),
      updated_at TEXT DEFAULT (NOW()::TEXT)
    );
    CREATE INDEX IF NOT EXISTS idx_inv_gravacoes_investidor ON investidor_gravacoes(investidor_id);
    CREATE INDEX IF NOT EXISTS idx_inv_gravacoes_estado ON investidor_gravacoes(estado);
    CREATE INDEX IF NOT EXISTS idx_inv_gravacoes_data ON investidor_gravacoes(data_chamada);
    ALTER TABLE investidor_gravacoes ADD COLUMN IF NOT EXISTS interacao_id TEXT;
    CREATE TABLE IF NOT EXISTS investidor_chamadas_sinteses (
      id TEXT PRIMARY KEY,
      desde TEXT NOT NULL,
      ate TEXT NOT NULL,
      estado TEXT NOT NULL DEFAULT 'aguarda',
      sintese JSONB,
      erro TEXT,
      created_at TEXT DEFAULT (NOW()::TEXT),
      updated_at TEXT DEFAULT (NOW()::TEXT)
    );
  `)
  _tabelaGarantida = true
}

// O worker de transcrição usa as mesmas rotas /gravacoes/:id/* para as duas
// tabelas: o id (UUID) diz a qual pertence.
export async function tabelaDaGravacao(pool, id) {
  await ensureInvestidorGravacoesTable(pool)
  const { rows } = await pool.query('SELECT 1 FROM investidor_gravacoes WHERE id = $1', [id])
  return rows.length ? 'investidor_gravacoes' : 'consultor_gravacoes'
}

const escolhe = (v, lista) => (lista.includes(v) ? v : null)
const dataISO = (v) => (/^\d{4}-\d{2}-\d{2}/.test(String(v || '')) ? String(v).slice(0, 10) : null)

// Junta o payload novo com o registo actual (só as chaves presentes mudam).
export function sanitizeRegistoInvestidor(input = {}, current = {}) {
  const pick = (k) => (Object.prototype.hasOwnProperty.call(input, k) ? input[k] : current[k])
  return {
    resultado: escolhe(pick('resultado'), RESULTADOS_INV),
    proximo_passo: escolhe(pick('proximo_passo'), PROXIMOS_PASSOS_INV),
    temperatura: escolhe(pick('temperatura'), TEMPERATURAS_INV),
    data_follow_up: dataISO(pick('data_follow_up')),
    notas: String(pick('notas') ?? '').trim() || null,
  }
}

// Nota SOP (0-100): média dos passos avaliados.
export function notaSop(analise, tipo) {
  const passos = PASSOS_INV[tipo] || PASSOS_INV.cold_call
  // Notas a null (critério que não se aplica, ex.: critérios da via ativa numa via passiva) não contam.
  const notas = passos.map(p => analise?.passos?.[p.chave]?.nota).filter(n => n !== null && n !== undefined && n !== '').map(Number).filter(n => Number.isFinite(n))
  if (!notas.length) return null
  const soma = notas.reduce((s, n) => s + Math.max(0, Math.min(2, n)), 0)
  return Math.round(soma / (notas.length * 2) * 100)
}

function contextoInvestidor(inv) {
  if (!inv) return '(sem ficha)'
  const campos = [
    ['Nome', inv.nome], ['Status', inv.status], ['Tipo', inv.tipo_principal], ['Origem', inv.origem],
    ['Capital mín.', inv.capital_min], ['Capital máx.', inv.capital_max], ['Estratégia', inv.estrategia],
    ['ROI pretendido', inv.roi_pretendido], ['ROI anualizado pretendido', inv.roi_anualizado_pretendido],
    ['Experiência', inv.experiencia_imobiliario], ['Equipa de obras', inv.equipa_obras],
    ['Tipo de imóvel', inv.tipo_imovel_preferido], ['Classificação', inv.classificacao], ['Notas', inv.notas],
  ]
  return campos.filter(([, v]) => v != null && v !== '').map(([k, v]) => `${k}: ${v}`).join('\n') || '(ficha vazia)'
}

// opts.reuniao: o mesmo prompt para reuniões (presenciais ou videochamadas gravadas).
export function buildPrompt(tipo, investidor, opts = {}) {
  const passos = PASSOS_INV[tipo] || PASSOS_INV.cold_call
  const nomeTipo = opts.reuniao ? 'REUNIÃO (presencial ou videochamada gravada; avalia-a como Discovery com bifurcação, ou pelo guião que de facto se aplicou)' : tipo === 'follow_up' ? 'RECONTACTO DE FOLLOW UP' : tipo === 'discovery' ? 'CHAMADA 2 – DISCOVERY COM BIFURCAÇÃO' : 'CHAMADA 1 – QUALIFICAÇÃO (primeiro contacto / cold call)'
  const discovery = true // o scorecard sai em todos os contactos (classificação automática, 17/11/2026)
  const scAtual = (() => { try { const v = typeof investidor?.scorecard_discovery === 'string' ? JSON.parse(investidor.scorecard_discovery) : investidor?.scorecard_discovery; return v || {} } catch { return {} } })()
  const scAtualTxt = CRITERIOS_DISCOVERY.map(c => `- ${c.label}: ${scAtual?.[c.chave]?.nota ?? 'em branco'}${scAtual?.[c.chave]?.data ? ` (${scAtual[c.chave].data})` : ''}`).join('\n')
  const scorecardTxt = CRITERIOS_DISCOVERY.map(c => `- ${c.chave} (${c.label}): 0 = ${c.niveis[0]}; 1 = ${c.niveis[1]}; 2 = ${c.niveis[2]}`).join('\n')
  const scorecardJson = CRITERIOS_DISCOVERY.map(c => `    "${c.chave}": { "nota": 0-2 ou null, "evidencia": "frase exacta do investidor ou null", "minuto": "mm:ss ou null" }`).join(',\n')
  const passosTxt = passos.map((p, i) => `${i + 1}. ${p.chave} (${p.label}): ${p.guia}`).join('\n')
  const passosJson = passos.map(p => `    "${p.chave}": { "nota": 0-2 ou null, "evidencia": "citação curta da transcrição ou null", "comentario": "o que faltou e como fazer melhor, segundo o SOP 23" }`).join(',\n')
  return `És um analista comercial sénior da Somnium Properties (investimento imobiliário em Coimbra, Gaia e Porto: via ativa por cessão da posição contratual, via passiva como associado num CAEP). Recebes a transcrição de uma ${nomeTipo} entre a nossa equipa (Alexandre Mendes ou João Abreu) e um potencial investidor. Avalia-a contra o SOP 23 v2.1 (Contacto e Qualificação de Investidores), para treinar a equipa e registar no CRM o que o investidor disse.

REGRAS DO SOP 23
- Cada chamada tem um único objetivo. Chamada 1: decidir se há capital, disponibilidade e poder de decisão para uma discovery, e marcá-la no máximo a 48 horas com o decisor presente. Recontacto: perceber se o que faltava mudou. Discovery: objetivo, porquê, dor e via; classe A–D proposta e apresentação marcada (A ou B).
- Nenhuma chamada termina sem o próximo passo marcado, com data e hora.
- Neste SOP não se mostram oportunidades concretas nem se fala de retornos ou números. Os retornos dizem-se só na apresentação (SOP 11), e só os do dossiê de investimento. Proibidas promessas de rentabilidade e urgências inventadas.
- Nunca abrir com "tem 2 minutos?". Perguntas de qualificação fechadas e por intervalos; nunca "quanto dinheiro tem".
- Intervalos de montante: menos de 50 mil (abaixo do mínimo: Follow Up frio), 50 a menos de 200 mil (só via passiva), 200 a 300 mil e mais de 300 mil (qualquer via). Um valor no limite conta no escalão de cima.
- Sinais de descartar ou adiar (3.8): montante abaixo de 50 mil, capital dependente de uma venda sem data, "estou só a ver como funciona", recusa em trazer o outro decisor. Não se descarta de vez: Follow Up com temperatura (quente 30 dias, intermédio 60, frio 90) e data de reativação.
- Regra 70/30 na discovery: quem liga fala 30% do tempo ou menos.
- Objeções (secção 5): uma tentativa por objeção. "Agora não tenho tempo" => marcar dia e hora. "Mande informação por email" => email curto a confirmar a hora, negócios só em reunião. "Quanto rende?" => depende da via e do projeto, mostra-se na apresentação. "Tenho de falar com [outro]" => marcar com os dois. "Rende mais no banco" => "Comparado com quê? Quanto lhe rendeu no último ano?". "Vou pensar" => "É o montante, o prazo ou a confiança em nós?".
- Próximos passos: "entrevista_marcada" significa Discovery call marcada (na Chamada 1 e no recontacto) ou apresentação marcada (na discovery). "follow_up_agendado" = etapa Follow Up com temperatura e data. "enviar_forms" = Chamada 1 marcada para outro dia (Marcar call). "sem_interesse" = Inactivo com motivo. "nao_elegivel" = classe D ou abaixo do mínimo sem perspetiva.

PASSOS A AVALIAR (0 = não feito, 1 = superficial, 2 = bem feito com detalhe concreto; null só se o passo não se aplica a esta conversa)
${passosTxt}

FICHA ACTUAL DO INVESTIDOR NO CRM
${contextoInvestidor(investidor)}

SCORECARD ACUMULADO DOS CONTACTOS ANTERIORES (classe actual: ${investidor?.classificacao || 'sem classe'})
${scAtualTxt}

Responde APENAS com um objecto JSON válido (sem texto antes ou depois, sem markdown), com esta estrutura exacta:
{
  "resumo": "2-3 frases sobre o que aconteceu",
  "sentimento": "positivo" | "neutro" | "negativo",
  "interesse_investidor": "alto" | "medio" | "baixo",
  "passos": {
${passosJson}
  },
  "conformidade": { "promessa_rentabilidade_garantida": true|false, "informacao_financeira_detalhada_cedo": true|false (oportunidades concretas, números ou retornos ditos antes da apresentação), "abriu_com_tem_2_minutos": true|false, "fala_mais_de_metade": true|false (quem liga falou mais de metade do tempo), "urgencia_inventada": true|false, "comentario": "texto ou null" },
  "pontos_fortes": ["o que correu bem"],
  "pontos_fracos": ["onde falhámos face ao SOP 23"],
  "objeccoes": [{ "objeccao": "dúvida ou objecção do investidor, reescrita por ti numa frase clara (nunca copiada da transcrição; perguntas nossas não são objecções)", "resposta_dada": "como respondemos, resumido por ti numa frase clara", "eficaz": true|false, "sugestao": "resposta da secção 5 do SOP 23 adaptada" }],
  "melhorias_script": [{ "momento": "abertura | qualificacao | discovery | bifurcacao | objeccao | fecho | outro", "em_vez_de": "o que foi dito", "dizer": "frase concreta do guião do SOP 23 a usar da próxima vez" }],
  "dados_recolhidos": {
    "fonte": "referencia | rede | conteudo | formulario | evento | null",
    "experiencia": "nunca | 1-2 | 3+ | null",
    "intervalo_montante": "menos_50k | 50k_200k | 200k_300k | mais_300k | null",
    "capital_disponivel": "sim | depende de [texto] | null",
    "decisor": "sozinho | partilhado com [quem] | null",
    "objetivo": "texto curto ou null",
    "motivo_real": "texto curto ou null",
    "urgencia": "nenhuma | alguma | gatilho: [texto] | null",
    "capital_hoje_rendimento": "onde está o capital e quanto rende, ou null",
    "desafio": "desafio principal, quantificado se possível, ou null",
    "via": "ativa | passiva | null",
    "sinais_coerentes": true | false | null,
    "criterios_compra": { "tipologia": "texto ou null", "zona": "texto ou null", "teto_compra_obra": numero ou null, "margem_minima": "texto ou null", "prazo_decisao": "48h | semana | mais | null" } ou null,
    "frases_investidor": ["duas a três frases literais do investidor, para a recapitulação"],
    "o_que_falta": "o que falta para avançar (para o recontacto), ou null",
    "tipo_investidor": "Ativo" | "Passivo" | null, "capital_min": numero ou null, "capital_max": numero ou null, "capital_disponivel_quando": "texto ou null", "estrategia": "texto ou null", "tipo_imovel": "texto ou null", "equipa_obras": "texto ou null",
    "dados_em_falta": ["campos do SOP 23 (secção 3.9, 4.12 e Anexo B) que ficaram por recolher"]
  },
${discovery ? `  "scorecard_discovery": {\n${scorecardJson}\n  },\n` : ''}  "proximo_passo": "acção recomendada concreta, com data, segundo o SOP 23",
  "sugestao_resultado": "atendeu" | "nao_atendeu" | "recusou" | "numero_errado" | null,
  "sugestao_proximo_passo": "entrevista_marcada" | "follow_up_agendado" | "enviar_forms" | "sem_interesse" | "nao_elegivel" | null,
  "sugestao_temperatura": "quente" | "intermedio" | "frio" | null,
  "sugestao_data_follow_up": "YYYY-MM-DD ou null",
  "sugestao_justificacao": "1-2 frases a justificar as sugestões com o SOP 23 (3.5, 3.8, 3.9 ou 4.11)"
}

SCORECARD DE QUALIFICAÇÃO (SOP 23, 4.10), em qualquer tipo de contacto: dá uma nota de 0 a 2 por critério SÓ quando ESTA conversa traz prova (frase do investidor e minuto). Sem prova nesta conversa, usa null: a app mantém a nota do contacto anterior. Se o investidor disse algo que muda uma nota anterior (ex.: o capital deixou de estar disponível), dá a nota nova. Nunca adivinhes.\n${scorecardTxt}\nA app junta estas notas às dos contactos anteriores e, com os 6 critérios, define a classe automaticamente (11-12 A, 9-10 B, 7-8 C, 0-6 D), sem validação.\n\nEscreve em português de Portugal, directo e profissional. Não inventes: se algo não aparece na transcrição, usa null.

A transcrição é automática e tem erros (palavras trocadas, frases cortadas, nomes e locais deturpados). Os textos que escreves (resumo, objecções, respostas, próximo passo) aparecem na ficha do investidor e têm de se perceber sem ouvir a call: escreve-os sempre por palavras tuas, em frases completas e com sentido. Nunca copies frases soltas da transcrição para esses campos. Se uma passagem é ininteligível, omite-a. Se um nome, local ou data não é claro, não o reproduzas deturpado: escreve "(não claro na gravação)". Confirma que as datas que escreves são futuras quando falam de recontactos ou disponibilidade de capital (hoje é ${new Date().toISOString().slice(0, 10)}).`
}

function parseJson(texto) {
  const m = String(texto || '').match(/\{[\s\S]*\}/)
  return JSON.parse(m?.[0] || texto || '{}')
}

// A IA corre no Mac (Claude Code, plano Claude): o worker pede o prompt, corre-o
// e devolve o texto. Sem resposta devolve { pedido }; com resposta grava.
export const MODELO_IA_INV = 'sonnet'
const agora = () => new Date().toISOString()
const limiteObsoleto = () => new Date(Date.now() - 30 * 60_000).toISOString()

// Põe a chamada em fila para a análise no Mac (também usado para analisar de novo).
export async function pedirAnaliseInvestidor(pool, id) {
  const { rows: [g] } = await pool.query(
    `UPDATE investidor_gravacoes SET estado = 'aguarda_analise', erro = NULL, updated_at = $2
     WHERE id = $1 AND COALESCE(btrim(transcricao), '') <> '' RETURNING *`, [id, agora()])
  if (!g) throw new Error('Gravacao nao encontrada ou sem transcricao')
  return g
}

// Worker: chamadas à espera da análise (ou presas em a_analisar há >30 min).
export async function investidorGravacoesPorAnalisar(pool) {
  await ensureInvestidorGravacoesTable(pool)
  const { rows } = await pool.query(
    `SELECT id, tipo_chamada FROM investidor_gravacoes
      WHERE COALESCE(btrim(transcricao), '') <> ''
        AND (estado = 'aguarda_analise' OR (estado = 'a_analisar' AND updated_at < $1))
      ORDER BY created_at ASC LIMIT 5`, [limiteObsoleto()])
  return rows
}

export async function passoAnaliseInvestidor(pool, id, resposta) {
  const { rows: [g] } = await pool.query('SELECT * FROM investidor_gravacoes WHERE id = $1', [id])
  if (!g) throw new Error('Gravacao nao encontrada')
  if (!g.transcricao?.trim()) throw new Error('Sem transcricao para analisar')
  if (resposta == null) {
    // Reserva atómica: com dois Macs a correr o worker, só um fica com a chamada.
    const { rowCount } = await pool.query(
      `UPDATE investidor_gravacoes SET estado = 'a_analisar', updated_at = $2
        WHERE id = $1 AND (estado = 'aguarda_analise' OR (estado = 'a_analisar' AND updated_at < $3))`, [id, agora(), limiteObsoleto()])
    if (!rowCount) return { ocupado: true }
    const { rows: [inv] } = await pool.query('SELECT * FROM investidores WHERE id = $1', [g.investidor_id])
    // Poupança de tokens: análise SOP 23 e extração para a ficha no MESMO pedido,
    // com a transcrição (compactada) enviada uma só vez.
    const ficha = await instrucoesExtracaoGravacao(pool, g).catch(() => null)
    const prompt = ficha
      ? `PARTE 1: ANÁLISE SOP 23\n${buildPrompt(g.tipo_chamada, inv)}\n\nPARTE 2: DADOS PARA A FICHA\n${ficha}\n\n` +
        `FORMATO FINAL (substitui os formatos acima): responde APENAS com um JSON {"analise": <JSON da parte 1>, "ficha": <JSON da parte 2>}\n\n--- TRANSCRICAO ---\n${compactarTranscricao(g.transcricao)}`
      : `${buildPrompt(g.tipo_chamada, inv)}\n\n--- TRANSCRICAO ---\n${compactarTranscricao(g.transcricao)}`
    return { pedido: { passo: 'analise', modelo: MODELO_IA_INV, prompt } }
  }
  const bruto = parseJson(resposta)
  const combinado = bruto && typeof bruto.analise === 'object' && bruto.analise !== null
  const analise = combinado ? bruto.analise : bruto
  const { rows: [final] } = await pool.query(
    `UPDATE investidor_gravacoes SET analise = $2, nota_sop = $3, estado = 'analisado', erro = NULL, updated_at = $4 WHERE id = $1 RETURNING *`,
    [id, JSON.stringify(analise), notaSop(analise, g.tipo_chamada), agora()],
  )
  // Registo automático da call + extração para a ficha (autopreenchimento).
  await aposAnaliseGravacao(pool, id, { extracao: combinado ? bruto.ficha : null })
  return { concluido: true, gravacao: final }
}

// Em erro repõe 'transcrito' para se poder tentar de novo. Limite do plano
// Claude não é falha: volta à fila e é retomada quando o limite repõe.
export async function falhaAnaliseInvestidor(pool, id, erro) {
  if (RE_LIMITE_PLANO.test(String(erro || ''))) {
    await pool.query(`UPDATE investidor_gravacoes SET estado = 'aguarda_analise', erro = $2, updated_at = $3 WHERE id = $1`,
      [id, `Adiado (limite do plano): ${String(erro).slice(0, 300)}`, agora()])
    return
  }
  await pool.query(`UPDATE investidor_gravacoes SET estado = 'transcrito', erro = $2, updated_at = $3 WHERE id = $1`,
    [id, `Analise: ${String(erro || 'falhou').slice(0, 480)}`, agora()])
}

const media = (arr) => (arr.length ? Math.round(arr.reduce((s, n) => s + n, 0) / arr.length * 10) / 10 : null)
const pct = (a, b) => (b ? Math.round(a / b * 1000) / 10 : null)

function inicioSemana(d) {
  const dt = new Date(String(d).slice(0, 10) + 'T00:00:00Z')
  if (Number.isNaN(dt.getTime())) return null
  const dia = (dt.getUTCDay() + 6) % 7 // segunda = 0
  dt.setUTCDate(dt.getUTCDate() - dia)
  return dt.toISOString().slice(0, 10)
}

// Agregado do período: nota por passo (onde falhamos), conversão, conformidade,
// evolução semanal e objecções. O registo manual prevalece; sem ele usa-se a
// sugestão da IA (contado à parte em `sem_registo_manual`).
export async function relatorioChamadasInvestidores(pool, { desde, ate }) {
  await ensureInvestidorGravacoesTable(pool)
  const { rows } = await pool.query(
    `SELECT g.*, i.nome AS investidor_nome, i.status AS investidor_status
     FROM investidor_gravacoes g LEFT JOIN investidores i ON i.id = g.investidor_id
     WHERE substr(g.data_chamada, 1, 10) BETWEEN $1 AND $2
     ORDER BY g.data_chamada DESC, g.created_at DESC`,
    [desde, ate],
  )
  // Chamadas registadas na ficha como "Sem sucesso" não têm áudio: contam como
  // tentativas não atendidas (salvo se já houver gravação do mesmo dia).
  const { rows: semAudio } = await pool.query(
    `SELECT x.id, x.data_hora, x.investidor_id, x.finalidade, x.notas, i.nome AS investidor_nome, i.status AS investidor_status
     FROM investidor_interacoes x LEFT JOIN investidores i ON i.id = x.investidor_id
     WHERE x.canal = 'Chamada' AND x.resultado = 'Sem sucesso'
       AND substr(x.data_hora, 1, 10) BETWEEN $1 AND $2
       AND NOT EXISTS (SELECT 1 FROM investidor_gravacoes g WHERE g.investidor_id = x.investidor_id
                       AND substr(g.data_chamada, 1, 10) = substr(x.data_hora, 1, 10))`,
    [desde, ate],
  )
  for (const x of semAudio) {
    rows.push({
      id: `int-${x.id}`, data_chamada: String(x.data_hora).slice(0, 10), investidor_id: x.investidor_id,
      investidor_nome: x.investidor_nome, investidor_status: x.investidor_status,
      tipo_chamada: x.finalidade === 'cold_call' ? 'cold_call' : 'follow_up', estado: 'sem_audio',
      resultado: 'nao_atendeu', proximo_passo: null, nota_sop: null, analise: null, transcricao: null, sem_audio: true,
    })
  }
  rows.sort((a, b) => String(b.data_chamada).localeCompare(String(a.data_chamada)))
  const efectivo = (g, campo) => g[campo] ?? g.analise?.[`sugestao_${campo}`] ?? null
  const analisadas = rows.filter(g => g.analise && g.nota_sop != null)

  const passos = {}
  for (const tipo of TIPOS_CHAMADA_INV) {
    const doTipo = analisadas.filter(g => g.tipo_chamada === tipo)
    passos[tipo] = PASSOS_INV[tipo].map(p => {
      const notas = doTipo.map(g => Number(g.analise?.passos?.[p.chave]?.nota)).filter(n => Number.isFinite(n))
      return { chave: p.chave, label: p.label, media: media(notas), pct: notas.length ? Math.round(media(notas) / 2 * 100) : null, n: notas.length }
    })
  }

  const cold = rows.filter(g => g.tipo_chamada === 'cold_call')
  const follow = rows.filter(g => g.tipo_chamada === 'follow_up')
  const atendeu = (g) => efectivo(g, 'resultado') === 'atendeu' || (efectivo(g, 'resultado') == null && g.transcricao)
  const coldAtendidas = cold.filter(atendeu)
  const followAtendidas = follow.filter(atendeu)
  const entrevista = (g) => efectivo(g, 'proximo_passo') === 'entrevista_marcada'

  const semanas = {}
  for (const g of analisadas) {
    const s = inicioSemana(g.data_chamada)
    if (!s) continue
    ;(semanas[s] ||= []).push(g.nota_sop)
  }

  const objeccoes = []
  for (const g of analisadas) {
    for (const o of (Array.isArray(g.analise?.objeccoes) ? g.analise.objeccoes : [])) {
      if (o?.objeccao) objeccoes.push({ objeccao: o.objeccao, eficaz: !!o.eficaz, sugestao: o.sugestao || null, investidor: g.investidor_nome, data: g.data_chamada })
    }
  }

  const temperatura = { quente: 0, intermedio: 0, frio: 0 }
  for (const g of rows) { const t = efectivo(g, 'temperatura'); if (t in temperatura) temperatura[t]++ }

  return {
    periodo: { desde, ate },
    totais: {
      chamadas: rows.length,
      cold_call: cold.length,
      follow_up: follow.length,
      analisadas: analisadas.length,
      por_processar: rows.filter(g => ['pendente', 'a_transcrever', 'transcrito', 'aguarda_analise', 'a_analisar'].includes(g.estado)).length,
      sem_registo_manual: rows.filter(g => !g.resultado && !g.proximo_passo).length,
      nao_atendidas: rows.filter(g => efectivo(g, 'resultado') === 'nao_atendeu').length,
      sem_audio: semAudio.length,
    },
    nota_media: {
      global: media(analisadas.map(g => g.nota_sop)),
      cold_call: media(analisadas.filter(g => g.tipo_chamada === 'cold_call').map(g => g.nota_sop)),
      follow_up: media(analisadas.filter(g => g.tipo_chamada === 'follow_up').map(g => g.nota_sop)),
    },
    passos,
    conversao: {
      taxa_contacto: pct(coldAtendidas.length + followAtendidas.length, rows.length),
      cold_atendidas: coldAtendidas.length,
      cold_entrevista: coldAtendidas.filter(entrevista).length,
      taxa_cold_entrevista: pct(coldAtendidas.filter(entrevista).length, coldAtendidas.length),
      follow_atendidas: followAtendidas.length,
      follow_entrevista: followAtendidas.filter(entrevista).length,
      taxa_follow_entrevista: pct(followAtendidas.filter(entrevista).length, followAtendidas.length),
      sem_interesse: rows.filter(g => ['sem_interesse', 'nao_elegivel'].includes(efectivo(g, 'proximo_passo'))).length,
      follow_up_sem_data: rows.filter(g => efectivo(g, 'proximo_passo') === 'follow_up_agendado' && !efectivo(g, 'data_follow_up')).length,
    },
    conformidade: {
      promessas_rentabilidade: analisadas.filter(g => g.analise?.conformidade?.promessa_rentabilidade_garantida === true).length,
      info_financeira_cedo: analisadas.filter(g => g.analise?.conformidade?.informacao_financeira_detalhada_cedo === true).length,
    },
    temperatura,
    evolucao: Object.entries(semanas).sort(([a], [b]) => a.localeCompare(b)).map(([semana, notas]) => ({ semana, nota_media: media(notas), n: notas.length })),
    objeccoes: objeccoes.slice(0, 60),
    chamadas: rows.map(g => ({
      id: g.id, data_chamada: g.data_chamada, investidor_id: g.investidor_id, investidor_nome: g.investidor_nome,
      tipo_chamada: g.tipo_chamada, realizada_por: g.realizada_por, estado: g.estado, nota_sop: g.nota_sop,
      resultado: efectivo(g, 'resultado'), proximo_passo: efectivo(g, 'proximo_passo'), temperatura: efectivo(g, 'temperatura'),
      registo_manual: !!(g.resultado || g.proximo_passo), sem_audio: !!g.sem_audio, resumo: g.analise?.resumo || null,
    })),
  }
}

// Leitura de conjunto pelo Claude: o que mudar no script e nos follow-ups.
// Fica guardada por período (id = desde_ate); o PDF usa a última gerada.
const idSintese = ({ desde, ate }) => `${desde}_${ate}`

export async function lerSinteseInvestidores(pool, periodo) {
  await ensureInvestidorGravacoesTable(pool)
  const { rows: [s] } = await pool.query('SELECT * FROM investidor_chamadas_sinteses WHERE id = $1', [idSintese(periodo)])
  return s || null
}

export async function pedirSinteseInvestidores(pool, periodo) {
  const rel = await relatorioChamadasInvestidores(pool, periodo)
  if (!rel.totais.analisadas) throw new Error('Sem chamadas analisadas no periodo')
  const { rows: [s] } = await pool.query(
    `INSERT INTO investidor_chamadas_sinteses (id, desde, ate, estado, updated_at) VALUES ($1, $2, $3, 'aguarda', $4)
     ON CONFLICT (id) DO UPDATE SET estado = 'aguarda', erro = NULL, updated_at = $4 RETURNING *`,
    [idSintese(periodo), periodo.desde, periodo.ate, agora()])
  return s
}

// Worker: sínteses pedidas (ou presas em a_gerar há >30 min).
export async function sintesesInvestidoresPorGerar(pool) {
  await ensureInvestidorGravacoesTable(pool)
  const { rows } = await pool.query(
    `SELECT id, desde, ate FROM investidor_chamadas_sinteses
      WHERE estado = 'aguarda' OR (estado = 'a_gerar' AND updated_at < $1) ORDER BY updated_at ASC LIMIT 3`, [limiteObsoleto()])
  return rows
}

export async function passoSinteseInvestidores(pool, id, resposta) {
  const { rows: [s] } = await pool.query('SELECT * FROM investidor_chamadas_sinteses WHERE id = $1', [id])
  if (!s) throw new Error('Sintese nao encontrada')
  if (resposta != null) {
    const { rows: [final] } = await pool.query(
      `UPDATE investidor_chamadas_sinteses SET sintese = $2, estado = 'concluida', erro = NULL, updated_at = $3 WHERE id = $1 RETURNING *`,
      [id, JSON.stringify(parseJson(resposta)), agora()])
    return { concluido: true, sintese: final }
  }
  const periodo = { desde: s.desde, ate: s.ate }
  const rel = await relatorioChamadasInvestidores(pool, periodo)
  if (!rel.totais.analisadas) throw new Error('Sem chamadas analisadas no periodo')
  const { rows } = await pool.query(
    `SELECT tipo_chamada, data_chamada, nota_sop, analise FROM investidor_gravacoes
     WHERE analise IS NOT NULL AND substr(data_chamada, 1, 10) BETWEEN $1 AND $2
     ORDER BY data_chamada DESC LIMIT 40`,
    [periodo.desde, periodo.ate],
  )
  const chamadas = rows.map(g => ({
    tipo: g.tipo_chamada, data: String(g.data_chamada).slice(0, 10), nota: g.nota_sop,
    resumo: g.analise?.resumo, pontos_fracos: g.analise?.pontos_fracos, objeccoes: g.analise?.objeccoes,
    melhorias_script: g.analise?.melhorias_script, dados_em_falta: g.analise?.dados_recolhidos?.dados_em_falta,
  }))
  const estat = { totais: rel.totais, nota_media: rel.nota_media, passos: rel.passos, conversao: rel.conversao, conformidade: rel.conformidade, temperatura: rel.temperatura }
  // Reserva atómica (dois Macs): só um gera a síntese.
  const { rowCount } = await pool.query(
    `UPDATE investidor_chamadas_sinteses SET estado = 'a_gerar', updated_at = $2
      WHERE id = $1 AND (estado = 'aguarda' OR (estado = 'a_gerar' AND updated_at < $3))`, [id, agora(), limiteObsoleto()])
  if (!rowCount) return { ocupado: true }
  return { pedido: { passo: 'sintese', modelo: MODELO_IA_INV, prompt: `És o director comercial da Somnium Properties. Analisa o conjunto das chamadas a investidores (Chamada 1 de qualificação, recontactos de Follow Up e discoveries) do período ${periodo.desde} a ${periodo.ate}, avaliadas contra o SOP 23 v2.1 (Contacto e Qualificação de Investidores), e diz o que a equipa deve mudar para marcar mais discoveries e mais apresentações. Usa os KPIs da secção 7 do SOP 23: taxa de resposta ao primeiro contacto (meta 30%), conversão em Chamada 1 (meta 20%), tempo até à Chamada 1 (formulário no próprio dia, referências até 3 dias úteis), registo no próprio dia (meta 100%), taxa de qualificação (discoveries marcadas / Chamadas 1), comparência à discovery, distribuição por via e classe, validação da classe em 24 horas. "entrevista_marcada" nas estatísticas significa discovery ou apresentação marcada.

ESTATÍSTICAS DO PERÍODO
${JSON.stringify(estat)}

ANÁLISES DAS CHAMADAS
${JSON.stringify(chamadas)}

Responde APENAS com JSON válido, sem markdown:
{
  "diagnostico": "3-5 frases: onde estamos a falhar e porquê, com base nos números",
  "prioridades": [{ "titulo": "mudança concreta", "porque": "evidência nos dados", "accao": "o que fazer já na próxima chamada" }],
  "objeccoes_frequentes": [{ "objeccao": "objecção agrupada", "frequencia": numero, "melhor_resposta": "resposta recomendada, conforme a secção 5 do SOP 23" }],
  "script_cold_call": { "abertura": "abertura da Chamada 1 a usar", "qualificacao": ["perguntas fechadas por intervalos, pela ordem"], "fecho": "frase para vender a discovery com dois horários" },
  "follow_up": ["recomendações para a cadência D+3/D+7/D+12/D+15 e para os recontactos de Follow Up (o que faltava, ângulo novo, temperatura)"],
  "discovery": ["recomendações para as discoveries (três blocos, bifurcação, regra 70/30, fecho 4.11)"]
}
No máximo 5 prioridades e 6 objecções. Português de Portugal, directo. Sem promessas de rentabilidade, sem números de retorno e sem urgências inventadas nos textos sugeridos.` } }
}

export async function falhaSinteseInvestidores(pool, id, erro) {
  await pool.query(`UPDATE investidor_chamadas_sinteses SET estado = 'erro', erro = $2, updated_at = $3 WHERE id = $1`,
    [id, String(erro || 'Falha a gerar a sintese').slice(0, 500), agora()])
}
