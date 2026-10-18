// @ts-nocheck
/**
 * Contacto único por pessoa (bloco "Próximos passos" das fichas de consultor e
 * de investidor, e a linha correspondente na ficha do imóvel).
 *
 * A lead é a pessoa; o imóvel é o assunto. Regras:
 *   - cada pessoa tem, no máximo, um próximo contacto por fazer: é uma tarefa
 *     da agenda (origem_tipo = 'consultor' | 'investidor', origem_campo =
 *     'proximo_contacto'), com os assuntos em contacto_assuntos;
 *   - um imóvel que precisa de follow-up entra como assunto nesse contacto, em
 *     vez de ganhar uma chamada própria;
 *   - o contacto feito (ou tentado sem sucesso) fica nas tabelas de interações
 *     que já existiam, e os assuntos tratados passam para essa linha.
 *
 * Port 1:1 de src/db/contactoPessoa.js (manter em sync): recebe o pool como
 * primeiro argumento, tal como lá.
 */
const randomUUID = () => crypto.randomUUID()

const CAMPO = 'proximo_contacto'
const ABERTA = "status NOT IN ('Concluída', 'Concluida') AND COALESCE(arquivada, false) = false"
export const CANAIS_CONTACTO = ['Chamada', 'WhatsApp', 'Email', 'Reunião']
export const RESULTADOS_CONTACTO = ['Feito', 'Sem sucesso']

// Tipo do contacto: decide a categoria e o título da tarefa na Agenda.
export const TIPOS_CONTACTO = { cold_call: 'Cold Call', discovery_call: 'Discovery Call', follow_up: 'Follow-up' }

// espelho: campo de data da pessoa que as listas e os dashboards já leem.
// fasesFollowUp: só nessas fases o contacto se chama "Follow-up".
// tipoPorFase: tipo sugerido ao marcar o contacto (sem fase listada: follow-up).
const PESSOAS = {
  consultor: {
    tabela: 'consultores', interacoes: 'consultor_interacoes', fk: 'consultor_id', origem: 'consultor_interacao',
    espelho: 'data_proximo_follow_up', fase: 'estatuto', fasesFollowUp: ['Follow up'],
    tipoPorFase: { 'Cold Call': 'cold_call', 'Aberto Parcerias': 'discovery_call' },
    categorias: { cold_call: 'Cold Call a Consultores', discovery_call: 'Discovery Call a Consultores', follow_up: 'Follow-up de Consultores' },
  },
  investidor: {
    tabela: 'investidores', interacoes: 'investidor_interacoes', fk: 'investidor_id', origem: 'investidor_interacao',
    espelho: 'data_proxima_acao', fase: 'status', fasesFollowUp: ['Follow Up'],
    tipoPorFase: { 'Pendente de Aprovação': 'cold_call', 'Potencial Investidor': 'cold_call', 'Marcar call': 'discovery_call', 'Call marcada': 'discovery_call' },
    categorias: { cold_call: 'Cold Call a Investidores', discovery_call: 'Discovery Call a Investidores', follow_up: 'Follow-up de Investidores' },
  },
  parceiro: {
    tabela: 'parceiros', interacoes: 'parceiro_interacoes', fk: 'parceiro_id', origem: 'parceiro_interacao',
    espelho: 'data_proximo_contacto', fase: 'estado', fasesFollowUp: ['Parceiro ativo'],
    tipoPorFase: { 'Por contactar': 'cold_call', 'Em avaliação': 'discovery_call' },
    categorias: { cold_call: 'Cold Call a Parceiros', discovery_call: 'Discovery Call a Parceiros', follow_up: 'Follow-up de Parceiros' },
  },
}
const tipoPadrao = (cfg, fase) => cfg.tipoPorFase[fase] || 'follow_up'
const tipoDaCategoria = (cfg, categoria) => Object.keys(cfg.categorias).find(k => cfg.categorias[k] === categoria) || null

const eData = v => /^\d{4}-\d{2}-\d{2}$/.test(v || '')
const instante = v => { const t = new Date(v || 0).getTime(); return isNaN(t) ? 0 : t }

// Cada operação mexe em várias tabelas (tarefa, assuntos, interação, espelhos):
// ou fica tudo gravado ou nada. Dentro de uma transação já aberta (quem chama
// passou uma ligação, não o pool) limita-se a correr.
async function emTransacao(pool, fn) {
  if (typeof pool.release === 'function' || typeof pool.idleCount !== 'number') return fn(pool)
  const cx = await pool.connect()
  try {
    await cx.query('BEGIN')
    const r = await fn(cx)
    await cx.query('COMMIT')
    return r
  } catch (e) {
    await cx.query('ROLLBACK').catch(() => {})
    throw e
  } finally {
    cx.release()
  }
}
const rotuloDe = (cfg, fase) => (cfg.fasesFollowUp.includes(fase) ? 'Follow-up' : 'Próximo contacto')

async function carregarPessoa(pool, tipo, id) {
  const cfg = PESSOAS[tipo]
  if (!cfg) return null
  const { rows: [p] } = await pool.query(`SELECT id, nome, ${cfg.fase} AS fase FROM ${cfg.tabela} WHERE id = $1`, [id])
  return p ? { cfg, tipo, id: p.id, nome: p.nome, fase: p.fase, rotulo: rotuloDe(cfg, p.fase) } : null
}

async function tarefaAberta(pool, tipo, id) {
  const { rows: [t] } = await pool.query(
    `SELECT id, inicio, data_limite, funcionario, categoria FROM tarefas
     WHERE origem_tipo = $1 AND origem_id = $2 AND origem_campo = $3 AND ${ABERTA}
     ORDER BY created_at DESC LIMIT 1`,
    [tipo, id, CAMPO]
  )
  return t || null
}

async function assuntosDe(pool, origem, ids) {
  if (!ids.length) return []
  const { rows } = await pool.query(
    `SELECT a.id, a.origem_id, a.imovel_id, a.texto, i.nome AS imovel_nome, i.estado AS imovel_estado, i.regiao AS imovel_regiao
     FROM contacto_assuntos a LEFT JOIN imoveis i ON i.id = a.imovel_id
     WHERE a.origem = $1 AND a.origem_id = ANY($2) ORDER BY a.created_at`,
    [origem, ids]
  )
  return rows
}

// Acrescenta assuntos a uma origem, sem repetir o mesmo imóvel.
async function juntarAssuntos(pool, origem, origemId, assuntos) {
  const atuais = await assuntosDe(pool, origem, [origemId])
  const imoveis = new Set(atuais.map(a => a.imovel_id).filter(Boolean))
  for (const a of assuntos || []) {
    const imovelId = a?.imovel_id || null
    const texto = (a?.texto || '').trim() || null
    if (!imovelId && !texto) continue
    if (imovelId && imoveis.has(imovelId)) continue
    if (imovelId) imoveis.add(imovelId)
    await pool.query(
      'INSERT INTO contacto_assuntos (id, origem, origem_id, imovel_id, texto) VALUES ($1,$2,$3,$4,$5)',
      [randomUUID(), origem, origemId, imovelId, imovelId ? null : texto]
    )
  }
}

// Título, categoria e região da tarefa acompanham os assuntos: com imóveis é
// um follow-up de imóveis (leva a região do primeiro); sem eles é contacto com
// a pessoa, sem região, com o tipo escolhido (ou o que a tarefa já tinha, ou o
// sugerido pela fase).
async function afinarTarefa(pool, p, tarefaId, data, tipoContacto = null) {
  const assuntos = await assuntosDe(pool, 'tarefa', [tarefaId])
  const imoveis = assuntos.filter(a => a.imovel_id)
  let tipo = TIPOS_CONTACTO[tipoContacto] ? tipoContacto : null
  if (!tipo) {
    const { rows: [t] } = await pool.query('SELECT categoria FROM tarefas WHERE id = $1', [tarefaId])
    tipo = tipoDaCategoria(p.cfg, t?.categoria) || tipoPadrao(p.cfg, p.fase)
  }
  const categoria = imoveis.length ? 'Follow-up de Imóveis' : p.cfg.categorias[tipo]
  const titulo = `${imoveis.length ? 'Follow-up' : TIPOS_CONTACTO[tipo]} — ${p.nome || 'Sem nome'}${imoveis.length ? ` (${imoveis.map(a => a.imovel_nome || 'Imóvel').join(', ')})` : ''}`
  await pool.query(
    'UPDATE tarefas SET tarefa = $1, categoria = $2, regiao = $3, updated_at = NOW() WHERE id = $4',
    [titulo, categoria, imoveis[0]?.imovel_regiao || null, tarefaId]
  )
  if (data && imoveis.length) {
    await pool.query('UPDATE imoveis SET data_follow_up = $1 WHERE id = ANY($2)', [data, imoveis.map(a => a.imovel_id)])
  }
}

// ── Leitura (ficha da pessoa) ────────────────────────────────
export async function lerContactoPessoa(pool, tipo, id) {
  const p = await carregarPessoa(pool, tipo, id)
  if (!p) return null
  const { cfg } = p
  const t = await tarefaAberta(pool, tipo, id)
  const { rows: feitos } = await pool.query(
    `SELECT x.id, x.data_hora AS quando, x.canal, x.notas, x.resultado, x.proxima_data, x.autor,
            ${tipo === 'consultor' ? 'x.imovel_id AS imovel_antigo_id, i.nome AS imovel_antigo_nome' : `NULL AS imovel_antigo_id, NULL AS imovel_antigo_nome, ${tipo === 'investidor' ? 'x.finalidade' : 'NULL AS finalidade'}`}
     FROM ${cfg.interacoes} x ${tipo === 'consultor' ? 'LEFT JOIN imoveis i ON i.id = x.imovel_id' : ''}
     WHERE x.${cfg.fk} = $1 ORDER BY x.data_hora DESC LIMIT 100`,
    [id]
  )
  const assuntos = await assuntosDe(pool, cfg.origem, feitos.map(f => f.id))
  const historico = feitos.map(f => {
    const meus = assuntos.filter(a => a.origem_id === f.id)
    // Interações antigas guardavam um único imóvel na própria linha.
    if (!meus.length && f.imovel_antigo_id) meus.push({ imovel_id: f.imovel_antigo_id, imovel_nome: f.imovel_antigo_nome, texto: null })
    return {
      id: f.id, quando: f.quando, canal: f.canal, notas: f.notas, resultado: f.resultado || null,
      proxima_data: f.proxima_data || null, autor: f.autor || null, finalidade: f.finalidade || null,
      assuntos: meus.map(a => ({ imovel_id: a.imovel_id, imovel_nome: a.imovel_nome, texto: a.texto })),
    }
  })
  if (tipo === 'consultor') {
    // Registos do formulário antigo "Histórico Follow-ups": só de leitura.
    const { rows: antigos } = await pool.query(
      `SELECT f.id, f.data, f.motivo, f.proximo_follow_up, f.imovel_id, i.nome AS imovel_nome
       FROM consultor_followups f LEFT JOIN imoveis i ON i.id = f.imovel_id WHERE f.consultor_id = $1`,
      [id]
    )
    for (const f of antigos) {
      historico.push({
        id: `followup:${f.id}`, quando: f.data, canal: null, notas: f.motivo, resultado: 'Feito',
        proxima_data: f.proximo_follow_up || null, autor: null, finalidade: null, antigo: true,
        assuntos: f.imovel_id ? [{ imovel_id: f.imovel_id, imovel_nome: f.imovel_nome, texto: null }] : [],
      })
    }
  }
  // Pela data do contacto (a mais recente primeiro). As datas vêm em formatos
  // mistos (só dia, hora local, ISO em UTC): compara-se o instante, não o texto.
  historico.sort((a, b) => instante(b.quando) - instante(a.quando))
  return {
    pessoa: { tipo, id: p.id, nome: p.nome, fase: p.fase },
    rotulo: p.rotulo,
    tipo_sugerido: tipoPadrao(cfg, p.fase),
    proximo: t ? {
      tarefa_id: t.id, quando: t.inicio || t.data_limite, funcionario: t.funcionario,
      tipo: tipoDaCategoria(cfg, t.categoria) || tipoPadrao(cfg, p.fase),
      assuntos: (await assuntosDe(pool, 'tarefa', [t.id])).map(a => ({
        id: a.id, imovel_id: a.imovel_id, imovel_nome: a.imovel_nome, imovel_estado: a.imovel_estado, texto: a.texto,
      })),
    } : null,
    historico,
  }
}

// ── Agendar (ou mudar) o próximo contacto ────────────────────
// assuntos (opcional): lista completa — substitui a que lá está.
// juntar (opcional): assuntos a acrescentar aos que já lá estão.
// quando (opcional): instante ISO com hora marcada; sem ele é o dia inteiro.
// tipoContacto (opcional): cold_call | discovery_call | follow_up.
export async function agendarContactoPessoa(poolOuCx, tipo, id, { data, quando = null, assuntos, juntar, tipoContacto = null, user = null } = {}) {
  return emTransacao(poolOuCx, pool => agendarContactoPessoaTx(pool, tipo, id, { data, quando, assuntos, juntar, tipoContacto, user }))
}

async function agendarContactoPessoaTx(pool, tipo, id, { data, quando = null, assuntos, juntar, tipoContacto = null, user = null } = {}) {
  const p = await carregarPessoa(pool, tipo, id)
  if (!p) return null
  if (!eData(data)) throw new Error('Indica a data do contacto')
  const hora = quando ? new Date(quando) : null
  const comHora = !!hora && !isNaN(hora.getTime())
  const inicio = comHora ? hora.toISOString() : data
  const fim = comHora ? new Date(hora.getTime() + 0.5 * 3600000).toISOString() : data
  let t = await tarefaAberta(pool, tipo, id)
  if (t) {
    await pool.query('UPDATE tarefas SET data_limite = $1, inicio = $2, fim = $3, updated_at = NOW() WHERE id = $4', [data, inicio, fim, t.id])
  } else {
    t = { id: randomUUID() }
    await pool.query(
      `INSERT INTO tarefas (id, tarefa, categoria, status, prioridade, data_limite, inicio, fim, user_id, funcionario,
                            tempo_horas, origem_tipo, origem_id, origem_campo)
       VALUES ($1,$2,$3,'A fazer','alta',$4,$5,$6,$7,$8,0.5,$9,$10,$11)`,
      [t.id, `${p.rotulo} — ${p.nome || 'Sem nome'}`, p.cfg.categorias[tipoPadrao(p.cfg, p.fase)], data, inicio, fim, user?.id || null, user?.nome || null, tipo, id, CAMPO]
    )
  }
  if (Array.isArray(assuntos)) {
    await pool.query("DELETE FROM contacto_assuntos WHERE origem = 'tarefa' AND origem_id = $1", [t.id])
    await juntarAssuntos(pool, 'tarefa', t.id, assuntos)
  }
  if (Array.isArray(juntar)) await juntarAssuntos(pool, 'tarefa', t.id, juntar)
  await afinarTarefa(pool, p, t.id, data, tipoContacto)
  await pool.query(`UPDATE ${p.cfg.tabela} SET ${p.cfg.espelho} = $1 WHERE id = $2`, [data, id])
  return t.id
}

// ── Registar o contacto feito, ou tentado sem sucesso ────────
// tratados: ids dos assuntos (do contacto marcado) tratados nesta conversa.
// novos: assuntos que surgiram na conversa e não estavam marcados.
// proximo: { data, quando } do contacto seguinte; os assuntos que ficaram por
// tratar seguem para ele. Sem sucesso: nada foi tratado, segue tudo.
// avulso: contacto fora do que está marcado («Novo contacto»): o contacto
// marcado e os seus assuntos ficam como estão; com `proximo`, só muda a data.
export async function registarContactoPessoa(poolOuCx, tipo, id, opcoes = {}) {
  return emTransacao(poolOuCx, pool => registarContactoPessoaTx(pool, tipo, id, opcoes))
}

async function registarContactoPessoaTx(pool, tipo, id, {
  resultado, quando = null, canal = 'Chamada', notas = '', finalidade = null, tratados = [], novos = [], proximo = null, avulso = false, user = null,
} = {}) {
  const p = await carregarPessoa(pool, tipo, id)
  if (!p) return null
  const { cfg } = p
  const semSucesso = resultado === 'Sem sucesso'
  if (!RESULTADOS_CONTACTO.includes(resultado)) throw new Error('Resultado inválido')
  if (!CANAIS_CONTACTO.includes(canal)) throw new Error('Canal inválido')
  if (semSucesso && !(notas || '').trim()) throw new Error('Indica o motivo do contacto sem sucesso')
  if (semSucesso && !eData(proximo?.data)) throw new Error('Indica a nova data do contacto')
  if (proximo?.data && !eData(proximo.data)) throw new Error('Data do próximo contacto inválida')
  const feitoEm = quando && !isNaN(new Date(quando).getTime()) ? new Date(quando).toISOString() : new Date().toISOString()

  const t = avulso ? null : await tarefaAberta(pool, tipo, id)
  const marcados = t ? await assuntosDe(pool, 'tarefa', [t.id]) : []
  const idsTratados = semSucesso ? [] : marcados.filter(a => (tratados || []).includes(a.id)).map(a => a.id)
  const pendentes = marcados.filter(a => !idsTratados.includes(a.id))

  const interacaoId = randomUUID()
  const agora = new Date().toISOString()
  const cols = ['id', cfg.fk, 'data_hora', 'canal', 'direcao', 'notas', 'resultado', 'proxima_data', 'autor', 'created_at', 'updated_at']
  const vals = [interacaoId, id, feitoEm, canal, 'Enviado', (notas || '').trim() || null, resultado, proximo?.data || null, user?.nome || user?.email || null, agora, agora]
  if (tipo === 'investidor') { cols.push('finalidade'); vals.push(finalidade === 'discovery' ? 'discovery' : 'follow_up') }
  await pool.query(`INSERT INTO ${cfg.interacoes} (${cols.join(', ')}) VALUES (${cols.map((_, i) => `$${i + 1}`).join(', ')})`, vals)

  if (idsTratados.length) {
    await pool.query('UPDATE contacto_assuntos SET origem = $1, origem_id = $2 WHERE id = ANY($3)', [cfg.origem, interacaoId, idsTratados])
  }
  if (!semSucesso) await juntarAssuntos(pool, cfg.origem, interacaoId, novos)
  if (t) await pool.query("UPDATE tarefas SET status = 'Concluída', updated_at = NOW() WHERE id = $1", [t.id])

  let tarefaId = null
  if (proximo?.data) {
    tarefaId = await agendarContactoPessoa(pool, tipo, id, { data: proximo.data, quando: proximo.quando || null, tipoContacto: proximo.tipo || null, user })
    if (pendentes.length) {
      await pool.query("UPDATE contacto_assuntos SET origem_id = $1 WHERE origem = 'tarefa' AND id = ANY($2)", [tarefaId, pendentes.map(a => a.id)])
      await afinarTarefa(pool, p, tarefaId, proximo.data, proximo.tipo || null)
    }
  } else if (!avulso) {
    // Sem contacto seguinte, o que ficou por tratar deixa de estar marcado.
    if (pendentes.length) await pool.query('DELETE FROM contacto_assuntos WHERE id = ANY($1)', [pendentes.map(a => a.id)])
    await pool.query(`UPDATE ${cfg.tabela} SET ${cfg.espelho} = NULL WHERE id = $1`, [id])
  }
  return { interacao_id: interacaoId, tarefa_id: tarefaId }
}

// ── Nota solta no histórico da pessoa ──────────────────────
// Fica na mesma tabela dos contactos, com canal 'Nota' e sem resultado: aparece
// na linha do tempo, mas não conta como contacto nas métricas nem no churn.
export async function anotarPessoa(pool, tipo, id, { notas, quando = null, user = null } = {}) {
  const p = await carregarPessoa(pool, tipo, id)
  if (!p) return null
  const texto = String(notas ?? '').trim()
  if (!texto) throw new Error('Escreve a nota')
  const { cfg } = p
  const agora = new Date().toISOString()
  const em = quando && !isNaN(new Date(quando).getTime()) ? new Date(quando).toISOString() : agora
  const nid = randomUUID()
  const cols = ['id', cfg.fk, 'data_hora', 'canal', 'direcao', 'notas', 'autor', 'created_at', 'updated_at']
  const vals = [nid, id, em, 'Nota', 'Nota', texto, user?.nome || user?.email || null, agora, agora]
  await pool.query(`INSERT INTO ${cfg.interacoes} (${cols.join(', ')}) VALUES (${cols.map((_, i) => `$${i + 1}`).join(', ')})`, vals)
  return nid
}

// ── Corrigir a nota de um contacto do histórico ─────────────
// hid: id da interação, ou "followup:<id>" nos registos antigos do consultor.
// Só muda o texto: a data do contacto (e por isso a ordem) mantém-se.
export async function editarNotaContacto(pool, tipo, id, hid, notas) {
  const cfg = PESSOAS[tipo]
  if (!cfg) return false
  const texto = String(notas ?? '').trim() || null
  const agora = new Date().toISOString()
  const antigo = String(hid || '').match(/^followup:(.+)$/)
  if (antigo) {
    if (tipo !== 'consultor') return false
    const r = await pool.query('UPDATE consultor_followups SET motivo = $1, updated_at = $2 WHERE id = $3 AND consultor_id = $4', [texto, agora, antigo[1], id])
    return r.rowCount > 0
  }
  const r = await pool.query(`UPDATE ${cfg.interacoes} SET notas = $1, updated_at = $2 WHERE id = $3 AND ${cfg.fk} = $4`, [texto, agora, hid, id])
  return r.rowCount > 0
}

// ── Lado do imóvel ───────────────────────────────────────────
// Em que contacto o imóvel vai ser tratado e os contactos em que foi assunto.
export async function lerContactosDoImovel(pool, imovelId) {
  const { rows: [im] } = await pool.query('SELECT id, consultor_id FROM imoveis WHERE id = $1', [imovelId])
  if (!im) return null
  const consultor = im.consultor_id ? await carregarPessoa(pool, 'consultor', im.consultor_id) : null
  let contacto = null
  if (consultor) {
    const t = await tarefaAberta(pool, 'consultor', consultor.id)
    if (t) {
      const assuntos = await assuntosDe(pool, 'tarefa', [t.id])
      contacto = { tarefa_id: t.id, quando: t.inicio || t.data_limite, incluido: assuntos.some(a => a.imovel_id === imovelId) }
    }
  }
  const { rows: historico } = await pool.query(
    `SELECT x.id, x.data_hora AS quando, x.canal, x.notas, x.resultado, x.proxima_data, 'consultor' AS pessoa_tipo, c.id AS pessoa_id, c.nome AS pessoa_nome
       FROM consultor_interacoes x JOIN consultores c ON c.id = x.consultor_id
      WHERE x.imovel_id = $1 OR EXISTS (SELECT 1 FROM contacto_assuntos a WHERE a.origem = 'consultor_interacao' AND a.origem_id = x.id AND a.imovel_id = $1)
     UNION ALL
     SELECT x.id, x.data_hora, x.canal, x.notas, x.resultado, x.proxima_data, 'investidor', v.id, v.nome
       FROM investidor_interacoes x JOIN investidores v ON v.id = x.investidor_id
      WHERE EXISTS (SELECT 1 FROM contacto_assuntos a WHERE a.origem = 'investidor_interacao' AND a.origem_id = x.id AND a.imovel_id = $1)
     UNION ALL
     SELECT f.id, f.data::text, NULL, f.motivo, f.resultado, f.proxima_data::text, NULL, NULL, NULL
       FROM imovel_follow_ups f WHERE f.imovel_id = $1
     ORDER BY 2 DESC LIMIT 100`,
    [imovelId]
  )
  return {
    consultor: consultor ? { id: consultor.id, nome: consultor.nome } : null,
    contacto,
    historico,
  }
}

// O imóvel precisa de follow-up e tem consultor: entra como assunto no contacto
// dele. Se o consultor já tem contacto marcado, o imóvel junta-se a ele e a
// data mantém-se — só muda com mover = true (escolha explícita de quem
// regista). Se não tem, é marcado para `data` (null se também não houver data).
// As tarefas de follow-up ou de chamada que o imóvel tivesse em nome próprio
// fecham-se, para não ficarem duas.
export async function juntarImovelAoContacto(poolOuCx, imovelId, { data = null, quando = null, mover = false, user = null } = {}) {
  return emTransacao(poolOuCx, pool => juntarImovelAoContactoTx(pool, imovelId, { data, quando, mover, user }))
}

async function juntarImovelAoContactoTx(pool, imovelId, { data = null, quando = null, mover = false, user = null } = {}) {
  const { rows: [im] } = await pool.query('SELECT id, consultor_id FROM imoveis WHERE id = $1', [imovelId])
  if (!im?.consultor_id) return null
  const p = await carregarPessoa(pool, 'consultor', im.consultor_id)
  if (!p) return null
  let t = await tarefaAberta(pool, 'consultor', p.id)
  let dataFinal = data
  if (t && !(mover && eData(data))) {
    dataFinal = String(t.data_limite || t.inicio || '').slice(0, 10)
    await juntarAssuntos(pool, 'tarefa', t.id, [{ imovel_id: imovelId }])
    await afinarTarefa(pool, p, t.id, dataFinal)
  } else {
    if (!eData(data)) return null
    t = { id: await agendarContactoPessoa(pool, 'consultor', p.id, { data, quando, juntar: [{ imovel_id: imovelId }], user }) }
  }
  await pool.query(
    `UPDATE tarefas SET status = 'Concluída', updated_at = NOW()
     WHERE origem_tipo = 'imovel' AND origem_id = $1 AND origem_campo IN ('data_follow_up', 'proxima_chamada') AND ${ABERTA}`,
    [imovelId]
  )
  return { tarefa_id: t.id, data: dataFinal, consultor: { id: p.id, nome: p.nome } }
}
