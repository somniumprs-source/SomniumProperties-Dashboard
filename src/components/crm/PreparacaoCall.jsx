/**
 * Preparação das calls com investidores (SOP 23 v2.1).
 *
 * - PreparacaoDocumento: o documento de uma call (dados do CRM + texto da IA),
 *   com o tipo calculado pelo histórico, correção manual, Regenerar e PDF.
 * - PreparacaoInvestidorTab: separador "Preparação" na ficha do investidor.
 * - PreparacaoTarefa: o mesmo documento dentro da tarefa (Agenda).
 * - PreparacaoSemana: todas as calls de investidores de uma semana, exportável
 *   para PDF com o layout Somnium.
 * Backend: /api/crm/preparacao-calls/* (supabase/functions/_shared/preparacaoCall.ts).
 */
import { useState, useEffect, useCallback, useRef } from 'react'
import { RefreshCw, FileDown, AlertTriangle, Loader2, ChevronLeft, ChevronRight, Sparkles, Quote } from 'lucide-react'
import { apiFetch } from '../../lib/api.js'
import { useToast } from '../ui/Toast.jsx'
import { Button } from '../ui/Button.jsx'
import { Badge } from '../ui/Badge.jsx'
import { useAuth } from '../../contexts/AuthContext.jsx'
import { linhasScorecardMao } from '../../../supabase/functions/_shared/classeInvestidor.js'

export const TIPO_CALL_LABEL = { cold_call: 'Cold Call', follow_up: 'Follow-up', discovery_call: 'Discovery Call', a_confirmar: 'A confirmar' }
const EM_CURSO = ['a_gerar', 'aguarda_resumos', 'pendente']
const DIAS = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado']
const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro']

const fmtData = (d) => (/^\d{4}-\d{2}-\d{2}/.test(d || '') ? `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}` : 'não registado')
const isoDia = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
function segundaDe(d) { const x = new Date(d); x.setHours(12, 0, 0, 0); x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); return x }

async function descarregarPdf(qs, toast) {
  try {
    const r = await apiFetch(`/api/crm/preparacao-calls/pdf?${qs}`, { timeoutMs: 120_000 })
    if (!r.ok) {
      const txt = await r.text(); let msg = `HTTP ${r.status}`
      try { msg = JSON.parse(txt).error || msg } catch { /* texto cru */ }
      throw new Error(msg)
    }
    const blob = await r.blob()
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = (r.headers.get('Content-Disposition') || '').match(/filename="([^"]+)"/)?.[1] || 'Preparacao_Calls_Investidores.pdf'
    document.body.appendChild(a); a.click(); a.remove()
    setTimeout(() => URL.revokeObjectURL(url), 60_000)
  } catch (e) { toast?.(e.message, 'error') }
}

function TipoBadge({ tipo }) {
  if (tipo === 'follow_up') return <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold tracking-wider bg-[#0D0D0D] text-[#C9A84C]">FOLLOW-UP</span>
  if (tipo === 'discovery_call') return <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold tracking-wider bg-[#0D0D0D] text-[#F8F3E6]">DISCOVERY</span>
  return <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold tracking-wider border border-ink-muted/60 text-ink">COLD CALL</span>
}
function ClasseBadge({ classe }) {
  if (!classe) return <span className="text-[10px] tracking-wider text-ink-muted">S/ CLASSE</span>
  const cor = classe === 'A' ? 'bg-[#C9A84C] text-[#0D0D0D]' : classe === 'B' ? 'bg-[#E7CF8A] text-[#0D0D0D]' : 'bg-surface-muted text-ink-muted'
  return <span className={`inline-flex items-center justify-center w-5 h-5 rounded text-[11px] font-serif ${cor}`}>{classe}</span>
}

function Linha({ rotulo, children }) {
  if (children == null || children === '' || (Array.isArray(children) && !children.length)) return null
  return (
    <div className="grid grid-cols-1 sm:grid-cols-[150px_1fr] gap-1 sm:gap-4 py-2.5 border-t border-dashed border-line first:border-t-0">
      <div className="text-[10px] font-semibold tracking-widest uppercase text-ink-muted pt-0.5">{rotulo}</div>
      <div className="text-sm text-ink leading-relaxed">{children}</div>
    </div>
  )
}
const Lista = ({ itens }) => (
  <ul className="space-y-1">{itens.map((t, i) => <li key={i} className="flex gap-2"><span className="text-[#C9A84C] mt-0.5">·</span><span>{t}</span></li>)}</ul>
)

// ── Documento de uma call ──────────────────────────────────────
export function PreparacaoDocumento({ prep, onAtualizar, compacto = false }) {
  const toast = useToast()
  const [busy, setBusy] = useState(null)
  const b = prep?.secoes_base || {}
  const h = b.cabecalho || {}
  const c = prep?.conteudo_json || null
  const follow = prep?.tipo_final && prep.tipo_final !== 'cold_call'

  async function regenerar() {
    setBusy('regenerar')
    try {
      const r = await apiFetch(`/api/crm/preparacao-calls/tarefa/${prep.tarefa_id}/regenerar`, { method: 'POST' })
      const j = await r.json().catch(() => ({}))
      if (!r.ok || j.error) throw new Error(j.error || 'Falha ao regenerar')
      onAtualizar?.(j)
      toast?.('Preparação em fila: o Mac gera o texto em poucos minutos.', 'success')
    } catch (e) { toast?.(e.message, 'error') }
    setBusy(null)
  }
  async function mudarTipo(tipo) {
    if (!tipo || tipo === prep.tipo_final) return
    setBusy('tipo')
    try {
      const r = await apiFetch(`/api/crm/preparacao-calls/tarefa/${prep.tarefa_id}/tipo`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ tipo }),
      })
      const j = await r.json().catch(() => ({}))
      if (!r.ok || j.error) throw new Error(j.error || 'Falha ao corrigir o tipo')
      onAtualizar?.(j)
      toast?.(`Tipo corrigido para ${TIPO_CALL_LABEL[tipo]}. Esta escolha já não é recalculada.`, 'success')
    } catch (e) { toast?.(e.message, 'error') }
    setBusy(null)
  }
  if (!prep) return null

  const historial = Array.isArray(c?.historial) && c.historial.length
    ? c.historial.map(e => `${fmtData(e.data)} · ${e.canal}: ${e.essencial}`)
    : (b.historial || []).map(e => `${fmtData(e.data)} · ${e.canal}: ${e.texto}`)
  const perguntas = Array.isArray(c?.perguntas) && c.perguntas.length ? c.perguntas : (b.dados_em_falta || []).map(x => `${x}?`)
  const correcoes = [
    ...(c?.correcoes_crm || []).map(x => `${x.campo}: ${x.atual ?? '—'} → ${x.correto}${x.fonte ? ` (${x.fonte})` : ''}`),
    ...(b.incoerencias || []).map(x => `${x.campo}: ${x.atual}. ${x.problema}`),
  ]
  const mud = b.mudou_somnium || { itens: [] }

  return (
    <div className={`rounded-lg border border-line bg-[#FBF7EC] dark:bg-surface-raised border-l-[3px] ${follow ? 'border-l-[#C9A84C]' : 'border-l-ink-muted/60'}`}>
      <div className="flex flex-wrap items-center gap-3 px-4 py-3 border-b border-line">
        <span className="font-serif text-lg text-[#C9A84C]">{h.hora || 'A confirmar'}</span>
        <span className="font-serif text-lg text-ink">{h.nome}</span>
        {h.telemovel
          ? <a href={`tel:${String(h.telemovel).replace(/\s/g, '')}`} className="text-sm font-medium text-[#C9A84C] hover:underline">{h.telemovel}</a>
          : <span className="text-xs text-ink-muted">sem telemóvel</span>}
        <span className="text-xs text-ink-muted">{fmtData(h.dia)}{h.responsavel ? ` · ${h.responsavel}` : ''}</span>
        <div className="ml-auto flex items-center gap-2">
          <TipoBadge tipo={prep.tipo_final} />
          <ClasseBadge classe={h.classe} />
        </div>
      </div>

      <div className="px-4 py-2 space-y-2">
        {prep.tipo_corrigido_em && prep.tipo_origem !== 'manual' && prep.tipo_agendado !== prep.tipo_final && (
          <div className="flex gap-2 items-start text-xs rounded-md bg-warning/10 border border-warning/30 text-warning px-3 py-2 mt-2">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span>Agendada como <b>{TIPO_CALL_LABEL[prep.tipo_agendado]}</b>, mas o histórico mostra <b>{TIPO_CALL_LABEL[prep.tipo_final]}</b>. A tarefa e o Google Calendar foram corrigidos. Se estiver errado, muda o tipo abaixo.</span>
          </div>
        )}
        {prep.tipo_calculado === 'a_confirmar' && prep.tipo_origem !== 'manual' && (
          <div className="flex gap-2 items-start text-xs rounded-md bg-warning/10 border border-warning/30 text-warning px-3 py-2 mt-2">
            <AlertTriangle className="w-4 h-4 shrink-0" /><span>Tipo a confirmar: {prep.motivo_classificacao}</span>
          </div>
        )}
        {EM_CURSO.includes(prep.estado) && (
          <div className="flex gap-2 items-center text-xs text-ink-muted mt-2">
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
            {prep.estado === 'aguarda_resumos' ? 'A resumir as transcrições das reuniões antes de preparar a call (Mac).' : 'Texto em preparação no Mac. Por agora, só os dados do CRM.'}
          </div>
        )}
        {prep.estado === 'erro' && (
          <div className="text-xs rounded-md bg-danger/10 border border-danger/30 text-danger px-3 py-2 mt-2">A IA falhou ({prep.erro || 'sem detalhe'}). O documento mostra só os dados do CRM. Usa "Regenerar" para tentar de novo.</div>
        )}
        {prep.estado === 'desatualizado' && (
          <div className="text-xs text-ink-muted mt-2">Houve novidades no CRM desde que isto foi gerado. É regenerado na véspera da call, ou já, com "Regenerar".</div>
        )}

        <Linha rotulo="Tipo de call">
          <span>{h.motivo}</span>
          {h.lead_quente && prep.tipo_final === 'cold_call' && <Badge tone="gold" className="ml-2">Lead quente</Badge>}
        </Linha>
        <Linha rotulo="Cabeçalho">
          Classe {h.classe || 's/ classe'}{h.pontuacao != null ? ` (${h.pontuacao} pts)` : ''} · Capital {h.capital} · Estado {h.status || 'não registado'} · Origem {h.origem || 'não registada'}
        </Linha>
        <Linha rotulo="Quem é">{c?.quem_e || 'não registado'}</Linha>
        <Linha rotulo="Perfil declarado">{b.perfil_declarado}</Linha>
        <Linha rotulo={follow ? 'Historial' : 'Origem'}>{historial.length ? <Lista itens={compacto ? historial.slice(-4) : historial} /> : 'Sem contactos registados.'}</Linha>
        {Array.isArray(c?.combinado) && c.combinado.length > 0 && (
          <Linha rotulo="O que ficou combinado">
            <ul className="space-y-1.5">{c.combinado.map((x, i) => (
              <li key={i}>
                <b className="font-medium">{x.quem === 'somnium' ? 'Somnium' : 'Investidor'}:</b> {x.o_que}{x.quando ? ` (${x.quando})` : ''}
                {x.citacao && <span className="block text-ink-muted italic text-xs mt-0.5"><Quote className="w-3 h-3 inline mr-1" />{x.citacao}</span>}
              </li>
            ))}</ul>
          </Linha>
        )}
        {Array.isArray(c?.objecoes_alertas) && c.objecoes_alertas.length > 0 && <Linha rotulo="Objeções e alertas"><Lista itens={c.objecoes_alertas.map(x => x.texto)} /></Linha>}
        {follow && (
          <Linha rotulo="O que mudou na Somnium">
            {mud.itens?.length
              ? <Lista itens={mud.itens.map(m => `${m.nome}${m.modelo ? ` (${m.modelo}${m.regiao ? `, ${m.regiao}` : ''})` : ''}: ${m.eventos.map(e => `${e.texto} a ${fmtData(e.data)}`).join('; ')}`)} />
              : `Sem negócios novos nem mudanças de fase desde ${fmtData(mud.desde)}.`}
          </Linha>
        )}
        <Linha rotulo="Abertura">{c?.abertura}</Linha>
        {Array.isArray(c?.antes_de_ligar) && c.antes_de_ligar.length > 0 && <Linha rotulo="Antes de ligar"><Lista itens={c.antes_de_ligar} /></Linha>}
        {Array.isArray(c?.scorecard_mao) && c.scorecard_mao.length > 0 && <Linha rotulo="Scorecard à mão (4.10)"><Lista itens={linhasScorecardMao(c.scorecard_mao)} /></Linha>}
        <Linha rotulo="Perguntas e dados em falta">{perguntas.length ? <Lista itens={perguntas} /> : 'Ficha completa.'}</Linha>
        <Linha rotulo="Objetivo">
          {c?.objetivo || (prep.tipo_final === 'discovery_call' ? 'Discovery: via definida, classe A–D proposta e apresentação marcada.' : prep.tipo_final === 'follow_up' ? 'Recontacto: ver se o que faltava mudou e marcar a discovery.' : 'Chamada 1: marcar a discovery no máximo a 48 horas, com o decisor.')}
          {c?.proximo_passo && <span className="block mt-1 text-ink-muted">Próximo passo: {c.proximo_passo}</span>}
        </Linha>
        {Array.isArray(b.guiao) && b.guiao.length > 0 && (
          <Linha rotulo="Guião (SOP 23, Anexo A)">
            <details open={!compacto}>
              <summary className="cursor-pointer text-xs text-ink-muted select-none">Mostrar / esconder o guião completo</summary>
              <div className="mt-2 space-y-1.5">
                {b.guiao.map((g, i) => g.t === 'titulo'
                  ? <p key={i} className="text-xs font-semibold text-ink uppercase tracking-wide">{g.x}</p>
                  : g.t === 'nota'
                    ? <p key={i} className="text-xs text-ink-muted italic">[{g.x}]</p>
                    : <p key={i} className="text-sm text-ink">"{g.x}"</p>)}
              </div>
            </details>
          </Linha>
        )}
        {correcoes.length > 0 && <Linha rotulo="Correções ao CRM"><Lista itens={correcoes} /></Linha>}
      </div>

      <div className="flex flex-wrap items-center gap-2 px-4 py-3 border-t border-line">
        <label className="text-xs text-ink-muted">Tipo</label>
        <select value={prep.tipo_final || ''} disabled={busy === 'tipo'} onChange={e => mudarTipo(e.target.value)}
          className="border border-line bg-surface-raised text-ink rounded-md px-2 py-1 text-xs">
          {['cold_call', 'follow_up', 'discovery_call'].map(t => <option key={t} value={t}>{TIPO_CALL_LABEL[t]}</option>)}
        </select>
        {prep.tipo_origem === 'manual' && <span className="text-[11px] text-ink-muted">corrigido à mão</span>}
        <div className="ml-auto flex gap-2">
          <Button size="sm" variant="secondary" icon={FileDown}
            onClick={() => { const d = h.dia || isoDia(new Date()); descarregarPdf(`desde=${d}&ate=${d}&tarefa=${prep.tarefa_id}`, toast) }}>PDF</Button>
          <Button size="sm" variant="secondary" icon={RefreshCw} loading={busy === 'regenerar'} onClick={regenerar}>Regenerar</Button>
        </div>
      </div>
      {prep.gerado_em && <p className="px-4 pb-3 text-[11px] text-ink-muted"><Sparkles className="w-3 h-3 inline mr-1" />Gerado a {new Date(prep.gerado_em).toLocaleString('pt-PT')} a partir do CRM.</p>}
    </div>
  )
}

// Recarrega enquanto o Mac ainda está a gerar.
function usePolling(ativo, fn, ms = 15000) {
  const ref = useRef(fn); ref.current = fn
  useEffect(() => {
    if (!ativo) return
    const t = setInterval(() => ref.current(), ms)
    return () => clearInterval(t)
  }, [ativo, ms])
}

// ── Separador "Preparação" na ficha do investidor ─────────────
export function PreparacaoInvestidorTab({ investidorId }) {
  const [lista, setLista] = useState(null)
  const [erro, setErro] = useState(null)
  const carregar = useCallback(async () => {
    try {
      const r = await apiFetch(`/api/crm/investidores/${investidorId}/preparacoes`)
      const j = await r.json()
      if (!r.ok || j.error) throw new Error(j.error || 'Falha ao carregar')
      setLista(Array.isArray(j) ? j : []); setErro(null)
    } catch (e) { setErro(e.message) }
  }, [investidorId])
  useEffect(() => { carregar() }, [carregar])
  usePolling(!!lista?.some(p => EM_CURSO.includes(p.estado)), carregar)

  if (erro) return <p className="text-sm text-danger">{erro}</p>
  if (!lista) return <div className="flex items-center gap-2 text-sm text-ink-muted"><Loader2 className="w-4 h-4 animate-spin" />A carregar a preparação</div>
  if (!lista.length) return <p className="text-sm text-ink-muted">Sem calls agendadas com este investidor. Ao marcar o próximo contacto, a preparação é gerada automaticamente.</p>
  const abertas = lista.filter(p => !['Concluída', 'Concluida'].includes(p.tarefa_status))
  const antigas = lista.filter(p => ['Concluída', 'Concluida'].includes(p.tarefa_status))
  return (
    <div className="space-y-4">
      {abertas.map(p => <PreparacaoDocumento key={p.id} prep={p} onAtualizar={carregar} />)}
      {antigas.length > 0 && (
        <details className="text-sm">
          <summary className="cursor-pointer text-ink-muted">Preparações de calls já feitas ({antigas.length})</summary>
          <div className="space-y-4 mt-3">{antigas.map(p => <PreparacaoDocumento key={p.id} prep={p} onAtualizar={carregar} compacto />)}</div>
        </details>
      )}
    </div>
  )
}

// ── Dentro da tarefa (Agenda) ─────────────────────────────────
export function PreparacaoTarefa({ tarefaId }) {
  const [prep, setPrep] = useState(null)
  const [erro, setErro] = useState(null)
  const carregar = useCallback(async () => {
    try {
      const r = await apiFetch(`/api/crm/preparacao-calls/tarefa/${tarefaId}`)
      const j = await r.json()
      if (!r.ok || j.error) throw new Error(j.error || 'Falha ao carregar')
      setPrep(j); setErro(null)
    } catch (e) { setErro(e.message) }
  }, [tarefaId])
  useEffect(() => { carregar() }, [carregar])
  usePolling(!!prep && EM_CURSO.includes(prep.estado), carregar)
  if (erro) return <p className="text-xs text-danger">{erro}</p>
  if (!prep) return <div className="flex items-center gap-2 text-xs text-ink-muted"><Loader2 className="w-3.5 h-3.5 animate-spin" />A preparar a call</div>
  return <PreparacaoDocumento prep={prep} onAtualizar={(p) => (p ? setPrep(p) : carregar())} compacto />
}

// ── Preparação da semana (Agenda) ─────────────────────────────
export function PreparacaoSemana() {
  const toast = useToast()
  const [seg, setSeg] = useState(() => {
    const hoje = new Date()
    // Ao fim de semana mostra já a semana seguinte.
    const s = segundaDe(hoje)
    if ([0, 6].includes(hoje.getDay())) s.setDate(s.getDate() + 7)
    return s
  })
  const [dados, setDados] = useState(null)
  const [erro, setErro] = useState(null)
  // Cada um vê as calls que agendou; administradores podem ver todas.
  const { role } = useAuth() || {}
  const [todas, setTodas] = useState(false)
  const desde = isoDia(seg)
  const ate = isoDia(new Date(seg.getTime() + 6 * 86400000))
  const filtroQs = todas ? '&todas=1' : ''
  const carregar = useCallback(async () => {
    try {
      const r = await apiFetch(`/api/crm/preparacao-calls?desde=${desde}&ate=${ate}${filtroQs}`, { timeoutMs: 120_000 })
      const j = await r.json()
      if (!r.ok || j.error) throw new Error(j.error || 'Falha ao carregar')
      setDados(j); setErro(null)
    } catch (e) { setErro(e.message) }
  }, [desde, ate, filtroQs])
  useEffect(() => { setDados(null); carregar() }, [carregar])
  usePolling(!!dados?.preparacoes?.some(p => EM_CURSO.includes(p.estado)), carregar, 20000)

  const preps = dados?.preparacoes || []
  const follow = preps.filter(p => p.tipo_final !== 'cold_call').length
  const porDia = []
  for (const p of preps) {
    const d = p.secoes_base?.cabecalho?.dia || 'sem data'
    let g = porDia.find(x => x.dia === d)
    if (!g) porDia.push(g = { dia: d, itens: [] })
    g.itens.push(p)
  }
  const corrigidas = preps.filter(p => p.tipo_corrigido_em && p.tipo_origem !== 'manual' && p.tipo_agendado !== p.tipo_final)
  const mud = dados?.mudou_somnium || { itens: [] }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" variant="secondary" icon={ChevronLeft} onClick={() => setSeg(s => new Date(s.getTime() - 7 * 86400000))} aria-label="Semana anterior" />
        <span className="text-sm font-medium text-ink">{fmtData(desde)} a {fmtData(ate)}</span>
        <Button size="sm" variant="secondary" icon={ChevronRight} onClick={() => setSeg(s => new Date(s.getTime() + 7 * 86400000))} aria-label="Semana seguinte" />
        <div className="ml-auto flex flex-wrap gap-2">
          {role === 'admin' && (
            <div className="inline-flex rounded-md border border-line overflow-hidden text-xs">
              {[[false, 'Minhas'], [true, 'Todas']].map(([v, l]) => (
                <button key={l} type="button" onClick={() => setTodas(v)}
                  className={`px-3 py-1.5 ${todas === v ? 'bg-[#0D0D0D] text-[#C9A84C]' : 'bg-surface-raised text-ink-muted hover:text-ink'}`}>{l}</button>
              ))}
            </div>
          )}
          <Button size="sm" variant="secondary" icon={RefreshCw} onClick={carregar}>Atualizar</Button>
          <Button size="sm" icon={FileDown} disabled={!preps.length} onClick={() => descarregarPdf(`desde=${desde}&ate=${ate}${filtroQs}`, toast)}>Exportar PDF</Button>
        </div>
      </div>

      {erro && <p className="text-sm text-danger">{erro}</p>}
      {!dados && !erro && <div className="flex items-center gap-2 text-sm text-ink-muted"><Loader2 className="w-4 h-4 animate-spin" />A juntar as calls da semana</div>}

      {dados && (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-px bg-[#2A2620] rounded-lg overflow-hidden">
            {[[preps.length, 'Calls'], [follow, 'Follow-ups'], [preps.length - follow, 'Cold calls'], [preps.filter(p => p.classificacao === 'A').length, 'Classe A']].map(([v, l]) => (
              <div key={l} className="bg-[#0D0D0D] px-4 py-3">
                <div className="font-serif text-2xl text-[#C9A84C]">{v}</div>
                <div className="text-[10px] tracking-widest uppercase text-[#BDB39C]">{l}</div>
              </div>
            ))}
          </div>

          {corrigidas.length > 0 && (
            <div className="flex gap-2 items-start text-sm rounded-md bg-warning/10 border border-warning/30 text-warning px-3 py-2">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{corrigidas.length} call{corrigidas.length === 1 ? '' : 's'} com o tipo corrigido pelo histórico: {corrigidas.map(p => `${p.investidor_nome} (${TIPO_CALL_LABEL[p.tipo_agendado]} → ${TIPO_CALL_LABEL[p.tipo_final]})`).join(', ')}.</span>
            </div>
          )}

          {preps.length === 0 ? <p className="text-sm text-ink-muted">{todas ? 'Sem calls com investidores nesta semana.' : 'Sem calls com investidores agendadas por ti nesta semana.'}</p> : (
            <div className="overflow-x-auto rounded-lg border border-line">
              <table className="w-full text-sm">
                <thead className="bg-[#0D0D0D] text-[#C9A84C] text-[10px] tracking-widest uppercase">
                  <tr>{['Dia', 'Hora', 'Investidor', 'Tipo', 'Classe', 'Capital', 'Objetivo da call'].map(c => <th key={c} className="text-left font-semibold px-3 py-2">{c}</th>)}</tr>
                </thead>
                <tbody>
                  {preps.map((p, i) => {
                    const h = p.secoes_base?.cabecalho || {}
                    const novoDia = i === 0 || preps[i - 1].secoes_base?.cabecalho?.dia !== h.dia
                    const d = h.dia ? new Date(`${h.dia}T12:00:00`) : null
                    return (
                      <tr key={p.id} className="border-t border-line odd:bg-surface-muted/40">
                        <td className="px-3 py-2 font-serif text-[#C9A84C] whitespace-nowrap">{novoDia && d ? `${DIAS[d.getDay()].slice(0, 3)} ${d.getDate()}` : ''}</td>
                        <td className="px-3 py-2 whitespace-nowrap">{h.hora || 'a confirmar'}</td>
                        <td className="px-3 py-2 font-medium whitespace-nowrap">{p.investidor_nome}</td>
                        <td className="px-3 py-2"><TipoBadge tipo={p.tipo_final} /></td>
                        <td className="px-3 py-2"><ClasseBadge classe={p.classificacao} /></td>
                        <td className="px-3 py-2 whitespace-nowrap">{h.capital}</td>
                        <td className="px-3 py-2 text-ink-muted">{p.conteudo_json?.objetivo_curto || (EM_CURSO.includes(p.estado) ? <span className="inline-flex items-center gap-1"><Loader2 className="w-3 h-3 animate-spin" />em preparação</span> : '')}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}

          {follow > 0 && (
            <div className="rounded-lg bg-[#0D0D0D] text-[#E9E4D6] px-5 py-4">
              <div className="text-[10px] tracking-widest uppercase text-[#C9A84C]">Motivos para o follow-up</div>
              <div className="font-serif text-lg text-white mt-1 mb-2">O que mudou na Somnium{mud.desde ? ` desde ${fmtData(mud.desde)}` : ''}</div>
              {mud.itens?.length ? (
                <ul className="space-y-1.5 text-sm">{mud.itens.map(m => (
                  <li key={m.negocio_id} className="flex gap-2"><span className="text-[#C9A84C]">◆</span>
                    <span><b className="text-[#E8D9A8] font-semibold">{m.nome}{m.modelo ? ` (${m.modelo}${m.regiao ? `, ${m.regiao}` : ''})` : ''}.</b> {m.eventos.map(e => `${e.texto} a ${fmtData(e.data)}`).join('; ')}.{m.venda_prevista ? ` Venda prevista para ${fmtData(m.venda_prevista)}.` : ''}</span>
                  </li>
                ))}</ul>
              ) : <p className="text-sm">Sem negócios novos nem mudanças de fase registadas no CRM.</p>}
              <p className="text-[11px] text-[#A39A84] mt-3">Só dados do CRM. Não dar nomes nem montantes de outros investidores.</p>
            </div>
          )}

          {porDia.map(g => {
            const d = g.dia !== 'sem data' ? new Date(`${g.dia}T12:00:00`) : null
            return (
              <section key={g.dia} className="space-y-3">
                <div className="flex items-baseline gap-3 border-b-2 border-[#C9A84C] pb-2">
                  <span className="text-[10px] tracking-widest uppercase text-[#C9A84C]">{d ? DIAS[d.getDay()] : 'Sem data'}</span>
                  <span className="font-serif text-xl text-ink">{d ? `${d.getDate()} de ${MESES[d.getMonth()]}` : ''}</span>
                  <span className="ml-auto text-[10px] tracking-widest uppercase text-ink-muted">{g.itens.length} call{g.itens.length === 1 ? '' : 's'}</span>
                </div>
                {g.itens.map(p => <PreparacaoDocumento key={p.id} prep={{ ...p, secoes_base: { ...p.secoes_base, cabecalho: { ...p.secoes_base?.cabecalho, classe: p.classificacao ?? p.secoes_base?.cabecalho?.classe } } }} onAtualizar={carregar} compacto />)}
              </section>
            )
          })}
        </>
      )}
    </div>
  )
}
