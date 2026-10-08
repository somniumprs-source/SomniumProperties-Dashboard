// @ts-nocheck
// Checklist do imóvel como espelho: cada item fica feito porque o dado existe
// no CRM (visita, análise, campos, documentos, tarefas), nunca por um visto.
// Só o que acontece fora do CRM é declarado à mão, e fica guardado com quem e
// quando. Não bloqueia nada: o travão são os requisitos de entrada das fases
// (dealBreakers.js). Fases saltadas não aparecem.
// Espelho de src/db/checklistImovel.js (manter em sync).
import { FASES_IMOVEIS, limpaEstado, indiceFase, tipoFase } from './pipelineImoveis.ts'
import { fichaMaisRecente } from './dealBreakers.ts'

const n = v => {
  const x = parseFloat(String(v ?? '').replace(',', '.'))
  return Number.isFinite(x) ? x : 0
}
const tem = v => v !== null && v !== undefined && String(v).trim() !== ''
const fmtData = v => {
  if (!tem(v)) return null
  const d = new Date(v)
  return isNaN(d) ? String(v) : d.toLocaleDateString('pt-PT', { timeZone: 'Europe/Lisbon' })
}
const eur = v => `${new Intl.NumberFormat('pt-PT').format(Math.round(n(v)))} €`
const lista = v => {
  if (Array.isArray(v)) return v
  if (typeof v === 'string') { try { const j = JSON.parse(v); return Array.isArray(j) ? j : [] } catch { return [] } }
  return []
}
// Maior lista dentro de um objeto JSON (os comparáveis vêm aninhados).
function maiorLista(v) {
  if (typeof v === 'string') { try { v = JSON.parse(v) } catch { return 0 } }
  if (Array.isArray(v)) return v.length
  if (!v || typeof v !== 'object') return 0
  return Math.max(0, ...Object.entries(v).filter(([k]) => k !== 'meta').map(([, x]) => maiorLista(x)))
}

const campo = (ok, detalhe) => ({ ok: !!ok, detalhe: ok ? detalhe || null : null })
const fotosDe = d => lista(d.imovel.fotos).filter(f => f?.folder !== 'documentos')
const docSlot = (d, slot) => lista(d.imovel.fotos).some(f => f?.slot === slot)
const tarefa = (d, teste) => d.tarefas.find(t => teste(t.origem_campo || ''))
const visitaRegistada = d => fichaMaisRecente(d.visitas)

// onde: sítio do CRM onde o dado vive. abrir: o que a interface abre para o
// registar — { tab } da ficha do imóvel, { janela: 'visita' } ou { agendar }.
// manual: 'confirmar' (um clique) ou 'resposta' (escolha entre opcoes).
const ITENS = [
  // ── Pré-aprovação ──
  { fase: 'Pré-aprovação', key: 'pre_dados', titulo: 'Nome, link e origem do anúncio', onde: 'Ficha do imóvel', abrir: { tab: 'detalhe' },
    calc: d => campo(tem(d.imovel.nome) && tem(d.imovel.link) && tem(d.imovel.origem)) },
  { fase: 'Pré-aprovação', key: 'pre_caract', titulo: 'Preço, tipologia, zona e área', onde: 'Ficha do imóvel', abrir: { tab: 'detalhe' },
    calc: d => campo(n(d.imovel.ask_price) > 0 && tem(d.imovel.tipologia) && tem(d.imovel.zona) && n(d.imovel.area_bruta) > 0) },
  { fase: 'Pré-aprovação', key: 'pre_duplicado', titulo: 'Sem duplicados no pipeline', onde: 'Verificação automática pelo link',
    calc: d => ({ ok: d.duplicados === 0, detalhe: d.duplicados > 0 ? `${d.duplicados} imóvel(is) com o mesmo link` : null }) },

  // ── Adicionado ──
  { fase: 'Adicionado', key: 'add_chamada', titulo: 'Primeira chamada ao proprietário ou consultor', onde: 'Ficha do imóvel', abrir: { tab: 'detalhe' },
    calc: d => campo(tem(d.imovel.data_chamada), fmtData(d.imovel.data_chamada)) },
  { fase: 'Adicionado', key: 'add_motivo', titulo: 'Motivo de venda', onde: 'Ficha do imóvel', abrir: { tab: 'detalhe' },
    calc: d => campo(tem(d.imovel.motivo_venda_declarado), d.imovel.motivo_venda_declarado) },
  { fase: 'Adicionado', key: 'add_fotos', titulo: 'Fotos do anúncio guardadas', onde: 'Documentos', abrir: { tab: 'ficheiros' },
    calc: d => campo(fotosDe(d).length > 0, `${fotosDe(d).length} foto(s)`) },
  { fase: 'Adicionado', key: 'add_modelo', titulo: 'Modelo de negócio inicial', onde: 'Ficha do imóvel', abrir: { tab: 'detalhe' },
    calc: d => campo(tem(d.imovel.modelo_negocio), d.imovel.modelo_negocio) },
  { fase: 'Adicionado', key: 'm_aceita_abaixo', titulo: 'Aceita propostas abaixo do preço', manual: 'resposta', opcoes: ['Sim', 'Não', 'Não disse'] },

  // ── Chamada Não Atendida ──
  { fase: 'Chamada Não Atendida', key: 'cna_proxima', titulo: 'Próxima tentativa agendada', onde: 'Próximos passos', abrir: { agendar: 'chamada' },
    calc: d => { const t = tarefa(d, c => c === 'proxima_chamada'); return campo(!!t, t ? fmtData(t.inicio) : null) } },

  // ── Pendentes ──
  { fase: 'Pendentes', key: 'pend_data', titulo: 'Data de reativação agendada', onde: 'Próximos passos',
    calc: d => campo(tem(d.imovel.data_follow_up), fmtData(d.imovel.data_follow_up)) },

  // ── Necessidade de Visita ──
  { fase: 'Necessidade de Visita', key: 'nv_agendada', titulo: 'Visita agendada', onde: 'Visitas', abrir: { agendar: 'visita' },
    calc: d => { const v = d.visitas.find(x => x.estado !== 'cancelada'); return campo(!!v, v ? fmtData(v.data_hora) : null) } },

  // ── Visita Marcada ──
  { fase: 'Visita Marcada', key: 'vm_decisao', titulo: 'Visita realizada, com decisão', onde: 'Visitas', abrir: { janela: 'visita' },
    calc: d => { const f = visitaRegistada(d); return campo(f && tem(f.relatorio.decisao), f ? f.relatorio.decisao.replace('_', ' ') : null) } },
  { fase: 'Visita Marcada', key: 'vm_areas', titulo: 'Área medida na visita', onde: 'Visitas', abrir: { janela: 'visita' },
    calc: d => { const f = visitaRegistada(d); const ok = f && (n(f.areaMedida) > 0 || f.medicoes.some(m => n(m.m2) > 0)); return campo(ok, f && n(f.areaMedida) > 0 ? `${f.areaMedida} m²` : null) } },
  { fase: 'Visita Marcada', key: 'vm_obra', titulo: 'Custo de obra estimado', onde: 'Visitas', abrir: { janela: 'visita' },
    calc: d => { const f = visitaRegistada(d); return campo(f && tem(f.totalObra), f ? eur(f.totalObra) : null) } },
  { fase: 'Visita Marcada', key: 'vm_fotos', titulo: 'Fotos da visita (mínimo 15)', onde: 'Documentos', abrir: { tab: 'ficheiros' },
    calc: d => ({ ok: fotosDe(d).length >= 15, detalhe: `${fotosDe(d).length} de 15` }) },

  // ── Estudo de VVR ──
  { fase: 'Estudo de VVR', key: 'vvr_comparaveis', titulo: '3 comparáveis de venda na zona', onde: 'Análise Financeira', abrir: { tab: 'analise' },
    calc: d => { const c = maiorLista(d.analise?.comparaveis); return { ok: c >= 3, detalhe: `${c} de 3` } } },
  { fase: 'Estudo de VVR', key: 'vvr_valor', titulo: 'VVR definido', onde: 'Análise Financeira', abrir: { tab: 'analise' },
    calc: d => campo(n(d.imovel.valor_venda_remodelado) > 0, eur(d.imovel.valor_venda_remodelado)) },
  { fase: 'Estudo de VVR', key: 'vvr_analise', titulo: 'Análise ativa com valor de compra e meses de detenção', onde: 'Análise Financeira', abrir: { tab: 'analise' },
    calc: d => campo(d.analise && n(d.analise.compra) > 0 && n(d.analise.meses) > 0) },
  { fase: 'Estudo de VVR', key: 'vvr_retorno', titulo: 'Retorno calculado', onde: 'Análise Financeira', abrir: { tab: 'analise' },
    calc: d => campo(d.analise && tem(d.analise.retorno_total), d.analise ? `${Math.round(n(d.analise.retorno_total) * 10) / 10}%` : null) },

  // ── Criar Proposta ao Proprietário ──
  { fase: 'Criar Proposta ao Proprietário', key: 'cp_valor', titulo: 'Valor da proposta definido', onde: 'Ficha do imóvel', abrir: { tab: 'detalhe' },
    calc: d => campo(n(d.imovel.valor_proposta) > 0, eur(d.imovel.valor_proposta)) },
  { fase: 'Criar Proposta ao Proprietário', key: 'cp_modelo', titulo: 'Modelo de negócio definitivo', onde: 'Ficha do imóvel', abrir: { tab: 'detalhe' },
    calc: d => campo(tem(d.imovel.modelo_negocio), d.imovel.modelo_negocio) },

  // ── Enviar proposta ao Proprietário ──
  { fase: 'Enviar proposta ao Proprietário', key: 'ep_data', titulo: 'Proposta enviada', onde: 'Ficha do imóvel', abrir: { tab: 'detalhe' },
    calc: d => campo(tem(d.imovel.data_proposta), fmtData(d.imovel.data_proposta)) },
  { fase: 'Enviar proposta ao Proprietário', key: 'ep_followup', titulo: 'Follow-up agendado', onde: 'Próximos passos',
    calc: d => { const t = tarefa(d, c => c === 'data_follow_up'); return campo(!!t, t ? fmtData(t.inicio || t.data_limite) : null) } },
  { fase: 'Enviar proposta ao Proprietário', key: 'm_rececao', titulo: 'Receção da proposta confirmada por escrito', manual: 'confirmar' },

  // ── Em negociação ──
  { fase: 'Em negociação', key: 'm_contraproposta', titulo: 'Contraproposta do proprietário', manual: 'resposta', opcoes: ['Aceitou o valor', 'Fez contraproposta', 'Recusou', 'Sem resposta'] },
  { fase: 'Em negociação', key: 'neg_valor', titulo: 'Valor da proposta atualizado', onde: 'Ficha do imóvel', abrir: { tab: 'detalhe' },
    calc: d => campo(n(d.imovel.valor_proposta) > 0, eur(d.imovel.valor_proposta)) },

  // ── Proposta aceite ──
  { fase: 'Proposta aceite', key: 'pa_data', titulo: 'Data de aceitação', onde: 'Ficha do imóvel', abrir: { tab: 'detalhe' },
    calc: d => campo(tem(d.imovel.data_proposta_aceite), fmtData(d.imovel.data_proposta_aceite)) },
  { fase: 'Proposta aceite', key: 'pa_certidao', titulo: 'Certidão Permanente carregada', onde: 'Documentos', abrir: { tab: 'ficheiros' },
    calc: d => campo(docSlot(d, 'certidao_permanente')) },
  { fase: 'Proposta aceite', key: 'pa_caderneta', titulo: 'Caderneta Predial carregada', onde: 'Documentos', abrir: { tab: 'ficheiros' },
    calc: d => campo(docSlot(d, 'caderneta_predial')) },
  { fase: 'Proposta aceite', key: 'pa_imi', titulo: 'Comprovativo de IMI carregado', onde: 'Documentos', abrir: { tab: 'ficheiros' },
    calc: d => campo(docSlot(d, 'comprovativo_imi')) },
  { fase: 'Proposta aceite', key: 'm_onus', titulo: 'Ónus, hipotecas e penhoras verificados na certidão', manual: 'confirmar' },

  // ── Enviar proposta ao investidor ──
  { fase: 'Enviar proposta ao investidor', key: 'ei_envio', titulo: 'Dossier enviado a investidores', onde: 'Matching investidores', abrir: { tab: 'matching' },
    calc: d => campo(d.envios > 0, `${d.envios} envio(s) registado(s)`) },
  { fase: 'Enviar proposta ao investidor', key: 'ei_followup', titulo: 'Follow-up agendado', onde: 'Próximos passos',
    calc: d => { const t = tarefa(d, c => c === 'data_follow_up'); return campo(!!t, t ? fmtData(t.inicio || t.data_limite) : null) } },

  // ── Follow Up após proposta ──
  { fase: 'Follow Up após proposta', key: 'm_resposta_inv', titulo: 'Resposta dos investidores', manual: 'resposta', opcoes: ['Há interessado', 'Pedem mais informação', 'Sem interesse', 'Sem resposta'] },

  // ── Follow UP ──
  { fase: 'Follow UP', key: 'fu_motivo', titulo: 'Motivo do follow-up', onde: 'Próximos passos',
    calc: d => campo(tem(d.imovel.motivo_follow_up), d.imovel.motivo_follow_up) },
  { fase: 'Follow UP', key: 'fu_data', titulo: 'Data do follow-up agendada', onde: 'Próximos passos',
    calc: d => campo(tem(d.imovel.data_follow_up), fmtData(d.imovel.data_follow_up)) },

  // ── Fecho: o acompanhamento passa para Projetos ──
  ...['Wholesaling', 'CAEP', 'Fix and Flip'].flatMap(fase => [
    { fase, key: `${fase}_negocio`, titulo: 'Negócio criado em Projetos', onde: 'Projetos',
      calc: d => campo(d.negocios.length > 0, d.negocios[0]?.movimento) },
    { fase, key: `${fase}_lucro`, titulo: 'Lucro estimado do negócio', onde: 'Projetos',
      calc: d => campo(d.negocios.some(x => n(x.lucro_estimado) > 0), d.negocios[0] ? eur(d.negocios[0].lucro_estimado) : null) },
    { fase, key: 'm_capital_investidor', titulo: 'Comprovativo de capital do investidor visto', manual: 'confirmar' },
  ]),

  // ── Não interessa ──
  { fase: 'Não interessa', key: 'ni_motivo', titulo: 'Motivo de descarte', onde: 'Ficha do imóvel', abrir: { tab: 'detalhe' },
    calc: d => campo(tem(d.imovel.motivo_nao_interessa), d.imovel.motivo_nao_interessa) },
]

// Fases por onde o imóvel passou (histórico) mais a atual. Sem histórico,
// assume o caminho principal até à fase atual.
function fasesPercorridas(estadoAtual, historico) {
  const atual = limpaEstado(estadoAtual)
  const vistas = new Set([atual])
  for (const h of historico || []) {
    for (const a of lista(h.alteracoes)) {
      if (a?.campo === 'estado' && a.depois) vistas.add(limpaEstado(a.depois))
    }
  }
  if (vistas.size === 1) {
    const idx = indiceFase(atual), fecho = tipoFase(atual) === 'fecho'
    for (const f of FASES_IMOVEIS) {
      if (f.tipo === 'principal' && (fecho ? atual !== 'Não interessa' : indiceFase(f.nome) <= idx)) vistas.add(f.nome)
    }
  }
  return FASES_IMOVEIS.map(f => f.nome).filter(f => vistas.has(f))
}

// dados = { imovel, visitas, analise, tarefas, negocios, envios, duplicados, historico, manuais }
export function montarChecklist(dados) {
  const atual = limpaEstado(dados.imovel.estado)
  const manuais = new Map((dados.manuais || []).map(m => [m.template_key, m]))
  const grupos = fasesPercorridas(atual, dados.historico).map(fase => {
    const itens = ITENS.filter(i => i.fase === fase).map(i => {
      if (i.manual) {
        const m = manuais.get(i.key)
        const ok = !!m?.concluida
        return {
          key: i.key, titulo: i.titulo, estado: ok ? 'ok' : 'falta', origem: 'manual', manual: i.manual, opcoes: i.opcoes || null,
          detalhe: ok ? m.notas || null : null, por: ok ? m.concluida_por || null : null, em: ok ? m.concluida_em || null : null,
        }
      }
      let r
      try { r = i.calc(dados) } catch { r = { ok: false, detalhe: null } }
      return { key: i.key, titulo: i.titulo, estado: r.ok ? 'ok' : 'falta', origem: 'auto', detalhe: r.detalhe || null, onde: i.onde, abrir: i.abrir || null }
    })
    return { fase, atual: fase === atual, feitos: itens.filter(i => i.estado === 'ok').length, total: itens.length, itens }
  }).filter(g => g.total > 0)
  return { estado: atual, grupos }
}

export const itemManual = key => ITENS.find(i => i.manual && i.key === key) || null

export async function carregarChecklist(pool, imovelId) {
  const { rows: [imovel] } = await pool.query('SELECT * FROM imoveis WHERE id = $1', [imovelId])
  if (!imovel) return null
  const q = (sql, p) => pool.query(sql, p).then(r => r.rows).catch(() => [])
  const [visitas, analises, tarefas, negocios, envios, dup, historico, manuais] = await Promise.all([
    q('SELECT id, data_hora, created_at, estado, ficha FROM visitas WHERE imovel_id = $1', [imovelId]),
    q('SELECT compra, meses, retorno_total, comparaveis FROM analises WHERE imovel_id = $1 ORDER BY activa DESC, updated_at DESC LIMIT 1', [imovelId]),
    q("SELECT origem_campo, inicio, data_limite, status FROM tarefas WHERE origem_tipo = 'imovel' AND origem_id = $1 ORDER BY created_at DESC", [imovelId]),
    q('SELECT movimento, lucro_estimado FROM negocios WHERE imovel_id = $1 AND deleted_at IS NULL', [imovelId]),
    q('SELECT COUNT(*)::int AS c FROM documentos_investidor WHERE imovel_id = $1', [imovelId]),
    q("SELECT COUNT(*)::int AS c FROM imoveis WHERE link = $1 AND id <> $2 AND COALESCE(link, '') <> ''", [imovel.link, imovelId]),
    q("SELECT alteracoes FROM historico_alteracoes WHERE entidade = 'imoveis' AND entidade_id = $1", [imovelId]),
    q("SELECT template_key, concluida, concluida_por, concluida_em, notas FROM checklist_imovel WHERE imovel_id = $1 AND template_key LIKE 'm\\_%'", [imovelId]),
  ])
  return montarChecklist({
    imovel, visitas, analise: analises[0] || null, tarefas, negocios,
    envios: envios[0]?.c || 0, duplicados: dup[0]?.c || 0, historico, manuais,
  })
}

// Declaração manual (o que acontece fora do CRM): fica com quem e quando.
export async function gravarManual(pool, imovelId, key, { valor = null, desfazer = false, por = null } = {}) {
  const def = itemManual(key)
  if (!def) return { error: 'Item inválido' }
  if (!desfazer && def.manual === 'resposta' && !(def.opcoes || []).includes(valor)) return { error: 'Resposta inválida' }
  const agora = new Date().toISOString()
  await pool.query(
    `INSERT INTO checklist_imovel (id, imovel_id, estado, template_key, titulo, obrigatoria, concluida, concluida_por, concluida_em, notas, ordem, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, false, $6, $7, $8, $9, 0, $10, $10)
     ON CONFLICT (imovel_id, template_key) DO UPDATE SET
       concluida = EXCLUDED.concluida, concluida_por = EXCLUDED.concluida_por, concluida_em = EXCLUDED.concluida_em,
       notas = EXCLUDED.notas, updated_at = EXCLUDED.updated_at`,
    [globalThis.crypto.randomUUID(), imovelId, def.fase, key, def.titulo, !desfazer, desfazer ? null : por, desfazer ? null : agora, desfazer ? null : valor, agora]
  )
  return { ok: true }
}
