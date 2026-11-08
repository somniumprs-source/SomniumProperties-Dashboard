/**
 * Aba "Marca Pessoal" (Marketing): plano de 6 meses do Alexandre Mendes.
 * Visão geral do plano, calendário com as 72 publicações (guião + texto
 * LinkedIn + legenda Instagram prontos a copiar), formatos e regras.
 * O conteúdo base vem de src/constants/marcaPessoal.js; estado, edições,
 * notas e links ficam em /api/crm/marca-pessoal/posts. Só administradores.
 */
import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  LayoutGrid, CalendarDays, Shapes, ShieldCheck, Copy, Check, AlertTriangle, Plus, Search,
  ChevronRight, Target, Users, Clock, Wallet, Gauge, Megaphone, BookOpen, Eye, EyeOff, RotateCcw, Trash2,
  Pencil, ExternalLink, Sparkles, FileText, Linkedin, Instagram, Film,
} from 'lucide-react'
import { apiFetch } from '../lib/api.js'
import {
  MP_PLANO, MP_MESES, MP_PILARES, MP_PUBLICO, MP_CANAIS, MP_ROTINA, MP_FLUXO, MP_PAPEIS, MP_KPIS,
  MP_ORCAMENTO, MP_FORMATOS, MP_REGRAS, MP_LAJES_MOSTRAR, MP_LAJES_NAO_MOSTRAR, MP_ESTADOS,
  MP_ESTADO_TONE, MP_POSTS_BASE, juntarPosts, temPorPreencher,
} from '../constants/marcaPessoal.js'
import { Tabs } from '../components/ui/Tabs.jsx'
import { Badge } from '../components/ui/Badge.jsx'
import { Button } from '../components/ui/Button.jsx'
import { Modal } from '../components/ui/Modal.jsx'
import { Input, Select, Textarea } from '../components/ui/Input.jsx'
import { EmptyState } from '../components/ui/EmptyState.jsx'
import { confirmar } from '../components/ui/ConfirmDialog.jsx'
import { useToast } from '../components/ui/Toast.jsx'
import { friendlyError } from '../lib/friendlyError.js'

const VISTAS = [
  { key: 'geral', label: 'Visão geral', icon: LayoutGrid },
  { key: 'calendario', label: 'Calendário', icon: CalendarDays },
  { key: 'formatos', label: 'Formatos', icon: Shapes },
  { key: 'regras', label: 'Regras', icon: ShieldCheck },
]

const MES_CURTO = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']
const DIA_SEMANA = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb']
function partesData(iso) {
  if (!iso) return null
  const d = new Date(`${iso}T12:00:00Z`)
  return { dia: d.getUTCDate(), mes: MES_CURTO[d.getUTCMonth()], semana: DIA_SEMANA[d.getUTCDay()] }
}
function fmtData(iso) {
  const p = partesData(iso)
  return p ? `${p.semana}, ${p.dia} ${p.mes}` : 'Sem data'
}
function hojeISO() { return new Date().toISOString().slice(0, 10) }

async function lerErro(r, fallback) {
  const j = await r.json().catch(() => ({}))
  return Object.assign(new Error(j.error || fallback), { status: r.status })
}

function useCopiar() {
  const toast = useToast()
  const [copiado, setCopiado] = useState(null)
  async function copiar(texto, chave) {
    try {
      await navigator.clipboard.writeText(texto || '')
      setCopiado(chave)
      setTimeout(() => setCopiado(c => (c === chave ? null : c)), 1800)
      if (temPorPreencher(texto)) toast('Copiado. Atenção: ainda tem campos [ ] por preencher', 'warning')
    } catch { toast('Não foi possível copiar', 'error') }
  }
  return { copiado, copiar }
}

// ─── Blocos base ────────────────────────────────────────────────────────────

function Secao({ icon: Icon, titulo, subtitulo, children, accao }) {
  return (
    <section className="space-y-3">
      <div className="flex items-end justify-between gap-3">
        <div className="flex items-center gap-2.5">
          {Icon && <span className="w-8 h-8 rounded-lg bg-accent/10 text-accent-ink flex items-center justify-center"><Icon className="w-4 h-4" /></span>}
          <div>
            <h3 className="text-sm font-semibold text-ink">{titulo}</h3>
            {subtitulo && <p className="text-caption text-ink-muted">{subtitulo}</p>}
          </div>
        </div>
        {accao}
      </div>
      {children}
    </section>
  )
}

function Painel({ children, className = '' }) {
  return <div className={`rounded-xl border border-line bg-surface-raised shadow-xs ${className}`}>{children}</div>
}

function TabelaSimples({ colunas, linhas }) {
  return (
    <Painel className="overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-ui">
          <thead>
            <tr className="bg-surface-muted/60 text-left">
              {colunas.map(c => <th key={c.key} className="px-4 py-2.5 text-overline uppercase font-semibold text-ink-muted whitespace-nowrap">{c.label}</th>)}
            </tr>
          </thead>
          <tbody>
            {linhas.map((l, i) => (
              <tr key={i} className="border-t border-line align-top">
                {colunas.map(c => <td key={c.key} className={`px-4 py-3 ${c.forte ? 'font-medium text-ink' : 'text-ink-muted'} ${c.nowrap ? 'whitespace-nowrap' : ''}`}>{l[c.key]}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Painel>
  )
}

function Progresso({ feitos, total }) {
  const pct = total ? Math.round((feitos / total) * 100) : 0
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 rounded-full bg-surface-muted overflow-hidden">
        <div className="h-full rounded-full bg-accent transition-all" style={{ width: `${pct}%` }} />
      </div>
      <span className="text-caption text-ink-muted num whitespace-nowrap">{feitos}/{total}</span>
    </div>
  )
}

function Estatistica({ label, valor, sub, onClick }) {
  const Tag = onClick ? 'button' : 'div'
  return (
    <Tag type={onClick ? 'button' : undefined} onClick={onClick}
      className={`text-left rounded-xl border border-line bg-surface-raised px-4 py-3 shadow-xs min-w-0 ${onClick ? 'hover:bg-surface-muted transition-colors' : ''}`}>
      <p className="text-overline uppercase font-semibold text-ink-muted">{label}</p>
      <p className="text-xl font-semibold text-ink num truncate">{valor}</p>
      {sub && <p className="text-caption text-ink-muted truncate">{sub}</p>}
    </Tag>
  )
}

function TipoBadge({ tipo }) {
  return tipo === 'Prova'
    ? <Badge tone="dark" size="xs">Prova</Badge>
    : <Badge tone="gold" size="xs">Literacia</Badge>
}

// ─── Visão geral ────────────────────────────────────────────────────────────

function VisaoGeral({ posts, irParaMes }) {
  return (
    <div className="space-y-8">
      <div className="rounded-2xl bg-brand-dark text-white p-6 sm:p-8 relative overflow-hidden">
        <div className="absolute -right-16 -top-16 w-64 h-64 rounded-full bg-accent/10" aria-hidden />
        <div className="relative max-w-3xl space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone="gold" variant="solid" size="sm">{MP_PLANO.periodo}</Badge>
            <span className="text-caption text-white/60">72 publicações · 3 por semana · LinkedIn e Instagram</span>
          </div>
          <h2 className="text-title font-semibold">O sócio que mostra os números</h2>
          <p className="text-sm text-white/80 leading-relaxed">{MP_PLANO.objetivo}</p>
          <p className="text-ui text-white/60 leading-relaxed">{MP_PLANO.tese}</p>
          <div className="inline-flex items-center gap-2 rounded-lg border border-accent/40 bg-accent/10 px-3 py-2 text-ui text-accent">
            <ShieldCheck className="w-4 h-4 shrink-0" /> Regra de ouro: {MP_PLANO.regraOuro}
          </div>
        </div>
      </div>

      <Secao icon={Target} titulo="Pilares de conteúdo" subtitulo="Dois terços ensinam; um terço prova que fazemos o que ensinamos">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {MP_PILARES.map(p => (
            <Painel key={p.nome} className="p-4">
              <p className="text-sm font-semibold text-ink">{p.nome}</p>
              <p className="text-caption text-ink-muted mb-3">Foco: {p.foco}</p>
              <ul className="space-y-1.5">
                {p.itens.map(i => <li key={i} className="flex items-center gap-2 text-ui text-ink"><span className="w-1 h-1 rounded-full bg-accent" />{i}</li>)}
              </ul>
            </Painel>
          ))}
        </div>
        <div className="rounded-xl border border-accent/40 bg-accent/10 px-4 py-3 text-ui text-ink">
          <span className="font-semibold">Prova:</span> Projecto Lajes e bastidores, 1 em cada 3 publicações. Mostra a Somnium a aplicar o que ensina.
        </div>
      </Secao>

      <Secao icon={CalendarDays} titulo="Roteiro de 6 meses" subtitulo="Um tema de literacia por mês, com peça âncora e critério de passagem">
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
          {MP_MESES.map(m => {
            const doMes = posts.filter(p => p.mes === m.n)
            const feitos = doMes.filter(p => p.estado === 'Publicado').length
            return (
              <button key={m.n} type="button" onClick={() => irParaMes(m.n)}
                className="group text-left rounded-xl border border-line bg-surface-raised p-4 shadow-xs hover:shadow-md hover:border-ink/20 transition-all">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-overline uppercase font-semibold text-ink-muted">Mês {m.n} · {m.nome} {m.ano}</span>
                  <ChevronRight className="w-4 h-4 text-ink-muted group-hover:text-ink transition-colors" />
                </div>
                <p className="text-base font-semibold text-ink">{m.tema}</p>
                <p className="text-ui text-ink-muted mb-3">{m.subtitulo}</p>
                <div className="space-y-1.5 text-caption text-ink-muted mb-3">
                  <p className="flex gap-1.5"><BookOpen className="w-3.5 h-3.5 mt-px shrink-0 text-accent-ink" /><span>{m.ancora}</span></p>
                  <p className="flex gap-1.5"><Gauge className="w-3.5 h-3.5 mt-px shrink-0 text-accent-ink" /><span>{m.criterio}</span></p>
                </div>
                <Progresso feitos={feitos} total={doMes.length} />
              </button>
            )
          })}
        </div>
      </Secao>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-8">
        <Secao icon={Users} titulo="Para quem falamos">
          <TabelaSimples
            colunas={[{ key: 'publico', label: 'Público', forte: true }, { key: 'procura', label: 'Procura' }, { key: 'sentir', label: 'Ao fim de 6 meses' }]}
            linhas={MP_PUBLICO} />
        </Secao>
        <Secao icon={Megaphone} titulo="Canais">
          <TabelaSimples
            colunas={[{ key: 'canal', label: 'Canal', forte: true }, { key: 'papel', label: 'Papel' }, { key: 'frequencia', label: 'Frequência' }]}
            linhas={MP_CANAIS} />
        </Secao>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-8">
        <Secao icon={Clock} titulo="Rotina semanal" subtitulo="2 a 3 horas por semana">
          <TabelaSimples
            colunas={[{ key: 'dia', label: 'Dia', forte: true, nowrap: true }, { key: 'canal', label: 'Canal' }, { key: 'conteudo', label: 'O quê' }, { key: 'tempo', label: 'Tempo', nowrap: true }]}
            linhas={MP_ROTINA} />
        </Secao>
        <Secao icon={Sparkles} titulo="Fluxo de produção">
          <Painel className="p-4">
            <ol className="space-y-3">
              {MP_FLUXO.map((f, i) => (
                <li key={i} className="flex gap-3 text-ui text-ink">
                  <span className="w-6 h-6 rounded-full bg-surface-muted text-caption font-semibold flex items-center justify-center shrink-0 num">{i + 1}</span>
                  <span className="pt-0.5">{f}</span>
                </li>
              ))}
            </ol>
          </Painel>
        </Secao>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-8">
        <Secao icon={Gauge} titulo="Metas" subtitulo="Revistas no fim do mês 2 com dados reais">
          <TabelaSimples
            colunas={[{ key: 'indicador', label: 'Indicador', forte: true }, { key: 'm2', label: 'Mês 2', nowrap: true }, { key: 'm4', label: 'Mês 4', nowrap: true }, { key: 'm6', label: 'Mês 6', nowrap: true }]}
            linhas={MP_KPIS} />
        </Secao>
        <div className="space-y-8">
          <Secao icon={Users} titulo="Papéis">
            <TabelaSimples
              colunas={[{ key: 'pessoa', label: 'Quem', forte: true }, { key: 'responsabilidade', label: 'Responsabilidade' }, { key: 'tempo', label: 'Tempo', nowrap: true }]}
              linhas={MP_PAPEIS} />
          </Secao>
          <Secao icon={Wallet} titulo="Orçamento" subtitulo="400 a 1 450 EUR em 6 meses (valores aproximados)">
            <TabelaSimples
              colunas={[{ key: 'rubrica', label: 'Rubrica', forte: true }, { key: 'valor', label: 'Valor', nowrap: true }, { key: 'quando', label: 'Quando', nowrap: true }]}
              linhas={MP_ORCAMENTO} />
          </Secao>
        </div>
      </div>
    </div>
  )
}

// ─── Calendário ─────────────────────────────────────────────────────────────

function LinhaPost({ post, onAbrir }) {
  const d = partesData(post.data_prevista)
  const falta = temPorPreencher(post.linkedin) || temPorPreencher(post.instagram)
  const passou = post.data_prevista && post.data_prevista < hojeISO() && post.estado !== 'Publicado'
  return (
    <button type="button" onClick={() => onAbrir(post)}
      className="w-full text-left flex items-center gap-3 sm:gap-4 px-3 sm:px-4 py-3 hover:bg-surface-muted/70 transition-colors group">
      <div className={`w-12 shrink-0 text-center rounded-lg border py-1 ${passou ? 'border-danger/40' : 'border-line'}`}>
        <p className="text-[10px] uppercase font-semibold text-ink-muted leading-3">{d?.semana || '·'}</p>
        <p className="text-base font-semibold text-ink num leading-5">{d?.dia ?? '·'}</p>
        <p className="text-[10px] uppercase text-ink-muted leading-3">{d?.mes || ''}</p>
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5 mb-0.5">
          <TipoBadge tipo={post.tipo} />
          {post.pilar && <span className="text-caption text-ink-muted">{post.pilar}</span>}
        </div>
        <p className="text-ui font-medium text-ink truncate">{post.tema}</p>
        <p className="text-caption text-ink-muted truncate">{post.formato}{post.canal ? ` · ${post.canal}` : ''}</p>
      </div>
      <div className="hidden sm:flex items-center gap-2 shrink-0">
        {falta && post.estado !== 'Publicado' && (
          <span title="Tem dados reais por preencher [ ]" className="inline-flex items-center gap-1 text-caption text-warning">
            <AlertTriangle className="w-3.5 h-3.5" /> Dados
          </span>
        )}
        <Badge tone={MP_ESTADO_TONE[post.estado] || 'gray'} dot>{post.estado}</Badge>
      </div>
      <ChevronRight className="w-4 h-4 text-ink-muted group-hover:text-ink shrink-0" />
    </button>
  )
}

function Calendario({ posts, mes, setMes, onAbrir, onNovo }) {
  const [tipo, setTipo] = useState('todos')
  const [estado, setEstado] = useState('')
  const [q, setQ] = useState('')
  const m = MP_MESES.find(x => x.n === mes) || MP_MESES[0]

  const pesquisa = q.trim().toLowerCase()
  const filtrados = posts.filter(p =>
    (pesquisa ? true : p.mes === m.n) &&
    (tipo === 'todos' || p.tipo === tipo) &&
    (!estado || p.estado === estado) &&
    (!pesquisa || `${p.tema} ${p.objetivo} ${p.pilar} ${p.formato}`.toLowerCase().includes(pesquisa)))

  const grupos = useMemo(() => {
    const g = new Map()
    for (const p of filtrados) {
      const chave = pesquisa ? `Mês ${p.mes}` : `Semana ${p.semana || '?'}`
      if (!g.has(chave)) g.set(chave, [])
      g.get(chave).push(p)
    }
    return [...g.entries()]
  }, [filtrados, pesquisa])

  const itensMes = MP_MESES.map(x => {
    const doMes = posts.filter(p => p.mes === x.n)
    return { key: String(x.n), label: x.nome.slice(0, 3), count: `${doMes.filter(p => p.estado === 'Publicado').length}/${doMes.length}` }
  })

  return (
    <div className="space-y-5">
      <div className="overflow-x-auto -mx-1 px-1">
        <Tabs items={itensMes} value={String(m.n)} onChange={k => { setMes(Number(k)); setQ('') }} size="sm" />
      </div>

      {!pesquisa && (
        <Painel className="p-4 sm:p-5">
          <div className="flex flex-col lg:flex-row lg:items-start gap-4 lg:gap-8">
            <div className="flex-1 min-w-0">
              <p className="text-overline uppercase font-semibold text-ink-muted">Mês {m.n} · {m.nome} {m.ano}</p>
              <h3 className="text-xl font-semibold text-ink">{m.tema}</h3>
              <p className="text-ui text-ink-muted mt-1">{m.objetivo}</p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 lg:w-[460px] shrink-0">
              <div className="rounded-lg bg-surface-muted/70 px-3 py-2.5">
                <p className="text-overline uppercase font-semibold text-ink-muted flex items-center gap-1"><BookOpen className="w-3 h-3" /> Peça âncora</p>
                <p className="text-ui text-ink">{m.ancora}</p>
                <p className="text-caption text-ink-muted">Pedido por mensagem: <span className="font-semibold text-ink">{m.palavraChave}</span></p>
              </div>
              <div className="rounded-lg bg-surface-muted/70 px-3 py-2.5">
                <p className="text-overline uppercase font-semibold text-ink-muted flex items-center gap-1"><Gauge className="w-3 h-3" /> Critério do mês</p>
                <p className="text-ui text-ink">{m.criterio}</p>
              </div>
            </div>
          </div>
        </Painel>
      )}

      <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-ink-muted absolute left-3 top-1/2 -translate-y-1/2" />
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="Pesquisar em todos os meses"
            className="w-full pl-9 pr-3 py-2 text-ui rounded-lg border border-line bg-surface-raised text-ink placeholder:text-ink-muted focus:outline-none focus:border-ink/30" />
        </div>
        <Tabs size="sm" value={tipo} onChange={setTipo}
          items={[{ key: 'todos', label: 'Todos' }, { key: 'Literacia', label: 'Literacia' }, { key: 'Prova', label: 'Prova' }]} />
        <select value={estado} onChange={e => setEstado(e.target.value)}
          className="py-2 px-3 text-ui rounded-lg border border-line bg-surface-raised text-ink">
          <option value="">Todos os estados</option>
          {MP_ESTADOS.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <Button size="md" icon={Plus} onClick={onNovo}>Nova</Button>
      </div>

      {grupos.length === 0 ? (
        <EmptyState icon={CalendarDays} title="Sem publicações" description="Nenhuma publicação corresponde aos filtros." />
      ) : (
        <div className="space-y-4">
          {grupos.map(([nome, lista]) => {
            const ini = lista[0]?.data_prevista
            const fim = lista[lista.length - 1]?.data_prevista
            return (
              <div key={nome}>
                <div className="flex items-baseline justify-between mb-1.5 px-1">
                  <p className="text-overline uppercase font-semibold text-ink-muted">{nome}</p>
                  {!pesquisa && ini && <p className="text-caption text-ink-muted">{fmtData(ini)} a {fmtData(fim)}</p>}
                </div>
                <Painel className="divide-y divide-line overflow-hidden">
                  {lista.map(p => <LinhaPost key={p.id} post={p} onAbrir={onAbrir} />)}
                </Painel>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ─── Publicação (modal) ─────────────────────────────────────────────────────

const SEPARADORES_TEXTO = [
  { key: 'guiao', label: 'Guião', icon: Film, limite: null },
  { key: 'linkedin', label: 'LinkedIn', icon: Linkedin, limite: 3000 },
  { key: 'instagram', label: 'Instagram', icon: Instagram, limite: 2200 },
]
const CAMPOS_FORM = ['tema', 'objetivo', 'tipo', 'pilar', 'formato', 'canal', 'mes', 'semana', 'ordem', 'data_prevista', 'estado', 'guiao', 'linkedin', 'instagram', 'link_publicacao', 'data_publicacao', 'notas']
const VAZIO_NOVO = { tema: '', objetivo: '', tipo: 'Literacia', pilar: '', formato: '', canal: 'LinkedIn e Instagram', mes: 1, semana: 1, ordem: 1, data_prevista: '', estado: 'Por produzir', guiao: '', linkedin: '', instagram: '', link_publicacao: '', data_publicacao: '', notas: '' }

function ModalPost({ post, linhaDb, novo, onClose, onGuardado }) {
  const toast = useToast()
  const { copiado, copiar } = useCopiar()
  const [form, setForm] = useState(VAZIO_NOVO)
  const [sep, setSep] = useState('linkedin')
  const [editar, setEditar] = useState(false)
  const [aGuardar, setAGuardar] = useState(false)
  const aberto = !!post || novo

  useEffect(() => {
    if (!aberto) return
    setForm(novo ? { ...VAZIO_NOVO } : Object.fromEntries(CAMPOS_FORM.map(k => [k, post[k] ?? ''])))
    setSep(novo ? 'guiao' : 'linkedin')
    setEditar(!!novo)
  }, [aberto, post, novo])

  const set = k => e => setForm(f => ({ ...f, [k]: e.target.value }))

  async function guardar(extra = {}) {
    const alvo = { ...form, ...extra }
    if (!alvo.tema.trim()) { toast('Indica o tema', 'error'); return }
    if (alvo.estado === 'Publicado' && !alvo.data_publicacao) alvo.data_publicacao = hojeISO()
    // Só envia o que mudou face ao que está visível (o base não é copiado para a BD).
    const diff = novo ? alvo : Object.fromEntries(Object.entries(alvo).filter(([k, v]) => String(v ?? '') !== String(post[k] ?? '')))
    if (!novo && !Object.keys(diff).length) { onClose(); return }
    setAGuardar(true)
    try {
      const r = await apiFetch(novo ? '/api/crm/marca-pessoal/posts' : `/api/crm/marca-pessoal/posts/${post.id}`, {
        method: novo ? 'POST' : 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(diff),
      })
      if (!r.ok) throw await lerErro(r, 'Erro ao guardar')
      toast(novo ? 'Publicação criada' : 'Guardado', 'success')
      onGuardado()
      onClose()
    } catch (err) {
      toast(err.status === 400 ? err.message : friendlyError(err), 'error')
    } finally { setAGuardar(false) }
  }

  async function reporOuApagar() {
    const base = post?.base
    const ok = await confirmar(
      base ? 'Repor o conteúdo original? Perdem-se as edições, o estado, as notas e o link desta publicação.' : 'Apagar esta publicação criada na app?',
      { confirmLabel: base ? 'Repor' : 'Apagar', danger: true },
    )
    if (!ok) return
    try {
      const r = await apiFetch(`/api/crm/marca-pessoal/posts/${post.id}`, { method: 'DELETE' })
      if (!r.ok) throw await lerErro(r, 'Erro')
      toast(base ? 'Conteúdo original reposto' : 'Publicação apagada', 'success')
      onGuardado()
      onClose()
    } catch (err) { toast(friendlyError(err), 'error') }
  }

  async function arquivar() {
    const ok = await confirmar('Retirar esta publicação do plano? Deixa de aparecer no calendário.', { confirmLabel: 'Retirar', danger: true })
    if (ok) guardar({ arquivado: true })
  }

  if (!aberto) return null
  const s = SEPARADORES_TEXTO.find(x => x.key === sep)
  const texto = form[sep] || ''
  const falta = temPorPreencher(texto)

  return (
    <Modal open={aberto} onClose={onClose} size="xl"
      title={novo ? 'Nova publicação' : form.tema}
      subtitle={novo ? 'Acrescenta uma publicação ao plano' : `Mês ${post.mes} · Semana ${post.semana} · ${fmtData(form.data_prevista)} · ${form.formato}`}
      footer={
        <div className="flex flex-wrap items-center justify-between gap-2 w-full">
          <div className="flex gap-1">
            {!novo && (post.base ? (linhaDb && <Button variant="ghost" size="sm" icon={RotateCcw} onClick={reporOuApagar}>Repor original</Button>)
              : <Button variant="ghost" size="sm" icon={Trash2} onClick={reporOuApagar}>Apagar</Button>)}
            {!novo && post.base && <Button variant="ghost" size="sm" icon={EyeOff} onClick={arquivar}>Retirar do plano</Button>}
          </div>
          <div className="flex gap-2">
            <Button variant="secondary" onClick={onClose}>Fechar</Button>
            <Button onClick={() => guardar()} loading={aGuardar}>Guardar</Button>
          </div>
        </div>
      }>
      <div className="space-y-5">
        {novo ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Input label="Tema" value={form.tema} onChange={set('tema')} autoFocus wrapperClassName="sm:col-span-2" />
            <Select label="Tipo" value={form.tipo} onChange={set('tipo')}>
              <option>Literacia</option><option>Prova</option>
            </Select>
            <Input label="Pilar" value={form.pilar} onChange={set('pilar')} placeholder="Ex.: Comprar bem" />
            <Input label="Formato" value={form.formato} onChange={set('formato')} placeholder="Ex.: Carrossel" />
            <Input label="Data prevista" type="date" value={form.data_prevista} onChange={set('data_prevista')} />
            <Select label="Mês do plano" value={form.mes} onChange={set('mes')}>
              {MP_MESES.map(m => <option key={m.n} value={m.n}>Mês {m.n} · {m.nome}</option>)}
            </Select>
            <Select label="Semana" value={form.semana} onChange={set('semana')}>
              {[1, 2, 3, 4, 5].map(n => <option key={n} value={n}>Semana {n}</option>)}
            </Select>
            <Textarea label="Objectivo" value={form.objetivo} onChange={set('objetivo')} rows={2} wrapperClassName="sm:col-span-2" />
          </div>
        ) : (
          <div className="flex flex-col lg:flex-row gap-4">
            <div className="flex-1 min-w-0">
              <div className="flex flex-wrap items-center gap-1.5 mb-1.5">
                <TipoBadge tipo={form.tipo} />
                {form.pilar && <Badge tone="gray" size="xs">{form.pilar}</Badge>}
                {form.canal && <Badge tone="gray" size="xs">{form.canal}</Badge>}
              </div>
              <p className="text-ui text-ink-muted">{form.objetivo}</p>
            </div>
            <div className="grid grid-cols-2 gap-2 lg:w-80 shrink-0">
              <Select label="Estado" value={form.estado} onChange={set('estado')}>
                {MP_ESTADOS.map(x => <option key={x}>{x}</option>)}
              </Select>
              <Input label="Data prevista" type="date" value={form.data_prevista} onChange={set('data_prevista')} />
            </div>
          </div>
        )}

        <div>
          <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
            <Tabs size="sm" value={sep} onChange={setSep} items={SEPARADORES_TEXTO.map(x => ({ key: x.key, label: x.label, icon: x.icon }))} />
            <div className="flex items-center gap-1.5">
              {!novo && (
                <Button variant="ghost" size="sm" icon={editar ? Eye : Pencil} onClick={() => setEditar(e => !e)}>
                  {editar ? 'Pré-visualizar' : 'Editar'}
                </Button>
              )}
              <Button variant="secondary" size="sm" icon={copiado === sep ? Check : Copy} onClick={() => copiar(texto, sep)}>
                {copiado === sep ? 'Copiado' : 'Copiar'}
              </Button>
            </div>
          </div>
          {falta && (
            <div className="mb-2 flex items-start gap-2 rounded-lg border border-warning/30 bg-warning/10 px-3 py-2 text-caption text-warning">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>Este texto tem campos entre [ ] para preencher com dados reais. Não publicar antes de os substituir.</span>
            </div>
          )}
          {editar ? (
            <textarea value={texto} onChange={set(sep)} rows={16}
              className="w-full rounded-lg border border-line bg-surface-raised px-3 py-2.5 text-ui text-ink leading-relaxed font-[inherit] focus:outline-none focus:border-ink/30" />
          ) : (
            <div className="rounded-lg border border-line bg-surface-muted/40 px-4 py-3 max-h-[46vh] overflow-y-auto">
              {texto
                ? <p className="text-ui text-ink leading-relaxed whitespace-pre-wrap">{texto}</p>
                : <p className="text-ui text-ink-muted">Sem texto. Clica em Editar para escrever.</p>}
            </div>
          )}
          {s?.limite && (
            <p className={`mt-1 text-right text-caption num ${texto.length > s.limite ? 'text-danger' : 'text-ink-muted'}`}>
              {texto.length} / {s.limite} caracteres
            </p>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Input label="Link da publicação" value={form.link_publicacao} onChange={set('link_publicacao')} placeholder="https://www.linkedin.com/posts/..."
            suffix={form.link_publicacao && /^https?:\/\//.test(form.link_publicacao)
              ? <a href={form.link_publicacao} target="_blank" rel="noreferrer" className="text-ink-muted hover:text-ink"><ExternalLink className="w-4 h-4" /></a> : null} />
          <Input label="Data de publicação" type="date" value={form.data_publicacao} onChange={set('data_publicacao')} hint="Preenchida automaticamente ao marcar como Publicado" />
          <Textarea label="Notas" value={form.notas} onChange={set('notas')} rows={2} wrapperClassName="sm:col-span-2"
            placeholder="Ex.: valores confirmados com o João; fotos na pasta da obra" />
        </div>
      </div>
    </Modal>
  )
}

// ─── Formatos e regras ──────────────────────────────────────────────────────

function Formatos({ posts }) {
  return (
    <div className="space-y-6">
      <p className="text-ui text-ink-muted max-w-3xl">Doze formatos, sempre os mesmos, para o público os reconhecer e para a produção ser rápida. Cada formato deve ter um template no Canva com a marca Somnium (dourado e preto).</p>
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
        {MP_FORMATOS.map(f => {
          const chave = f.nome.split(' ')[0].toLowerCase()
          const n = posts.filter(p => (p.formato || '').toLowerCase().includes(chave)).length
          return (
            <Painel key={f.nome} className="p-4 flex flex-col">
              <div className="flex items-start justify-between gap-2 mb-1">
                <p className="text-sm font-semibold text-ink">{f.nome}</p>
                {n > 0 && <Badge tone="gold" size="xs">{n} no plano</Badge>}
              </div>
              <p className="text-ui text-ink-muted flex-1">{f.descricao}</p>
              <div className="mt-3 pt-3 border-t border-line flex items-center justify-between text-caption text-ink-muted">
                <span>{f.canal}</span>
                <span className="inline-flex items-center gap-1"><Clock className="w-3 h-3" />{f.tempo}</span>
              </div>
            </Painel>
          )
        })}
      </div>
    </div>
  )
}

function Regras() {
  const { copiado, copiar } = useCopiar()
  return (
    <div className="space-y-8">
      <div className="rounded-xl border border-accent/40 bg-accent/10 p-4 flex flex-col sm:flex-row sm:items-center gap-3">
        <ShieldCheck className="w-5 h-5 text-accent-ink shrink-0" />
        <div className="flex-1">
          <p className="text-ui font-semibold text-ink">Os posts educam e mostram trabalho. A captação de investidores faz-se só em conversa privada.</p>
          <p className="text-caption text-ink-muted">Antes do primeiro post: 1 hora de revisão destas regras com o jurídico externo.</p>
        </div>
      </div>

      <Secao icon={ShieldCheck} titulo="Regras de publicação">
        <TabelaSimples
          colunas={[{ key: 'tema', label: 'Tema', forte: true, nowrap: true }, { key: 'regra', label: 'Regra' }, { key: 'base', label: 'Base' }]}
          linhas={MP_REGRAS} />
      </Secao>

      <Secao icon={FileText} titulo="Projecto Lajes: o que se mostra">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <Painel className="p-4">
            <p className="text-overline uppercase font-semibold text-success mb-2">Mostrar</p>
            <ul className="space-y-2">
              {MP_LAJES_MOSTRAR.map(t => <li key={t} className="flex gap-2 text-ui text-ink"><Check className="w-4 h-4 text-success shrink-0 mt-0.5" />{t}</li>)}
            </ul>
          </Painel>
          <Painel className="p-4">
            <p className="text-overline uppercase font-semibold text-danger mb-2">Não mostrar</p>
            <ul className="space-y-2">
              {MP_LAJES_NAO_MOSTRAR.map(t => <li key={t} className="flex gap-2 text-ui text-ink"><EyeOff className="w-4 h-4 text-danger shrink-0 mt-0.5" />{t}</li>)}
            </ul>
          </Painel>
        </div>
      </Secao>

      <Secao icon={Copy} titulo="Rodapé dos posts informativos">
        <Painel className="p-4 flex items-center justify-between gap-3">
          <p className="text-ui text-ink">{MP_PLANO.rodape}</p>
          <Button variant="secondary" size="sm" icon={copiado === 'rodape' ? Check : Copy} onClick={() => copiar(MP_PLANO.rodape, 'rodape')}>
            {copiado === 'rodape' ? 'Copiado' : 'Copiar'}
          </Button>
        </Painel>
      </Secao>
    </div>
  )
}

// ─── Página ─────────────────────────────────────────────────────────────────

export function MarketingMarcaPessoal() {
  const [params, setParams] = useSearchParams()
  const vista = VISTAS.some(v => v.key === params.get('v')) ? params.get('v') : 'geral'
  const mesInicial = (() => {
    const n = Number(params.get('mes'))
    if (n >= 1 && n <= 6) return n
    const hoje = hojeISO()
    const actual = [...MP_MESES].reverse().find(m => m.semanas[0] <= hoje)
    return actual?.n || 1
  })()
  const [mes, setMesState] = useState(mesInicial)
  const [linhas, setLinhas] = useState([])
  const [erro, setErro] = useState(null)
  const [aberto, setAberto] = useState(null)
  const [novo, setNovo] = useState(false)

  function setVista(v, extra = {}) {
    const p = new URLSearchParams(params)
    p.set('v', v)
    for (const [k, val] of Object.entries(extra)) p.set(k, val)
    setParams(p, { replace: true })
  }
  function setMes(n) {
    setMesState(n)
    const p = new URLSearchParams(params)
    p.set('mes', String(n))
    setParams(p, { replace: true })
  }

  async function carregar() {
    try {
      const r = await apiFetch('/api/crm/marca-pessoal/posts')
      if (!r.ok) throw await lerErro(r, 'Não foi possível carregar o estado das publicações')
      setLinhas(await r.json())
      setErro(null)
    } catch (e) { setErro(e.message) }
  }
  useEffect(() => { carregar() }, [])

  const posts = useMemo(() => juntarPosts(linhas), [linhas])
  const linhasPorId = useMemo(() => new Map(linhas.map(l => [l.id, l])), [linhas])

  const publicados = posts.filter(p => p.estado === 'Publicado').length
  const prontos = posts.filter(p => ['Pronto', 'Agendado'].includes(p.estado)).length
  const porPreencher = posts.filter(p => p.estado !== 'Publicado' && (temPorPreencher(p.linkedin) || temPorPreencher(p.instagram))).length
  const hoje = hojeISO()
  const proximo = posts.find(p => p.estado !== 'Publicado' && (p.data_prevista || '') >= hoje) || posts.find(p => p.estado !== 'Publicado')

  return (
    <div className="space-y-6">
      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4">
        <div>
          <p className="text-overline uppercase font-semibold text-accent-ink">Marca pessoal · Alexandre Mendes</p>
          <h2 className="text-title font-semibold text-ink">Literacia imobiliária com prova real</h2>
          <p className="text-ui text-ink-muted">{MP_PLANO.periodo} · {MP_POSTS_BASE.length} publicações com guião, texto LinkedIn e legenda Instagram prontos</p>
        </div>
        <div className="overflow-x-auto max-w-full -mx-1 px-1">
          <Tabs items={VISTAS} value={vista} onChange={v => setVista(v)} />
        </div>
      </div>

      {erro && (
        <div className="flex items-start gap-2 rounded-lg border border-warning/30 bg-warning/10 px-3 py-2 text-caption text-warning">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          <span>{erro}. O plano está visível, mas estados e edições não ficam guardados até a ligação voltar.</span>
        </div>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Estatistica label="Publicadas" valor={`${publicados} / ${posts.length}`} sub={`${Math.round((publicados / Math.max(posts.length, 1)) * 100)}% do plano`} />
        <Estatistica label="Prontas ou agendadas" valor={prontos} sub="À espera de publicar" />
        <Estatistica label="Com dados por preencher" valor={porPreencher} sub="Campos [ ] nos textos" />
        <Estatistica label="Próxima publicação" valor={proximo ? fmtData(proximo.data_prevista) : 'Plano concluído'}
          sub={proximo?.tema} onClick={proximo ? () => setAberto(proximo) : undefined} />
      </div>

      {vista === 'geral' && <VisaoGeral posts={posts} irParaMes={n => { setMesState(n); setVista('calendario', { mes: String(n) }) }} />}
      {vista === 'calendario' && <Calendario posts={posts} mes={mes} setMes={setMes} onAbrir={setAberto} onNovo={() => setNovo(true)} />}
      {vista === 'formatos' && <Formatos posts={posts} />}
      {vista === 'regras' && <Regras />}

      <ModalPost
        post={aberto}
        linhaDb={aberto ? linhasPorId.get(aberto.id) : null}
        novo={novo}
        onClose={() => { setAberto(null); setNovo(false) }}
        onGuardado={carregar} />
    </div>
  )
}
