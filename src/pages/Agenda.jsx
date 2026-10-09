/**
 * Agenda — espelho do Google Calendar + registo das operações (revisão 04/10/2026).
 *
 * Decisão do utilizador: a Agenda mostra só o que é criado manualmente, na app ou
 * no Google Calendar (um único calendário partilhado, sem distinção de pessoa). É
 * aqui que se assinala quem fez o quê, o estado e as horas. Deixou de haver blocos
 * de disponibilidade, fila automática e catálogo de recorrentes (o motor em
 * agendaEngine está desligado); o que é recorrente cria-se no Google Calendar.
 *
 * Dados: tabela `tarefas` (sincronizada com o GCal por /api/calendar/sync) +
 * eventos lidos em directo do GCal que ainda não são tarefa (ex.: recorrentes).
 * As horas guardadas em `inicio`/`fim` são tratadas como hora local (AAAA-MM-DDTHH:MM).
 */
import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import {
  CalendarClock, ListChecks, ChevronLeft, ChevronRight, RefreshCw, Plus, Trash2, Check, Inbox, ExternalLink,
} from 'lucide-react'
import { Header } from '../components/layout/Header.jsx'
import { PageSkeleton } from '../components/ui/Skeleton.jsx'
import { apiFetch } from '../lib/api.js'
import { Tabs } from '../components/ui/Tabs.jsx'
import { Button } from '../components/ui/Button.jsx'
import { Modal } from '../components/ui/Modal.jsx'
import { ScrollableTable } from '../components/ui/ScrollableTable.jsx'
import { useToast } from '../components/ui/Toast.jsx'
import { useUrlState } from '../hooks/useUrlState.js'
import { REGIOES } from '../constants.js'

const FUNCIONARIOS = ['João Abreu', 'Alexandre Mendes']
const AMBOS = 'João Abreu, Alexandre Mendes'
const CATEGORIAS = [
  'Cold Call', 'Pesquisa de Imóveis', 'Estudo de Mercado',
  'Follow Up Consultores', 'Follow Up Investidores',
  'Reunião Investidores', 'Reunião de Equipa Somnium',
  'Reunião com Parceiros', 'Visita', 'Visita a Obra', 'Proposta',
  'Apresentação de Negócios', 'Negociações',
  'SOP / Formação', 'Planeamento', 'Implementação com IA',
  'Análise de Negócio', 'Contacto Consultores',
  'Networking / Eventos', 'Gestão Financeira', 'Outros',
]
const CATEGORIAS_COM_REGIAO = new Set([
  'Cold Call', 'Pesquisa de Imóveis', 'Estudo de Mercado', 'Follow Up Consultores', 'Contacto Consultores',
  'Visita', 'Visita a Obra', 'Análise de Negócio', 'Proposta', 'Negociações',
  'Apresentação de Negócios', 'Networking / Eventos',
])
const STATUS_OPTIONS = ['A fazer', 'Em andamento', 'Concluída', 'Atrasada']
const STATUS_COLOR = { 'A fazer': 'bg-gray-100 text-gray-600', 'Em andamento': 'bg-blue-100 text-blue-700', 'Concluída': 'bg-green-100 text-green-700', 'Atrasada': 'bg-red-100 text-red-600' }
const concluida = t => t.status === 'Concluída' || t.status === 'Concluida'
const HRS = v => v == null ? '—' : `${Number(v).toFixed(1)}h`

// ── Tempo (hora local em texto) ──────────────────────────────────
const HORA_INI = 7, HORA_FIM = 22, PX_MIN = 0.8, SNAP = 15
const p2 = n => String(n).padStart(2, '0')
const isoDia = d => `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`
const diaDe = s => (s || '').slice(0, 10)
const temHora = s => typeof s === 'string' && s.length > 10 && s[10] === 'T'
const minDe = s => temHora(s) ? Number(s.slice(11, 13)) * 60 + Number(s.slice(14, 16)) : null
const hhmm = m => `${p2(Math.floor(m / 60))}:${p2(m % 60)}`
const local = (dia, m) => `${dia}T${hhmm(m)}`
function segunda(d) { const x = new Date(d); x.setHours(0, 0, 0, 0); x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); return x }
function maisDias(d, n) { const x = new Date(d); x.setDate(x.getDate() + n); return x }
function calcHoras(inicio, fim) {
  if (!temHora(inicio) || !temHora(fim)) return null
  const ms = new Date(fim.slice(0, 16)) - new Date(inicio.slice(0, 16))
  return ms > 0 ? Math.round(ms / 36000) / 100 : null
}

function corResponsavel(func) {
  const j = (func || '').includes('João'), a = (func || '').includes('Alexandre')
  if (j && a) return 'bg-emerald-100 border-emerald-400 text-emerald-900'
  if (j) return 'bg-amber-100 border-amber-400 text-amber-900'
  if (a) return 'bg-indigo-100 border-indigo-400 text-indigo-900'
  return 'bg-gray-100 border-gray-400 text-gray-700'
}

// ════════════════════════════════════════════════════════════════
export function Agenda({ embutido = false }) {
  const toast = useToast()
  const [tab, setTab] = useUrlState('tab', 'calendario')
  const [tarefas, setTarefas] = useState([])
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [ultimaSync, setUltimaSync] = useState(null)
  const [modal, setModal] = useState(null) // { tarefa?, inicial }
  const [saving, setSaving] = useState(false)
  const syncTimer = useRef(null)

  const carregar = useCallback(async () => {
    try {
      const r = await apiFetch('/api/tarefas?limit=1000')
      const j = await r.json()
      if (j.error) throw new Error(j.error)
      setTarefas(j.data || [])
    } catch (e) { toast?.(e.message, 'error') }
    setLoading(false)
  }, [toast])

  // Push + pull com o Google Calendar. `desde` cobre a semana visível mais antiga.
  const sincronizar = useCallback(async ({ silencioso = false, desde } = {}) => {
    setSyncing(true)
    try {
      const since = desde || isoDia(segunda(new Date()))
      const r = await apiFetch(`/api/calendar/sync?since=${since}&days=45`, { method: 'POST' })
      const j = await r.json().catch(() => ({}))
      if (!r.ok || j.error) throw new Error(j.error || 'Falha na sincronização com o Google Calendar')
      setUltimaSync(new Date())
      await carregar()
      if (!silencioso) toast?.('Google Calendar sincronizado', 'success')
    } catch (e) { if (!silencioso) toast?.(e.message, 'error') }
    setSyncing(false)
  }, [carregar, toast])

  useEffect(() => {
    carregar().then(() => sincronizar({ silencioso: true }))
    const t = setInterval(() => sincronizar({ silencioso: true }), 5 * 60 * 1000)
    return () => clearInterval(t)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Depois de cada alteração na app: recarrega já e envia para o GCal pouco depois.
  const aposAlterar = useCallback(async (desde) => {
    await carregar()
    clearTimeout(syncTimer.current)
    syncTimer.current = setTimeout(() => sincronizar({ silencioso: true, desde }), 1500)
  }, [carregar, sincronizar])

  const guardar = useCallback(async (tarefa, dados) => {
    const payload = { ...dados }
    if ((payload.tempo_horas === '' || payload.tempo_horas == null) && payload.inicio && payload.fim) {
      const h = calcHoras(payload.inicio, payload.fim); if (h != null) payload.tempo_horas = h
    }
    const r = await apiFetch(tarefa?.id ? `/api/tarefas/${tarefa.id}` : '/api/tarefas', {
      method: tarefa?.id ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
    })
    const j = await r.json().catch(() => ({}))
    if (!r.ok || j.error) throw new Error(j.error || 'Falha ao guardar')
    await aposAlterar(diaDe(payload.inicio) || undefined)
  }, [aposAlterar])

  const eliminar = useCallback(async (tarefa) => {
    // Em produção o DELETE da tarefa não apaga o evento: apaga-se primeiro no GCal,
    // senão o próximo pull voltava a criar a tarefa.
    if (tarefa.gcal_event_id) {
      await apiFetch(`/api/calendar/events/${encodeURIComponent(tarefa.gcal_event_id)}`, { method: 'DELETE' }).catch(() => {})
    }
    const r = await apiFetch(`/api/tarefas/${tarefa.id}`, { method: 'DELETE' })
    if (!r.ok) throw new Error('Falha ao eliminar')
    await carregar()
  }, [carregar])

  const accao = useCallback(async (fn) => {
    try { await fn() } catch (e) { toast?.(e.message, 'error') }
  }, [toast])

  async function guardarModal(dados) {
    setSaving(true)
    try { await guardar(modal.tarefa, dados); setModal(null) } catch (e) { toast?.(e.message, 'error') }
    setSaving(false)
  }

  return (
    <>
      {!embutido && <Header title="Agenda" subtitle="Google Calendar e registo das operações da equipa" />}
      <div className={embutido ? 'space-y-4' : 'p-4 sm:p-6 space-y-4'}>
        <div className="flex flex-wrap items-center gap-3">
          <Tabs
            variant="segmented"
            items={[
              { key: 'calendario', label: 'Calendário', icon: CalendarClock },
              { key: 'tarefas', label: 'Tarefas', icon: ListChecks },
            ]}
            value={tab}
            onChange={setTab}
          />
          <div className="ml-auto flex items-center gap-2">
            {ultimaSync && <span className="text-xs text-gray-400 hidden sm:inline">Sincronizado às {hhmm(ultimaSync.getHours() * 60 + ultimaSync.getMinutes())}</span>}
            <button onClick={() => sincronizar()} disabled={syncing}
              className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg bg-blue-50 text-blue-700 hover:bg-blue-100 disabled:opacity-50">
              <RefreshCw className={`w-3.5 h-3.5 ${syncing ? 'animate-spin' : ''}`} /> Sincronizar Google Calendar
            </button>
            <Button onClick={() => setModal({ inicial: {} })}><Plus className="w-4 h-4" /> Nova tarefa</Button>
          </div>
        </div>

        {loading ? <PageSkeleton /> : tab === 'calendario'
          ? <CalendarioTab tarefas={tarefas} guardar={guardar} accao={accao} abrir={setModal} sincronizar={sincronizar} />
          : <TarefasTab tarefas={tarefas} guardar={guardar} eliminar={eliminar} accao={accao} abrir={setModal} />}
      </div>

      {modal && (
        <TarefaModal modal={modal} saving={saving} onClose={() => setModal(null)} onSave={guardarModal}
          onDelete={modal.tarefa?.id ? () => accao(async () => { await eliminar(modal.tarefa); setModal(null) }) : null} />
      )}
    </>
  )
}

// ════════════════════════════════════════════════════════════════
// Modal de tarefa (criar, editar, atribuir quem fez, concluir)
// ════════════════════════════════════════════════════════════════
function TarefaModal({ modal, saving, onClose, onSave, onDelete }) {
  const t = modal.tarefa
  const [f, setF] = useState(() => ({
    tarefa: '', status: 'A fazer', categoria: '', regiao: '', funcionario: '', tempo_horas: '',
    ...(t || {}), ...(modal.inicial || {}),
    inicio: ((modal.inicial?.inicio ?? t?.inicio) || '').slice(0, 16),
    fim: ((modal.inicial?.fim ?? t?.fim) || '').slice(0, 16),
  }))
  const set = (k, v) => setF(p => {
    const n = { ...p, [k]: v }
    if ((k === 'inicio' || k === 'fim') && n.inicio && n.fim) { const h = calcHoras(n.inicio, n.fim); if (h != null) n.tempo_horas = h }
    if (k === 'categoria' && !CATEGORIAS_COM_REGIAO.has(v)) n.regiao = ''
    return n
  })
  const campo = 'w-full border border-gray-200 dark:border-neutral-700 dark:bg-neutral-900 rounded-lg px-3 py-2 text-sm'
  const rotulo = 'text-xs text-gray-500 block mb-1'
  const doGoogle = modal.inicial?.gcal_event_id && !t?.id
  function submeter(extra = {}) {
    const d = { ...f, ...extra }
    onSave({
      tarefa: d.tarefa.trim(), status: d.status, categoria: d.categoria || null, regiao: d.regiao || '',
      funcionario: d.funcionario || null, inicio: d.inicio || null, fim: d.fim || null, tempo_horas: d.tempo_horas,
      ...(doGoogle ? { gcal_event_id: modal.inicial.gcal_event_id } : {}),
    })
  }
  return (
    <Modal open onClose={onClose} size="lg"
      title={t?.id ? 'Editar tarefa' : doGoogle ? 'Registar evento do Google Calendar' : 'Nova tarefa'}
      subtitle={doGoogle ? 'Passa a tarefa do CRM, ligada ao mesmo evento' : 'Com hora marcada, aparece no Google Calendar'}
      footer={
        <Modal.Footer>
          {onDelete && <Button variant="secondary" onClick={() => { if (window.confirm('Eliminar esta tarefa (e o evento no Google Calendar)?')) onDelete() }}><Trash2 className="w-4 h-4" /> Eliminar</Button>}
          <Button variant="secondary" onClick={onClose}>Cancelar</Button>
          {t?.id && !concluida(t) && <Button variant="secondary" onClick={() => submeter({ status: 'Concluída' })} loading={saving} disabled={!f.categoria}><Check className="w-4 h-4" /> Concluir</Button>}
          <Button variant="primary" onClick={() => submeter()} loading={saving} disabled={!f.tarefa.trim() || !f.categoria}>Guardar</Button>
        </Modal.Footer>
      }>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="sm:col-span-2">
          <label className={rotulo}>Tarefa *</label>
          <input autoFocus value={f.tarefa} onChange={e => set('tarefa', e.target.value)} className={campo} placeholder="Ex.: Visita T3 Rua do Forno" />
        </div>
        <div>
          <label className={rotulo}>Quem fez / faz</label>
          <select value={f.funcionario || ''} onChange={e => set('funcionario', e.target.value)} className={campo}>
            <option value="">Por atribuir</option>
            {FUNCIONARIOS.map(x => <option key={x} value={x}>{x}</option>)}
            <option value={AMBOS}>Ambos</option>
            {f.funcionario && ![...FUNCIONARIOS, AMBOS].includes(f.funcionario) && <option value={f.funcionario}>{f.funcionario}</option>}
          </select>
        </div>
        <div>
          <label className={rotulo}>Estado</label>
          <select value={f.status} onChange={e => set('status', e.target.value)} className={campo}>
            {STATUS_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        <div>
          <label className={rotulo}>Categoria *</label>
          <select value={f.categoria || ''} onChange={e => set('categoria', e.target.value)} className={campo}>
            <option value="">Selecionar...</option>
            {CATEGORIAS.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        {CATEGORIAS_COM_REGIAO.has(f.categoria) ? (
          <div>
            <label className={rotulo}>Região</label>
            <select value={f.regiao || ''} onChange={e => set('regiao', e.target.value)} className={campo}>
              <option value="">— (sem região)</option>
              {REGIOES.map(r => <option key={r} value={r}>{r}</option>)}
            </select>
          </div>
        ) : <div />}
        <div>
          <label className={rotulo}>Início</label>
          <input type="datetime-local" value={f.inicio} onChange={e => set('inicio', e.target.value)} className={campo} />
        </div>
        <div>
          <label className={rotulo}>Fim</label>
          <input type="datetime-local" value={f.fim} onChange={e => set('fim', e.target.value)} className={campo} />
        </div>
        <div>
          <label className={rotulo}>Horas reais</label>
          <input type="number" step="0.25" min="0" max="24" value={f.tempo_horas ?? ''} onChange={e => set('tempo_horas', e.target.value ? parseFloat(e.target.value) : '')} className={campo} />
        </div>
        <p className="text-xs text-gray-400 self-end pb-2">Sem início, a tarefa fica em "Sem hora marcada" e não aparece no Google Calendar.</p>
      </div>
    </Modal>
  )
}

// ════════════════════════════════════════════════════════════════
// Calendário semanal (arrastar para criar, mover e esticar)
// ════════════════════════════════════════════════════════════════
const DIAS = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom']
const ALTURA = (HORA_FIM - HORA_INI) * 60 * PX_MIN

function CalendarioTab({ tarefas, guardar, accao, abrir, sincronizar }) {
  const [ref, setRef] = useState(() => new Date())
  const [quem, setQuem] = useState('todos')
  const [gcal, setGcal] = useState([])
  const [drag, setDrag] = useState(null)
  const grelha = useRef(null)
  const dragRef = useRef(null)

  const seg = useMemo(() => segunda(ref), [ref])
  const dias = useMemo(() => Array.from({ length: 7 }, (_, i) => isoDia(maisDias(seg, i))), [seg])
  const hoje = isoDia(new Date())

  // Eventos em directo do GCal (para mostrar os que ainda não são tarefa, ex.: recorrentes)
  useEffect(() => {
    let vivo = true
    apiFetch(`/api/calendar/events?de=${dias[0]}&ate=${dias[6]}`).then(r => r.json())
      .then(j => { if (vivo) setGcal(Array.isArray(j.events) ? j.events : []) }).catch(() => {})
    return () => { vivo = false }
  }, [dias, tarefas])

  // Ao mudar para uma semana passada, garante que o push cobre essa semana
  useEffect(() => { if (dias[0] < isoDia(segunda(new Date()))) sincronizar({ silencioso: true, desde: dias[0] }) }, [dias[0]]) // eslint-disable-line react-hooks/exhaustive-deps

  const passaFiltro = useCallback(t => quem === 'todos' ? true
    : quem === 'nenhum' ? !t.funcionario : (t.funcionario || '').includes(quem), [quem])

  const { comHora, diaInteiro, semHora } = useMemo(() => {
    const ligados = new Set(tarefas.map(t => t.gcal_event_id).filter(Boolean))
    const comHora = Object.fromEntries(dias.map(d => [d, []])), diaInteiro = Object.fromEntries(dias.map(d => [d, []]))
    for (const t of tarefas) {
      const d = diaDe(t.inicio)
      if (!(d in comHora) || !passaFiltro(t)) continue
      if (temHora(t.inicio)) {
        const ini = minDe(t.inicio)
        const fim = diaDe(t.fim) === d && minDe(t.fim) > ini ? minDe(t.fim) : diaDe(t.fim) > d ? HORA_FIM * 60 : ini + 60
        comHora[d].push({ key: t.id, tarefa: t, titulo: t.tarefa, ini, fim })
      } else diaInteiro[d].push({ key: t.id, tarefa: t, titulo: t.tarefa })
    }
    if (quem === 'todos' || quem === 'nenhum') {
      for (const e of gcal) {
        const d = diaDe(e.inicio)
        if (ligados.has(e.id) || !(d in comHora)) continue
        if (e.diaInteiro || !temHora(e.inicio)) diaInteiro[d].push({ key: 'g' + e.id, ev: e, titulo: e.titulo })
        else {
          const ini = minDe(e.inicio)
          comHora[d].push({ key: 'g' + e.id, ev: e, titulo: e.titulo, ini, fim: diaDe(e.fim) === d && minDe(e.fim) > ini ? minDe(e.fim) : ini + 60 })
        }
      }
    }
    // Faixas para eventos sobrepostos
    for (const d of dias) {
      const evs = comHora[d].sort((a, b) => a.ini - b.ini || b.fim - a.fim)
      let grupo = [], fimGrupo = -1
      const fechar = () => { const n = Math.max(...grupo.map(x => x.faixa)) + 1; grupo.forEach(x => { x.faixas = n }) }
      for (const e of evs) {
        if (grupo.length && e.ini >= fimGrupo) { fechar(); grupo = []; fimGrupo = -1 }
        const usadas = new Set(grupo.filter(x => x.fim > e.ini).map(x => x.faixa))
        let fx = 0; while (usadas.has(fx)) fx++
        e.faixa = fx; grupo.push(e); fimGrupo = Math.max(fimGrupo, e.fim)
      }
      if (grupo.length) fechar()
    }
    const semHora = tarefas.filter(t => !t.inicio && !concluida(t) && passaFiltro(t))
    return { comHora, diaInteiro, semHora }
  }, [tarefas, gcal, dias, quem, passaFiltro])

  // ── Arrastar na grelha ───────────────────────────────────────
  function posicao(e) {
    const r = grelha.current.getBoundingClientRect()
    const col = Math.min(6, Math.max(0, Math.floor((e.clientX - r.left) / (r.width / 7))))
    const bruto = HORA_INI * 60 + (e.clientY - r.top) / PX_MIN
    const min = Math.min(HORA_FIM * 60, Math.max(HORA_INI * 60, Math.round(bruto / SNAP) * SNAP))
    return { col, min }
  }
  function iniciar(e, tipo, item) {
    if (e.button !== 0) return
    e.preventDefault(); e.stopPropagation()
    const p = posicao(e)
    const d = { tipo, item, x: e.clientX, y: e.clientY, moveu: false, col0: p.col, min0: p.min, col: p.col, ini: item ? item.ini : p.min, fim: item ? item.fim : p.min + 60, desvio: item ? p.min - item.ini : 0 }
    dragRef.current = d; setDrag(d)
  }
  useEffect(() => {
    if (!drag) return
    function mover(e) {
      const d = dragRef.current; if (!d) return
      if (!d.moveu && Math.abs(e.clientX - d.x) + Math.abs(e.clientY - d.y) < 5) return
      const p = posicao(e)
      const n = { ...d, moveu: true }
      if (d.tipo === 'criar') { n.ini = Math.min(d.min0, p.min); n.fim = Math.max(d.min0, p.min); if (n.fim - n.ini < SNAP) n.fim = n.ini + SNAP }
      else if (d.tipo === 'esticar') { n.fim = Math.max(d.item.ini + SNAP, p.min) }
      else { const dur = d.item.fim - d.item.ini; n.col = p.col; n.ini = Math.min(HORA_FIM * 60 - dur, Math.max(HORA_INI * 60, p.min - d.desvio)); n.fim = n.ini + dur }
      dragRef.current = n; setDrag(n)
    }
    function largar() {
      const d = dragRef.current; dragRef.current = null; setDrag(null)
      if (!d) return
      const dia = dias[d.col]
      if (d.tipo === 'criar') {
        const ini = d.moveu ? d.ini : d.min0, fim = d.moveu ? d.fim : d.min0 + 60
        abrir({ inicial: { inicio: local(dia, ini), fim: local(dia, Math.min(fim, 24 * 60 - 1)) } })
      } else if (!d.moveu) {
        abrir({ tarefa: d.item.tarefa })
      } else {
        accao(() => guardar(d.item.tarefa, { inicio: local(dia, d.ini), fim: local(dia, d.fim), tempo_horas: '' }))
      }
    }
    window.addEventListener('mousemove', mover); window.addEventListener('mouseup', largar)
    return () => { window.removeEventListener('mousemove', mover); window.removeEventListener('mouseup', largar) }
  }, [!!drag]) // eslint-disable-line react-hooks/exhaustive-deps

  function largarSemHora(e, dia) {
    const id = e.dataTransfer.getData('text/tarefa'); if (!id) return
    e.preventDefault()
    const t = tarefas.find(x => x.id === id); if (!t) return
    const { min } = posicao(e)
    const dur = Math.max(30, Math.round((t.tempo_horas || 1) * 60))
    accao(() => guardar(t, { inicio: local(dia, min), fim: local(dia, Math.min(min + dur, 24 * 60 - 1)), tempo_horas: '' }))
  }

  const titulo = `${maisDias(seg, 0).toLocaleDateString('pt-PT', { day: 'numeric', month: 'short' })} — ${maisDias(seg, 6).toLocaleDateString('pt-PT', { day: 'numeric', month: 'short', year: 'numeric' })}`
  const estilo = ev => ({ top: (ev.ini - HORA_INI * 60) * PX_MIN, height: Math.max(18, (ev.fim - ev.ini) * PX_MIN - 2), left: `calc(${(ev.faixa / ev.faixas) * 100}% + 2px)`, width: `calc(${100 / ev.faixas}% - 4px)` })

  return (
    <div className="flex flex-col lg:flex-row gap-4">
      <div className="flex-1 min-w-0 bg-white dark:bg-neutral-900 rounded-xl border border-gray-200 dark:border-neutral-800">
        <div className="flex flex-wrap items-center gap-2 p-3 border-b border-gray-100 dark:border-neutral-800">
          <button onClick={() => setRef(d => maisDias(d, -7))} className="p-1.5 rounded-lg border border-gray-200 hover:bg-gray-50"><ChevronLeft className="w-4 h-4" /></button>
          <button onClick={() => setRef(new Date())} className="px-3 py-1.5 text-xs font-medium rounded-lg border border-gray-200 hover:bg-gray-50">Hoje</button>
          <button onClick={() => setRef(d => maisDias(d, 7))} className="p-1.5 rounded-lg border border-gray-200 hover:bg-gray-50"><ChevronRight className="w-4 h-4" /></button>
          <span className="text-sm font-semibold text-gray-700 dark:text-neutral-200 ml-1">{titulo}</span>
          <div className="ml-auto flex gap-1.5 flex-wrap">
            {[['todos', 'Todos'], ['João', 'João'], ['Alexandre', 'Alexandre'], ['nenhum', 'Por atribuir']].map(([k, l]) => (
              <button key={k} onClick={() => setQuem(k)}
                className={`px-2.5 py-1 text-xs font-medium rounded-lg border ${quem === k ? 'border-indigo-300 bg-indigo-50 text-indigo-700' : 'border-gray-200 text-gray-500 hover:bg-gray-50'}`}>{l}</button>
            ))}
          </div>
        </div>

        <div className="overflow-x-auto">
          <div className="min-w-[860px]">
            {/* Cabeçalho + dia inteiro */}
            <div className="flex border-b border-gray-100 dark:border-neutral-800">
              <div className="w-12 shrink-0" />
              {dias.map((d, i) => (
                <div key={d} className={`flex-1 min-w-0 px-1 py-1.5 border-l border-gray-100 dark:border-neutral-800 ${d === hoje ? 'bg-yellow-50 dark:bg-yellow-900/10' : ''}`}>
                  <p className="text-center text-[11px] text-gray-400 uppercase">{DIAS[i]} <span className={`font-bold text-sm ${d === hoje ? 'text-yellow-700' : 'text-gray-700 dark:text-neutral-200'}`}>{Number(d.slice(8))}</span></p>
                  {diaInteiro[d].map(ev => (
                    <button key={ev.key} onClick={() => abrir(ev.tarefa ? { tarefa: ev.tarefa } : { inicial: { tarefa: ev.titulo, inicio: ev.ev.inicio, fim: ev.ev.inicio, gcal_event_id: ev.ev.id } })}
                      className={`block w-full text-left truncate text-[10px] px-1.5 py-0.5 mt-0.5 rounded border-l-2 ${ev.tarefa ? corResponsavel(ev.tarefa.funcionario) : 'bg-white border-blue-400 text-blue-700 border border-dashed'} ${ev.tarefa && concluida(ev.tarefa) ? 'opacity-50 line-through' : ''}`}>
                      {ev.titulo}
                    </button>
                  ))}
                </div>
              ))}
            </div>

            {/* Grelha de horas */}
            <div className="flex">
              <div className="w-12 shrink-0 relative" style={{ height: ALTURA }}>
                {Array.from({ length: HORA_FIM - HORA_INI }, (_, i) => (
                  <span key={i} className="absolute right-1.5 text-[10px] text-gray-400 -translate-y-1.5" style={{ top: i * 60 * PX_MIN }}>{p2(HORA_INI + i)}:00</span>
                ))}
              </div>
              <div ref={grelha} className="flex flex-1 relative select-none" style={{ height: ALTURA }}>
                {dias.map((d, ci) => (
                  <div key={d} onMouseDown={e => iniciar(e, 'criar')} onDragOver={e => e.preventDefault()} onDrop={e => largarSemHora(e, d)}
                    className={`flex-1 min-w-0 relative border-l border-gray-100 dark:border-neutral-800 cursor-crosshair ${d === hoje ? 'bg-yellow-50/40 dark:bg-yellow-900/5' : ''}`}
                    style={{ backgroundImage: 'linear-gradient(to bottom, rgba(0,0,0,0.06) 1px, transparent 1px)', backgroundSize: `100% ${60 * PX_MIN}px` }}>
                    {comHora[d].map(ev => {
                      const aMover = drag?.moveu && drag.item?.key === ev.key
                      if (ev.ev) return (
                        <button key={ev.key} onMouseDown={e => e.stopPropagation()} style={estilo(ev)}
                          onClick={() => abrir({ inicial: { tarefa: ev.titulo, inicio: ev.ev.inicio.slice(0, 16), fim: (ev.ev.fim || '').slice(0, 16), gcal_event_id: ev.ev.id } })}
                          title="Evento do Google Calendar ainda não registado. Clica para atribuir quem fez."
                          className="absolute overflow-hidden text-left rounded-md border border-dashed border-blue-400 bg-white/90 dark:bg-neutral-900 text-blue-700 px-1.5 py-0.5 text-[10px] leading-tight hover:bg-blue-50">
                          <span className="font-mono">{hhmm(ev.ini)}</span> {ev.titulo}
                        </button>
                      )
                      const t = ev.tarefa
                      return (
                        <div key={ev.key} onMouseDown={e => iniciar(e, 'mover', ev)} style={estilo(ev)}
                          className={`absolute overflow-hidden rounded-md border-l-4 px-1.5 py-0.5 text-[10px] leading-tight cursor-grab shadow-sm ${corResponsavel(t.funcionario)} ${concluida(t) ? 'opacity-50 line-through' : ''} ${aMover ? 'opacity-30' : ''}`}>
                          <span className="font-mono">{hhmm(ev.ini)}</span> {ev.titulo}
                          {!t.funcionario && <span className="block text-[9px] text-gray-500 no-underline">Por atribuir</span>}
                          <span onMouseDown={e => iniciar(e, 'esticar', ev)} className="absolute bottom-0 left-0 right-0 h-1.5 cursor-ns-resize" />
                        </div>
                      )
                    })}
                    {drag?.moveu && drag.col === ci && (
                      <div className="absolute left-0.5 right-0.5 rounded-md border-2 border-brand-gold bg-brand-gold/20 text-[10px] px-1.5 pointer-events-none z-10"
                        style={{ top: (drag.ini - HORA_INI * 60) * PX_MIN, height: Math.max(14, (drag.fim - drag.ini) * PX_MIN) }}>
                        {hhmm(drag.ini)} – {hhmm(drag.fim)}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
        <div className="flex flex-wrap gap-3 px-3 py-2 border-t border-gray-100 dark:border-neutral-800 text-[11px] text-gray-500">
          {[['bg-amber-300', 'João'], ['bg-indigo-300', 'Alexandre'], ['bg-emerald-300', 'Ambos'], ['bg-gray-300', 'Por atribuir']].map(([c, l]) => (
            <span key={l} className="flex items-center gap-1"><span className={`w-2.5 h-2.5 rounded-sm ${c}`} />{l}</span>
          ))}
          <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm border border-dashed border-blue-400" />Evento do Google por registar</span>
          <span className="ml-auto">Arrasta na grelha para criar. Arrasta um evento para mover; a margem inferior estica.</span>
        </div>
      </div>

      {/* Sem hora marcada */}
      <aside className="lg:w-72 shrink-0 bg-white dark:bg-neutral-900 rounded-xl border border-gray-200 dark:border-neutral-800 p-3 self-start w-full">
        <h3 className="text-sm font-semibold text-gray-700 dark:text-neutral-200 flex items-center gap-1.5"><Inbox className="w-4 h-4 text-brand-gold" /> Sem hora marcada <span className="text-gray-400 font-normal">({semHora.length})</span></h3>
        <p className="text-[11px] text-gray-400 mt-0.5 mb-2">Arrasta para um dia da grelha para agendar.</p>
        <div className="flex flex-col gap-1.5 max-h-[640px] overflow-y-auto">
          {semHora.map(t => (
            <div key={t.id} draggable onDragStart={e => { e.dataTransfer.setData('text/tarefa', t.id); e.dataTransfer.effectAllowed = 'move' }}
              onClick={() => abrir({ tarefa: t })}
              className={`rounded-lg border-l-4 px-2 py-1.5 text-xs cursor-grab hover:shadow-sm ${corResponsavel(t.funcionario)}`}>
              <p className="leading-snug">{t.tarefa}</p>
              <p className="text-[10px] opacity-70 mt-0.5">{t.funcionario || 'Por atribuir'}{t.data_limite ? ` · até ${t.data_limite.slice(8, 10)}/${t.data_limite.slice(5, 7)}` : ''}{t.origem_tipo === 'whatsapp' ? ' · WhatsApp' : ''}</p>
            </div>
          ))}
          {!semHora.length && <p className="text-xs text-gray-300 text-center py-6">Nada por agendar</p>}
        </div>
      </aside>
    </div>
  )
}

// ════════════════════════════════════════════════════════════════
// Tarefas (lista / quadro) — movido de Operações
// ════════════════════════════════════════════════════════════════
function TarefasTab({ tarefas, guardar, eliminar, accao, abrir }) {
  const [filtro, setFiltro] = useState('semana')
  const [func, setFunc] = useState('todos')
  const [reg, setReg] = useState('todas')
  const [vista, setVista] = useState('board')
  const [sel, setSel] = useState(new Set())
  const [arrastada, setArrastada] = useState(null)
  const [sobre, setSobre] = useState(null)

  const seg = segunda(new Date()), fimSem = maisDias(seg, 7)
  const destaSemana = t => { if (!t.inicio) return true; const d = new Date(t.inicio); return d >= seg && d < fimSem }
  const ativas = tarefas.filter(t => !concluida(t))
  const semana = tarefas.filter(destaSemana)
  const arquivo = tarefas.filter(t => concluida(t) && !destaSemana(t))
  const base = filtro === 'semana' ? semana : filtro === 'pendentes' ? ativas : arquivo
  const lista = base.filter(t => (func === 'todos' || (t.funcionario || '').includes(func)) && (reg === 'todas' || t.regiao === reg))

  const alternar = id => setSel(p => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n })
  const todas = () => setSel(sel.size === lista.length ? new Set() : new Set(lista.map(t => t.id)))
  const mudarEstado = (t, status) => accao(() => guardar(t, { status }))
  function apagarVarias() {
    if (!sel.size || !window.confirm(`Apagar ${sel.size} tarefa(s)?`)) return
    accao(async () => { for (const t of tarefas.filter(x => sel.has(x.id))) await eliminar(t); setSel(new Set()) })
  }
  const data = s => s ? new Date(s).toLocaleDateString('pt-PT', { day: '2-digit', month: '2-digit' }) + (temHora(s) ? ' ' + s.slice(11, 16) : '') : '—'
  const chip = (activo, cor) => `px-3 py-1.5 text-xs font-medium rounded-lg border ${activo ? cor : 'border-gray-200 text-gray-500 hover:bg-gray-50'}`
  const colunas = filtro === 'semana' ? ['A fazer', 'Em andamento', 'Atrasada', 'Concluída'] : ['A fazer', 'Em andamento', 'Atrasada']

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="flex gap-2 flex-wrap">
          {[['semana', `Esta semana (${semana.length})`], ['pendentes', `Todas pendentes (${ativas.length})`], ['arquivo', `Arquivo (${arquivo.length})`]].map(([k, l]) => (
            <button key={k} onClick={() => { setFiltro(k); setSel(new Set()) }} className={chip(filtro === k, 'border-yellow-300 bg-yellow-50 text-yellow-700')}>{l}</button>
          ))}
        </div>
        <div className="flex gap-2 flex-wrap">
          {['todos', ...FUNCIONARIOS].map(f => (
            <button key={f} onClick={() => { setFunc(f); setSel(new Set()) }} className={chip(func === f, 'border-indigo-300 bg-indigo-50 text-indigo-700')}>{f === 'todos' ? 'Todos' : f.split(' ')[0]}</button>
          ))}
          <button onClick={() => setVista(v => v === 'list' ? 'board' : 'list')} className={chip(false)}>{vista === 'list' ? 'Quadro' : 'Lista'}</button>
        </div>
      </div>
      <div className="flex gap-2 flex-wrap">
        {['todas', ...REGIOES].map(r => (
          <button key={r} onClick={() => { setReg(r); setSel(new Set()) }} className={chip(reg === r, 'border-purple-300 bg-purple-50 text-purple-700')}>{r === 'todas' ? 'Todas as regiões' : r}</button>
        ))}
      </div>
      <div className="flex items-center gap-3 px-4 py-2 bg-gray-50 dark:bg-neutral-900 rounded-lg border border-gray-200 dark:border-neutral-800">
        <label className="flex items-center gap-2 cursor-pointer text-xs text-gray-500">
          <input type="checkbox" checked={sel.size > 0 && sel.size === lista.length} onChange={todas} className="rounded border-gray-300" />
          {sel.size > 0 ? `${sel.size} selecionada(s)` : 'Selecionar todas'}
        </label>
        {sel.size > 0 && <button onClick={apagarVarias} className="px-3 py-1 text-xs font-semibold rounded-lg border border-red-300 text-red-600 bg-red-50 hover:bg-red-100">Apagar {sel.size} tarefa(s)</button>}
        {sel.size > 0 && <button onClick={() => setSel(new Set())} className="px-3 py-1 text-xs rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-100">Limpar seleção</button>}
      </div>

      {vista === 'board' && filtro !== 'arquivo' ? (
        <div className={`grid grid-cols-1 gap-4 ${colunas.length === 4 ? 'md:grid-cols-4' : 'md:grid-cols-3'}`}>
          {colunas.map(status => {
            const col = lista.filter(t => status === 'Concluída' ? concluida(t) : t.status === status)
            return (
              <div key={status} className="flex flex-col">
                <div className={`flex items-center justify-between px-3 py-2 rounded-t-xl ${STATUS_COLOR[status]}`}>
                  <span className="text-xs font-semibold uppercase">{status}</span>
                  <span className="text-xs font-mono">{col.length} · {HRS(col.reduce((s, t) => s + (t.tempo_horas || 0), 0))}</span>
                </div>
                <div onDragOver={e => { e.preventDefault(); if (sobre !== status) setSobre(status) }}
                  onDragLeave={e => { if (!e.currentTarget.contains(e.relatedTarget)) setSobre(null) }}
                  onDrop={() => { const t = tarefas.find(x => x.id === arrastada); setArrastada(null); setSobre(null); if (t && t.status !== status) mudarEstado(t, status) }}
                  className={`flex flex-col gap-1.5 p-2 bg-gray-50 dark:bg-neutral-900 rounded-b-xl min-h-[200px] border border-t-0 transition-colors ${sobre === status ? 'border-yellow-400 bg-yellow-50/60 ring-1 ring-yellow-200' : 'border-gray-200 dark:border-neutral-800'}`}>
                  {col.map(t => (
                    <div key={t.id} draggable onDragStart={e => { setArrastada(t.id); e.dataTransfer.effectAllowed = 'move' }} onDragEnd={() => { setArrastada(null); setSobre(null) }}
                      className={`bg-white dark:bg-neutral-800 rounded-lg p-3 shadow-sm border cursor-grab active:cursor-grabbing ${arrastada === t.id ? 'opacity-40' : ''} ${sel.has(t.id) ? 'border-yellow-400 bg-yellow-50 ring-1 ring-yellow-200' : 'border-gray-100 dark:border-neutral-700 hover:border-gray-300'}`}>
                      <div className="flex items-start gap-2.5">
                        <input type="checkbox" checked={sel.has(t.id)} onChange={() => alternar(t.id)} className="mt-0.5 w-4 h-4 rounded border-gray-300 shrink-0 cursor-pointer" />
                        <div className="flex-1 min-w-0 cursor-pointer" onClick={() => abrir({ tarefa: t })}>
                          <p className="text-sm text-gray-700 dark:text-neutral-100 font-medium leading-tight">{t.tarefa}</p>
                          {t.categoria && <span className="text-[9px] px-1.5 py-0.5 bg-indigo-50 text-indigo-600 rounded mt-1 inline-block">{t.categoria}</span>}
                          {t.regiao && <span className="text-[9px] px-1.5 py-0.5 bg-purple-50 text-purple-700 rounded mt-1 ml-1 inline-block">{t.regiao}</span>}
                          {t.origem_tipo === 'whatsapp' && <span className="text-[9px] px-1.5 py-0.5 bg-green-50 text-green-700 rounded mt-1 ml-1 inline-block">WhatsApp</span>}
                          <div className="flex items-center justify-between mt-1.5">
                            <span className="text-[10px] text-gray-400">{t.funcionario?.split(',')[0] || 'Por atribuir'}</span>
                            <div className="flex items-center gap-2">
                              {t.inicio && <span className="text-[10px] font-mono text-gray-400">{data(t.inicio)}</span>}
                              {t.tempo_horas > 0 && <span className="text-[10px] font-mono font-bold text-indigo-600">{HRS(t.tempo_horas)}</span>}
                            </div>
                          </div>
                        </div>
                        <button onClick={() => accao(() => eliminar(t))} className="text-gray-300 hover:text-red-500 hover:bg-red-50 rounded p-0.5 text-sm shrink-0" title="Apagar">x</button>
                      </div>
                    </div>
                  ))}
                  {!col.length && <p className="text-xs text-gray-300 text-center py-8">Sem tarefas</p>}
                </div>
              </div>
            )
          })}
        </div>
      ) : (
        <div className="bg-white dark:bg-neutral-900 rounded-xl border border-gray-200 dark:border-neutral-800 shadow-xs overflow-hidden">
          {filtro === 'arquivo' && <div className="px-4 py-3 bg-green-50 border-b border-green-100 text-xs text-green-700">Arquivo — tarefas concluídas de semanas anteriores.</div>}
          <ScrollableTable>
            <table className="min-w-[800px] w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 text-xs text-gray-400 uppercase bg-gray-50 dark:bg-neutral-900">
                  <th className="py-2.5 px-3 w-8"><input type="checkbox" onChange={todas} checked={sel.size > 0 && sel.size === lista.length} className="rounded border-gray-300" /></th>
                  <th className="text-left py-2.5 px-3">Tarefa</th>
                  <th className="text-left py-2.5 px-3 w-32">Categoria</th>
                  <th className="text-left py-2.5 px-3 w-28">Estado</th>
                  <th className="text-left py-2.5 px-3 w-36">Quem</th>
                  <th className="text-left py-2.5 px-3 w-28">Início</th>
                  <th className="text-left py-2.5 px-3 w-28">Fim</th>
                  <th className="text-right py-2.5 px-3 w-16">Horas</th>
                  <th className="w-10" />
                </tr>
              </thead>
              <tbody>
                {lista.slice(0, 200).map(t => (
                  <tr key={t.id} className={`border-b border-gray-50 dark:border-neutral-800 hover:bg-gray-50 dark:hover:bg-neutral-800 ${sel.has(t.id) ? 'bg-yellow-50' : ''} ${concluida(t) ? 'opacity-60' : ''}`}>
                    <td className="py-2 px-3"><input type="checkbox" checked={sel.has(t.id)} onChange={() => alternar(t.id)} className="rounded border-gray-300" /></td>
                    <td className="py-2 px-3 text-gray-700 dark:text-neutral-100 font-medium">
                      <span className={`cursor-pointer hover:underline ${concluida(t) ? 'line-through' : ''}`} onClick={() => abrir({ tarefa: t })}>{t.tarefa}</span>
                      {t.gcal_event_id && <ExternalLink className="inline w-3 h-3 ml-1 text-blue-400" title="No Google Calendar" />}
                    </td>
                    <td className="py-2 px-3 text-xs">{t.categoria ? <span className="px-1.5 py-0.5 bg-indigo-50 text-indigo-600 rounded">{t.categoria}</span> : <span className="text-gray-300">—</span>}</td>
                    <td className="py-2 px-3">
                      <select value={concluida(t) ? 'Concluída' : t.status} onChange={e => mudarEstado(t, e.target.value)} className={`px-2 py-0.5 rounded text-xs font-medium border-0 cursor-pointer ${STATUS_COLOR[concluida(t) ? 'Concluída' : t.status] || 'bg-gray-100'}`}>
                        {STATUS_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
                      </select>
                    </td>
                    <td className="py-2 px-3 text-xs text-gray-500">{t.funcionario || 'Por atribuir'}</td>
                    <td className="py-2 px-3 text-xs font-mono text-gray-500">{data(t.inicio)}</td>
                    <td className="py-2 px-3 text-xs font-mono text-gray-500">{data(t.fim)}</td>
                    <td className="py-2 px-3 text-right font-mono text-xs font-bold text-indigo-600">{t.tempo_horas > 0 ? HRS(t.tempo_horas) : '—'}</td>
                    <td className="py-2 px-3 text-right"><button onClick={() => accao(() => eliminar(t))} className="text-gray-300 hover:text-red-500 text-sm">x</button></td>
                  </tr>
                ))}
                {!lista.length && <tr><td colSpan={9} className="py-8 text-center text-gray-400 text-xs">Sem tarefas. Usa "Nova tarefa" ou cria no Google Calendar.</td></tr>}
              </tbody>
            </table>
          </ScrollableTable>
          <div className="px-4 py-2 bg-gray-50 dark:bg-neutral-900 border-t border-gray-100 dark:border-neutral-800 flex justify-between text-xs text-gray-400">
            <span>{lista.length} tarefa(s)</span>
            <span>Total: {HRS(lista.reduce((s, t) => s + (t.tempo_horas || 0), 0))}</span>
          </div>
        </div>
      )}
    </div>
  )
}
