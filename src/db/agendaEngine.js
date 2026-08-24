/**
 * Motor de agendamento — Fase 2 do Sistema de Agenda (revisão 21/08/2026:
 * cadeia de angariação, gatilho por estado do imóvel, e tarefas
 * simultâneas). Passos, sempre por esta ordem em "gerar-semana":
 *
 *   1. gerarCadeiasAngariacao — ao adicionar um imóvel, cria o par
 *      "Pesquisa de Imóveis" + "Cold Call" (mesma cadeia, mesmo dia,
 *      gap máximo de 1h entre as duas — ver ALGORITMO abaixo).
 *   2. gerarEstudoDeMercado — quando um imóvel entra no estado "Estudo de
 *      VVR", cria a tarefa "Estudo de Mercado" com prazo de 48h a contar
 *      de `imoveis.data_chamada` (escrito automaticamente quando a Cold
 *      Call da cadeia é confirmada — ver agendaRoutes.js).
 *   3. gerarTarefasSinteticas — datas futuras em consultores/investidores/
 *      imóveis (follow-ups, visitas, propostas) que ainda não têm tarefa
 *      ligada.
 *   4. instanciarTemplatesDevidos — tarefas_templates activos devidos
 *      nesta semana.
 *   5. gerarProposta — encaixa tudo nos blocos de disponibilidade:
 *      primeiro as cadeias (atómicas, mesmo dia), depois as tarefas
 *      simultâneas (os dois ao mesmo tempo), depois o resto por
 *      prioridade/prazo/first-fit. Nada é forçado para fora dos blocos
 *      que a pessoa deu como livres — o que não couber fica "não
 *      agendada" e volta a aparecer com urgência na semana seguinte.
 *
 * Mantido sem Express/Hono para ser portado 1:1 para
 * supabase/functions/_shared/agendaEngine.ts.
 */
import { randomUUID } from 'crypto'

// Papéis que contam como "equipa interna" para efeitos de agendamento —
// exclui 'parceiro'/'investidor' (ver ROLES em userRoutes.js).
const ROLES_EQUIPA = ['admin', 'comercial', 'financeiro', 'operacoes']
const GAP_MAX_CADEIA_MIN = 60 // Pesquisa -> Cold Call: no máximo 1h de intervalo
const PRAZO_ESTUDO_MERCADO_DIAS = 2 // 48h após a Cold Call

// Nada de histórico anterior a esta data participa na geração automática
// — nem datas de "próxima acção" já preenchidas (follow-ups), nem
// imóveis já existentes (cadeia de angariação/Estudo de Mercado). Decisão
// do utilizador em 21/08/2026: o histórico acumulado ao longo de meses no
// sistema antigo inundava a Agenda de tarefas sem responsável. Só o que
// for criado/reescrito a partir daqui entra.
const DATA_CORTE_ORIGEM = '2026-08-21T22:00:00.000Z'

// Campos de "próxima acção" com tarefa ligada automaticamente. `historico`
// indica se é rastreável em historico_alteracoes (data_visita está na lista
// de campos ignorados pelo trigger — 0013_audit_log.sql — fica sempre sem
// responsável pré-atribuído).
const ORIGEM_CAMPOS = [
  { tabela: 'consultores', campo: 'data_proximo_follow_up', origemTipo: 'consultor', categoria: 'Follow Up Consultores', duracaoHoras: 0.5, tituloPrefix: 'Follow-up', historico: false },
  { tabela: 'investidores', campo: 'data_proxima_acao', origemTipo: 'investidor', categoria: 'Follow Up Investidores', duracaoHoras: 0.5, tituloPrefix: 'Próxima ação', historico: true },
  { tabela: 'imoveis', campo: 'data_visita', origemTipo: 'imovel', categoria: 'Visita', duracaoHoras: 1.5, tituloPrefix: 'Visita', historico: false },
  { tabela: 'imoveis', campo: 'data_proposta', origemTipo: 'imovel', categoria: 'Proposta', duracaoHoras: 1, tituloPrefix: 'Proposta', historico: true },
  { tabela: 'imoveis', campo: 'data_follow_up', origemTipo: 'imovel', categoria: 'Follow Up Consultores', duracaoHoras: 0.5, tituloPrefix: 'Follow-up imóvel', historico: true },
]

function hojeISO() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
function addDias(dataISO, n) {
  const d = new Date(dataISO + 'T00:00:00Z')
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

// Quem definiu por último um campo específico de um registo, via
// historico_alteracoes (só cobre imoveis/investidores/negocios — consultores
// não tem trigger). Desempate por id: NOW() é fixo por transacção em
// Postgres, criar_at pode empatar entre linhas da mesma transacção.
async function resolverResponsavelPorHistorico(pool, tabela, entidadeId, campo) {
  const { rows } = await pool.query(
    `SELECT user_nome FROM historico_alteracoes
     WHERE entidade = $1 AND entidade_id = $2
       AND EXISTS (SELECT 1 FROM jsonb_array_elements(alteracoes) e WHERE e->>'campo' = $3)
     ORDER BY created_at DESC, id DESC LIMIT 1`,
    [tabela, entidadeId, campo]
  )
  const nome = rows[0]?.user_nome
  if (!nome) return null
  const { rows: users } = await pool.query('SELECT id FROM users WHERE nome = $1 LIMIT 1', [nome])
  return users[0]?.id || null
}

// ── 1. Cadeia de angariação: Pesquisa de Imóveis -> Cold Call ──────
export async function gerarCadeiasAngariacao(pool) {
  // Só imóveis adicionados a partir do corte entram na cadeia automática
  // — imóveis já existentes na base não geram Pesquisa/Cold Call
  // retroactivamente (presume-se que já foram accionados na prática).
  const { rows: imoveis } = await pool.query(
    `SELECT id, nome FROM imoveis i
     WHERE i.created_at::timestamptz >= $1::timestamptz AND NOT EXISTS (
       SELECT 1 FROM tarefas t WHERE t.origem_tipo = 'imovel' AND t.origem_id = i.id AND t.origem_campo = 'cadeia_pesquisa'
     )`,
    [DATA_CORTE_ORIGEM]
  )
  let criadas = 0
  for (const im of imoveis) {
    const idPesquisa = randomUUID()
    const idColdCall = randomUUID()
    await pool.query(
      `INSERT INTO tarefas (id, tarefa, categoria, status, prioridade, user_id, tempo_horas, origem_tipo, origem_id, origem_campo)
       VALUES ($1,$2,'Pesquisa de Imóveis','A fazer','alta',NULL,1,'imovel',$3,'cadeia_pesquisa')`,
      [idPesquisa, `Pesquisa de Imóveis — ${im.nome}`, im.id]
    )
    await pool.query(
      `INSERT INTO tarefas (id, tarefa, categoria, status, prioridade, user_id, tempo_horas, origem_tipo, origem_id, origem_campo)
       VALUES ($1,$2,'Cold Call','A fazer','alta',NULL,1,'imovel',$3,'cadeia_cold_call')`,
      [idColdCall, `Cold Call — ${im.nome}`, im.id]
    )
    criadas += 2
  }
  return { criadas }
}

// ── 2. Estudo de Mercado: gatilho por estado "Estudo de VVR" ───────
export async function gerarEstudoDeMercado(pool) {
  const { rows: imoveis } = await pool.query(
    `SELECT id, nome, data_chamada, created_at FROM imoveis i
     WHERE estado = 'Estudo de VVR' AND i.created_at::timestamptz >= $1::timestamptz
       AND NOT EXISTS (
         SELECT 1 FROM tarefas t WHERE t.origem_tipo = 'imovel' AND t.origem_id = i.id AND t.origem_campo = 'estudo_mercado_vvr'
       )`,
    [DATA_CORTE_ORIGEM]
  )
  let criadas = 0
  for (const im of imoveis) {
    const ancora = (im.data_chamada || im.created_at || hojeISO()).slice(0, 10)
    const dataLimite = addDias(ancora, PRAZO_ESTUDO_MERCADO_DIAS)
    const id = randomUUID()
    await pool.query(
      `INSERT INTO tarefas (id, tarefa, categoria, status, prioridade, data_limite, user_id, tempo_horas, origem_tipo, origem_id, origem_campo)
       VALUES ($1,$2,'Estudo de Mercado','A fazer','alta',$3,NULL,1.5,'imovel',$4,'estudo_mercado_vvr')`,
      [id, `Estudo de Mercado — ${im.nome}`, dataLimite, im.id]
    )
    criadas++
  }
  return { criadas }
}

// ── 2b. Análise de Negócio: só depois do Estudo de Mercado CONCLUÍDO ─
// Não faz sentido analisar um negócio (ou pior, escrever proposta) antes
// de o estudo de mercado estar mesmo feito — por isso esta exige a
// tarefa de Estudo de Mercado já 'Concluída', não só o estado do imóvel.
export async function gerarAnaliseDeNegocio(pool) {
  const { rows: imoveis } = await pool.query(
    `SELECT i.id, i.nome FROM imoveis i
     JOIN tarefas em ON em.origem_tipo = 'imovel' AND em.origem_id = i.id
       AND em.origem_campo = 'estudo_mercado_vvr' AND em.status = 'Concluída'
     WHERE i.created_at::timestamptz >= $1::timestamptz
       AND NOT EXISTS (
         SELECT 1 FROM tarefas t WHERE t.origem_tipo = 'imovel' AND t.origem_id = i.id AND t.origem_campo = 'analise_negocio'
       )`,
    [DATA_CORTE_ORIGEM]
  )
  let criadas = 0
  for (const im of imoveis) {
    const id = randomUUID()
    await pool.query(
      `INSERT INTO tarefas (id, tarefa, categoria, status, prioridade, user_id, tempo_horas, origem_tipo, origem_id, origem_campo)
       VALUES ($1,$2,'Análise de Negócio','A fazer','alta',NULL,1.5,'imovel',$3,'analise_negocio')`,
      [id, `Análise de Negócio — ${im.nome}`, im.id]
    )
    criadas++
  }
  return { criadas }
}

// ── 2c. Elaboração de Proposta: só depois da Análise de Negócio CONCLUÍDA
// Mesma lógica da Análise de Negócio — exige a tarefa anterior da
// sequência (Análise de Negócio) já 'Concluída', não só o estado do
// imóvel ter avançado no pipeline. Sequência completa e obrigatória:
// Pesquisa -> Cold Call -> Estudo de Mercado -> Análise de Negócio ->
// Elaboração de Proposta, cada uma só nasce quando a anterior está feita.
export async function gerarElaboracaoProposta(pool) {
  const { rows: imoveis } = await pool.query(
    `SELECT i.id, i.nome FROM imoveis i
     JOIN tarefas an ON an.origem_tipo = 'imovel' AND an.origem_id = i.id
       AND an.origem_campo = 'analise_negocio' AND an.status = 'Concluída'
     WHERE estado = 'Criar Proposta ao Proprietário' AND i.created_at::timestamptz >= $1::timestamptz
       AND NOT EXISTS (
         SELECT 1 FROM tarefas t WHERE t.origem_tipo = 'imovel' AND t.origem_id = i.id AND t.origem_campo = 'elaboracao_proposta'
       )`,
    [DATA_CORTE_ORIGEM]
  )
  let criadas = 0
  for (const im of imoveis) {
    const id = randomUUID()
    await pool.query(
      `INSERT INTO tarefas (id, tarefa, categoria, status, prioridade, user_id, tempo_horas, origem_tipo, origem_id, origem_campo)
       VALUES ($1,$2,'Proposta','A fazer','alta',NULL,2,'imovel',$3,'elaboracao_proposta')`,
      [id, `Elaboração de Proposta — ${im.nome}`, im.id]
    )
    criadas++
  }
  return { criadas }
}

// ── 3. Tarefas automáticas por data em consultor/investidor/imóvel ─
export async function gerarTarefasSinteticas(pool) {
  const hoje = hojeISO()
  let criadas = 0
  let actualizadas = 0

  for (const cfg of ORIGEM_CAMPOS) {
    const { rows: entidades } = await pool.query(
      `SELECT id, nome, ${cfg.campo} AS data_valor FROM ${cfg.tabela}
       WHERE ${cfg.campo} IS NOT NULL AND ${cfg.campo} >= $1 AND updated_at::timestamptz >= $2::timestamptz`,
      [hoje, DATA_CORTE_ORIGEM]
    )
    for (const ent of entidades) {
      const dataValor = String(ent.data_valor).slice(0, 10)
      const { rows: existentes } = await pool.query(
        `SELECT id, data_limite FROM tarefas
         WHERE origem_tipo = $1 AND origem_id = $2 AND origem_campo = $3 AND status != 'Concluída'`,
        [cfg.origemTipo, ent.id, cfg.campo]
      )
      if (existentes.length) {
        const existente = existentes[0]
        if (existente.data_limite !== dataValor) {
          await pool.query(
            `UPDATE tarefas SET data_limite = $1, inicio = NULL, fim = NULL, updated_at = NOW() WHERE id = $2`,
            [dataValor, existente.id]
          )
          actualizadas++
        }
        continue
      }
      const userId = cfg.historico
        ? await resolverResponsavelPorHistorico(pool, cfg.tabela, ent.id, cfg.campo)
        : null
      const id = randomUUID()
      await pool.query(
        `INSERT INTO tarefas (id, tarefa, categoria, status, prioridade, data_limite, user_id, tempo_horas, origem_tipo, origem_id, origem_campo)
         VALUES ($1,$2,$3,'A fazer','alta',$4,$5,$6,$7,$8,$9)`,
        [id, `${cfg.tituloPrefix} — ${ent.nome}`, cfg.categoria, dataValor, userId, cfg.duracaoHoras, cfg.origemTipo, ent.id, cfg.campo]
      )
      criadas++
    }
  }
  return { criadas, actualizadas }
}

// ── 4. Catálogo de tarefas recorrentes ──────────────────────────────
function diasAlvoTemplate(tpl, semanaInicio) {
  if (tpl.dias_semana) {
    const nums = tpl.dias_semana.split(',').map(Number)
    return nums.map(n => addDias(semanaInicio, n - 1))
  }
  if (tpl.frequencia === 'diaria') return Array.from({ length: 7 }, (_, i) => addDias(semanaInicio, i))
  if (tpl.frequencia === 'semanal') return [semanaInicio]
  if (tpl.frequencia === 'quinzenal') {
    if (!tpl.ultima_instancia_gerada_em) return [semanaInicio]
    const dias = (new Date(semanaInicio) - new Date(tpl.ultima_instancia_gerada_em)) / 86400000
    return dias >= 14 ? [semanaInicio] : []
  }
  if (tpl.frequencia === 'mensal') {
    if (!tpl.ultima_instancia_gerada_em) return [semanaInicio]
    return semanaInicio.slice(0, 7) !== tpl.ultima_instancia_gerada_em.slice(0, 7) ? [semanaInicio] : []
  }
  if (tpl.frequencia === 'custom' && tpl.frequencia_intervalo_dias) {
    if (!tpl.ultima_instancia_gerada_em) return [semanaInicio]
    const dias = (new Date(semanaInicio) - new Date(tpl.ultima_instancia_gerada_em)) / 86400000
    return dias >= tpl.frequencia_intervalo_dias ? [semanaInicio] : []
  }
  return []
}

export async function instanciarTemplatesDevidos(pool, semanaInicio) {
  const { rows: templates } = await pool.query('SELECT * FROM tarefas_templates WHERE activo = true')
  let criadas = 0

  for (const tpl of templates) {
    // Não gera nova instância enquanto a anterior não estiver 'Concluída'
    // (no Kanban) — sem isto, uma recorrente semanal nunca feita acumulava
    // uma cópia nova a cada "Actualizar fila", duplicada na fila.
    const { rows: pendente } = await pool.query(
      `SELECT id FROM tarefas WHERE template_id = $1 AND status != 'Concluída' LIMIT 1`,
      [tpl.id]
    )
    if (pendente.length) continue

    const dias = diasAlvoTemplate(tpl, semanaInicio)
    for (const dia of dias) {
      const { rows: existentes } = await pool.query(
        `SELECT id FROM tarefas WHERE template_id = $1 AND data_limite = $2`,
        [tpl.id, dia]
      )
      if (existentes.length) continue
      const id = randomUUID()
      await pool.query(
        `INSERT INTO tarefas (id, tarefa, categoria, status, prioridade, data_limite, user_id, template_id, tempo_horas, regiao, simultaneo)
         VALUES ($1,$2,$3,'A fazer',$4,$5,$6,$7,$8,$9,$10)`,
        [id, tpl.titulo, tpl.categoria, tpl.prioridade, dia, tpl.user_id_default, tpl.id, tpl.duracao_estimada_horas, tpl.regiao, !!tpl.simultaneo]
      )
      criadas++
    }
    if (dias.length) {
      await pool.query(`UPDATE tarefas_templates SET ultima_instancia_gerada_em = $1 WHERE id = $2`, [semanaInicio, tpl.id])
    }
  }
  return { criadas }
}

// ── 5. Fila priorizada + atribuição manual ──────────────────────────
// 21/08/2026: substituído o encaixe 100% automático (gerarProposta,
// mantida abaixo por referência) por escolha manual — o utilizador via
// que o algoritmo produzia sequências sem juízo de negócio ("solto").
// A geração/elegibilidade/sequência (secções 1-4 acima) mantém-se: só
// decide O QUE está pronto. QUANDO/QUEM faz cada coisa passa a ser
// sempre uma escolha humana, feita bloco a bloco.
function minutos(hhmm) { const [h, m] = hhmm.split(':').map(Number); return h * 60 + m }
function hhmmDe(min) { return `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}` }

// Fila priorizada — só tarefas do Catálogo de Tarefas Recorrentes
// (template_id preenchido). Decisão do utilizador em 24/08/2026: as
// automáticas (cadeia de angariação, Estudo de Mercado, follow-ups por
// entidade) continuam a ser geridas pelo motor mas deixam de aparecer
// neste menu de escolha — só o que está no catálogo é escolhível aqui.
export async function gerarFila(pool) {
  const { rows: users } = await pool.query(
    `SELECT id, nome, cor, iniciais FROM users WHERE ativo = true AND role = ANY($1) ORDER BY id`,
    [ROLES_EQUIPA]
  )

  const { rows: soltas } = await pool.query(
    `SELECT * FROM tarefas WHERE inicio IS NULL AND status != 'Concluída' AND template_id IS NOT NULL
     ORDER BY CASE prioridade WHEN 'alta' THEN 0 WHEN 'media' THEN 1 ELSE 2 END, data_limite NULLS LAST, created_at`
  )

  const fila = soltas.map(t => ({
    tipo: 'simples',
    id: t.id,
    tarefa_id: t.id,
    titulo: t.tarefa,
    categoria: t.categoria,
    duracao_horas: Number(t.tempo_horas) || 1,
    prioridade: t.prioridade,
    data_limite: t.data_limite,
    simultaneo: !!t.simultaneo,
    origem_tipo: t.origem_tipo,
    created_at: t.created_at,
  }))

  return { users, fila }
}

// Cursor livre de um bloco: hora_inicio + soma do que já está confirmado
// nele (assume-se sempre preenchido de forma contígua, sem buracos).
async function cursorLivre(pool, bloco) {
  const { rows } = await pool.query(
    `SELECT hora_fim FROM agendamentos WHERE disponibilidade_bloco_id = $1 AND estado = 'confirmado' ORDER BY hora_fim DESC LIMIT 1`,
    [bloco.id]
  )
  return rows.length ? minutos(rows[0].hora_fim) : minutos(bloco.hora_inicio)
}

// Atribui manualmente um item da fila a um bloco de disponibilidade
// concreto. Sem propor/confirmar em dois passos — é uma escolha
// deliberada da pessoa, fica logo definitiva (escreve tarefas.inicio/fim
// e, para a cadeia, imoveis.data_chamada, tal como o confirmar antigo).
export async function atribuirTarefa(pool, { blocoId, userId, item }) {
  const { rows: blocoRows } = await pool.query('SELECT * FROM disponibilidade_blocos WHERE id = $1', [blocoId])
  const bloco = blocoRows[0]
  if (!bloco) throw new Error('Bloco de disponibilidade não encontrado')
  if (bloco.user_id !== userId) throw new Error('O bloco não pertence a esta pessoa')

  const inicioLivre = await cursorLivre(pool, bloco)
  const capacidadeMin = minutos(bloco.hora_fim) - inicioLivre
  if (capacidadeMin <= 0) throw new Error('Este bloco já está completamente preenchido')

  async function inserir(tarefaId, uid, blocoRow, horaInicio, horaFim) {
    const id = randomUUID()
    await pool.query(
      `INSERT INTO agendamentos (id, tarefa_id, user_id, disponibilidade_bloco_id, data, hora_inicio, hora_fim, estado, confirmado_em)
       VALUES ($1,$2,$3,$4,$5,$6,$7,'confirmado', NOW())`,
      [id, tarefaId, uid, blocoRow.id, blocoRow.data, horaInicio, horaFim]
    )
    // Operações (Kanban) mostra e filtra por `funcionario` (texto), não por
    // user_id — sem isto, a tarefa aparecia no Kanban sem responsável visível.
    await pool.query(
      `UPDATE tarefas SET inicio = $1, fim = $2, user_id = $3,
              funcionario = (SELECT nome FROM users WHERE id = $3), updated_at = NOW()
       WHERE id = $4`,
      [`${blocoRow.data}T${horaInicio}:00`, `${blocoRow.data}T${horaFim}:00`, uid, tarefaId]
    )
    return id
  }

  if (item.tipo === 'cadeia') {
    const { rows: tPesquisa } = await pool.query('SELECT tempo_horas FROM tarefas WHERE id = $1', [item.pesquisaId])
    const { rows: tColdCall } = await pool.query('SELECT tempo_horas FROM tarefas WHERE id = $1', [item.coldCallId])
    const durP = Math.max(15, Math.round((Number(tPesquisa[0]?.tempo_horas) || 1) * 60))
    const durC = Math.max(15, Math.round((Number(tColdCall[0]?.tempo_horas) || 1) * 60))
    if (capacidadeMin < durP + durC) throw new Error('Este bloco não tem capacidade para a Pesquisa + Cold Call completas')
    const inicioP = inicioLivre, fimP = inicioP + durP, inicioC = fimP, fimC = inicioC + durC
    await inserir(item.pesquisaId, userId, bloco, hhmmDe(inicioP), hhmmDe(fimP))
    await inserir(item.coldCallId, userId, bloco, hhmmDe(inicioC), hhmmDe(fimC))
    await pool.query(`UPDATE imoveis SET data_chamada = $1 WHERE id = (SELECT origem_id FROM tarefas WHERE id = $2)`, [bloco.data, item.pesquisaId])
    return { ok: true }
  }

  const { rows: tarefaRows } = await pool.query('SELECT * FROM tarefas WHERE id = $1', [item.tarefaId])
  const tarefa = tarefaRows[0]
  if (!tarefa) throw new Error('Tarefa não encontrada')
  const dur = Math.max(15, Math.round((Number(tarefa.tempo_horas) || 1) * 60))

  if (tarefa.simultaneo) {
    const { rows: outros } = await pool.query(
      `SELECT id, nome FROM users WHERE ativo = true AND role = ANY($1) AND id != $2 ORDER BY id`,
      [ROLES_EQUIPA, userId]
    )
    const outro = outros[0]
    if (!outro) throw new Error('Não há outra pessoa da equipa para esta tarefa simultânea')
    const { rows: blocosOutro } = await pool.query(
      `SELECT * FROM disponibilidade_blocos WHERE user_id = $1 AND data = $2 ORDER BY hora_inicio`,
      [outro.id, bloco.data]
    )
    let alvo = null
    let inicioComum = null
    for (const bOutro of blocosOutro) {
      const cursorOutro = await cursorLivre(pool, bOutro)
      const inicio = Math.max(inicioLivre, cursorOutro)
      const fimComum = Math.min(minutos(bloco.hora_fim), minutos(bOutro.hora_fim))
      if (fimComum - inicio >= dur) { alvo = bOutro; inicioComum = inicio; break }
    }
    if (!alvo) throw new Error(`${outro.nome} não tem disponibilidade a coincidir neste horário — tarefa simultânea precisa dos dois ao mesmo tempo`)
    const fimComumMin = inicioComum + dur
    await inserir(tarefa.id, userId, bloco, hhmmDe(inicioComum), hhmmDe(fimComumMin))
    await inserir(tarefa.id, outro.id, alvo, hhmmDe(inicioComum), hhmmDe(fimComumMin))
    return { ok: true }
  }

  if (capacidadeMin < dur) throw new Error('Este bloco não tem capacidade suficiente para esta tarefa')
  await inserir(tarefa.id, userId, bloco, hhmmDe(inicioLivre), hhmmDe(inicioLivre + dur))
  return { ok: true }
}

// Desfazer uma atribuição manual (liberta o bloco, a tarefa volta à
// fila). Para uma cadeia, desfaz sempre as duas em conjunto.
export async function desfazerAtribuicao(pool, tarefaId) {
  const { rows: tarefaRows } = await pool.query('SELECT * FROM tarefas WHERE id = $1', [tarefaId])
  const tarefa = tarefaRows[0]
  if (!tarefa) throw new Error('Tarefa não encontrada')

  const idsParaLimpar = [tarefaId]
  if (tarefa.origem_campo === 'cadeia_pesquisa' || tarefa.origem_campo === 'cadeia_cold_call') {
    const { rows: par } = await pool.query(
      `SELECT id FROM tarefas WHERE origem_id = $1 AND origem_tipo = 'imovel' AND origem_campo IN ('cadeia_pesquisa','cadeia_cold_call') AND id != $2`,
      [tarefa.origem_id, tarefaId]
    )
    if (par[0]) idsParaLimpar.push(par[0].id)
  }
  await pool.query(`DELETE FROM agendamentos WHERE tarefa_id = ANY($1)`, [idsParaLimpar])
  await pool.query(`UPDATE tarefas SET inicio = NULL, fim = NULL, updated_at = NOW() WHERE id = ANY($1)`, [idsParaLimpar])
  return { ok: true, tarefas_libertadas: idsParaLimpar.length }
}

// ── (legado) Motor de encaixe 100% automático — mantido por referência,
// já não é chamado por nenhum endpoint activo (ver secção 5 acima). ──

export async function gerarProposta(pool, semanaInicio) {
  const semanaFim = addDias(semanaInicio, 6)

  await pool.query(`DELETE FROM agendamentos WHERE data >= $1 AND data <= $2 AND estado = 'proposto'`, [semanaInicio, semanaFim])

  const { rows: users } = await pool.query(
    `SELECT id, nome FROM users WHERE ativo = true AND role = ANY($1) ORDER BY id`,
    [ROLES_EQUIPA]
  )
  const blocosPorUser = {}
  const blocosPorUserDia = {} // user_id -> { 'YYYY-MM-DD': [bloco,...] } — mesmos objectos, agrupados
  for (const u of users) {
    const { rows } = await pool.query(
      `SELECT id, data, hora_inicio, hora_fim FROM disponibilidade_blocos
       WHERE user_id = $1 AND data >= $2 AND data <= $3
       ORDER BY data, hora_inicio`,
      [u.id, semanaInicio, semanaFim]
    )
    const blocos = rows.map(b => ({ ...b, cursorMin: minutos(b.hora_inicio), restanteMin: minutos(b.hora_fim) - minutos(b.hora_inicio) }))
    blocosPorUser[u.id] = blocos
    blocosPorUserDia[u.id] = {}
    for (const b of blocos) (blocosPorUserDia[u.id][b.data] ||= []).push(b)
  }

  const criados = []
  const naoAgendadas = []

  async function inserirAgendamento(tarefaId, userId, bloco, horaInicio, horaFim) {
    const id = randomUUID()
    await pool.query(
      `INSERT INTO agendamentos (id, tarefa_id, user_id, disponibilidade_bloco_id, data, hora_inicio, hora_fim, estado)
       VALUES ($1,$2,$3,$4,$5,$6,$7,'proposto')`,
      [id, tarefaId, userId, bloco.id, bloco.data, horaInicio, horaFim]
    )
    criados.push({ id, tarefa_id: tarefaId, user_id: userId, data: bloco.data, hora_inicio: horaInicio, hora_fim: horaFim })
  }

  async function tentarEncaixar(tarefa, userId, dataLimiteMax) {
    const blocos = blocosPorUser[userId] || []
    const duracaoMin = Math.max(15, Math.round((Number(tarefa.tempo_horas) || 1) * 60))
    for (const bloco of blocos) {
      if (dataLimiteMax && bloco.data > dataLimiteMax) continue
      if (bloco.restanteMin >= duracaoMin) {
        const horaInicio = hhmmDe(bloco.cursorMin)
        const horaFim = hhmmDe(bloco.cursorMin + duracaoMin)
        bloco.cursorMin += duracaoMin
        bloco.restanteMin -= duracaoMin
        await inserirAgendamento(tarefa.id, userId, bloco, horaInicio, horaFim)
        return true
      }
    }
    return false
  }

  // 5a. Cadeias de angariação (atómicas: as duas ou nenhuma, mesmo dia,
  // gap <= GAP_MAX_CADEIA_MIN). Prioridade máxima — correm antes de tudo.
  const { rows: pesquisas } = await pool.query(
    `SELECT * FROM tarefas WHERE origem_tipo='imovel' AND origem_campo='cadeia_pesquisa' AND inicio IS NULL AND status != 'Concluída'`
  )
  for (const pesquisa of pesquisas) {
    const { rows: coldCalls } = await pool.query(
      `SELECT * FROM tarefas WHERE origem_tipo='imovel' AND origem_id=$1 AND origem_campo='cadeia_cold_call' AND inicio IS NULL AND status != 'Concluída'`,
      [pesquisa.origem_id]
    )
    const coldCall = coldCalls[0]
    if (!coldCall) { naoAgendadas.push(pesquisa); continue }

    const durP = Math.max(15, Math.round((Number(pesquisa.tempo_horas) || 1) * 60))
    const durC = Math.max(15, Math.round((Number(coldCall.tempo_horas) || 1) * 60))
    let encaixado = false

    for (const u of users) {
      const porDia = blocosPorUserDia[u.id]
      for (const dia of Object.keys(porDia).sort()) {
        const blocosDia = porDia[dia]
        for (let i = 0; i < blocosDia.length && !encaixado; i++) {
          const bA = blocosDia[i]
          if (bA.restanteMin < durP) continue
          const inicioP = bA.cursorMin
          const fimP = inicioP + durP
          // B no mesmo bloco, logo a seguir (gap 0)?
          if (bA.restanteMin - durP >= durC) {
            const inicioC = fimP
            const fimC = inicioC + durC
            bA.cursorMin = fimC
            bA.restanteMin -= (durP + durC)
            await inserirAgendamento(pesquisa.id, u.id, bA, hhmmDe(inicioP), hhmmDe(fimP))
            await inserirAgendamento(coldCall.id, u.id, bA, hhmmDe(inicioC), hhmmDe(fimC))
            encaixado = true
            break
          }
          // B no bloco seguinte do mesmo dia, se o gap desde o fim de A couber
          for (let j = i + 1; j < blocosDia.length; j++) {
            const bB = blocosDia[j]
            const gap = bB.cursorMin - fimP
            if (gap < 0) continue
            if (gap <= GAP_MAX_CADEIA_MIN && bB.restanteMin >= durC) {
              const inicioC = bB.cursorMin
              const fimC = inicioC + durC
              bA.cursorMin = fimP
              bA.restanteMin -= durP
              bB.cursorMin = fimC
              bB.restanteMin -= durC
              await inserirAgendamento(pesquisa.id, u.id, bA, hhmmDe(inicioP), hhmmDe(fimP))
              await inserirAgendamento(coldCall.id, u.id, bB, hhmmDe(inicioC), hhmmDe(fimC))
              encaixado = true
            }
            break // só o próximo bloco do dia conta para o limite de 1h de gap
          }
          if (encaixado) break
        }
        if (encaixado) break
      }
      if (encaixado) break
    }
    if (!encaixado) { naoAgendadas.push(pesquisa); naoAgendadas.push(coldCall) }
  }

  // 5b. Tarefas simultâneas (os dois membros da equipa ao mesmo tempo).
  const { rows: simultaneas } = await pool.query(
    `SELECT * FROM tarefas WHERE simultaneo = true AND inicio IS NULL AND status != 'Concluída'
     ORDER BY CASE prioridade WHEN 'alta' THEN 0 WHEN 'media' THEN 1 ELSE 2 END, data_limite NULLS LAST, created_at`
  )
  for (const tarefa of simultaneas) {
    if (users.length < 2) { naoAgendadas.push(tarefa); continue }
    const duracaoMin = Math.max(15, Math.round((Number(tarefa.tempo_horas) || 1) * 60))
    let encaixado = false
    const [uA, uB] = users
    for (const dia of Object.keys(blocosPorUserDia[uA.id] || {}).sort()) {
      const blocosA = (blocosPorUserDia[uA.id] || {})[dia] || []
      const blocosB = (blocosPorUserDia[uB.id] || {})[dia] || []
      for (const ba of blocosA) {
        if (ba.restanteMin < duracaoMin) continue
        for (const bb of blocosB) {
          if (bb.restanteMin < duracaoMin) continue
          const inicio = Math.max(ba.cursorMin, bb.cursorMin)
          const fimA = ba.cursorMin + ba.restanteMin
          const fimB = bb.cursorMin + bb.restanteMin
          const fimComum = Math.min(fimA, fimB)
          if (fimComum - inicio >= duracaoMin) {
            const fim = inicio + duracaoMin
            ba.restanteMin -= (fim - ba.cursorMin); ba.cursorMin = fim
            bb.restanteMin -= (fim - bb.cursorMin); bb.cursorMin = fim
            await inserirAgendamento(tarefa.id, uA.id, ba, hhmmDe(inicio), hhmmDe(fim))
            await inserirAgendamento(tarefa.id, uB.id, bb, hhmmDe(inicio), hhmmDe(fim))
            encaixado = true
            break
          }
        }
        if (encaixado) break
      }
      if (encaixado) break
    }
    if (!encaixado) naoAgendadas.push(tarefa)
  }

  // 5c. Resto do pool (categorias já atribuídas + sem dono), first-fit
  // normal por prioridade/prazo. Tarefas com data_limite não podem ser
  // encaixadas depois desse prazo (ex: Estudo de Mercado, 48h) — se não
  // couber a tempo, fica "não agendada" (nunca força a agenda).
  const jaTratadas = new Set([...pesquisas.map(t => t.id), ...(await pool.query(
    `SELECT id FROM tarefas WHERE origem_tipo='imovel' AND origem_campo='cadeia_cold_call'`
  )).rows.map(r => r.id), ...simultaneas.map(t => t.id)])

  const { rows: poolComDono } = await pool.query(
    `SELECT * FROM tarefas WHERE inicio IS NULL AND status != 'Concluída' AND user_id IS NOT NULL AND simultaneo = false
     ORDER BY CASE prioridade WHEN 'alta' THEN 0 WHEN 'media' THEN 1 ELSE 2 END, data_limite NULLS LAST, created_at`
  )
  const { rows: poolSemDono } = await pool.query(
    `SELECT * FROM tarefas WHERE inicio IS NULL AND status != 'Concluída' AND user_id IS NULL AND simultaneo = false
     ORDER BY CASE prioridade WHEN 'alta' THEN 0 WHEN 'media' THEN 1 ELSE 2 END, data_limite NULLS LAST, created_at`
  )

  // data_limite de uma tarefa instanciada de template é só a segunda-feira
  // da semana em que foi gerada (bookkeeping do instanciarTemplatesDevidos,
  // para não duplicar) — não é um prazo real, a tarefa pode ir para
  // qualquer dia da semana. Só tarefas com prazo genuíno (cadeia/entidade,
  // ou definido à mão numa tarefa avulsa) restringem o encaixe.
  const prazoReal = (tarefa) => tarefa.template_id ? null : tarefa.data_limite

  for (const u of users) {
    const minhas = poolComDono.filter(t => t.user_id === u.id && !jaTratadas.has(t.id))
    for (const tarefa of minhas) {
      let ok = await tentarEncaixar(tarefa, u.id, prazoReal(tarefa))
      if (!ok && tarefa.origem_tipo) {
        for (const outro of users.filter(x => x.id !== u.id)) {
          ok = await tentarEncaixar(tarefa, outro.id, prazoReal(tarefa))
          if (ok) break
        }
      }
      if (!ok) naoAgendadas.push(tarefa)
    }
  }

  for (const tarefa of poolSemDono) {
    if (jaTratadas.has(tarefa.id)) continue
    let ok = false
    for (const u of users) {
      ok = await tentarEncaixar(tarefa, u.id, prazoReal(tarefa))
      if (ok) break
    }
    if (!ok) naoAgendadas.push(tarefa)
  }

  return { criados, naoAgendadas }
}
