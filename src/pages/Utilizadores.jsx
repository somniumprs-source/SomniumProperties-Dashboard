import { useEffect, useState, useCallback, useId, Fragment } from 'react'
import { SummaryStat } from '../components/ui/SummaryStat.jsx'
import { Plus, Trash2, KeyRound, Link as LinkIcon, Copy, Check, ChevronDown, ChevronRight, Users } from 'lucide-react'
import { apiFetch } from '../lib/api.js'
import { useToast } from '../components/ui/Toast.jsx'
import { ScrollableTable } from '../components/ui/ScrollableTable.jsx'
import { Modal } from '../components/ui/Modal.jsx'
import { Button } from '../components/ui/Button.jsx'
import { useAuth } from '../contexts/AuthContext.jsx'
import { AcessosDoUser } from '../components/PartilharAcesso.jsx'
import { Header } from '../components/layout/Header.jsx'
import { confirmar } from '../components/ui/ConfirmDialog.jsx'

const ROLES = [
  { id: 'admin',      label: 'Admin',      desc: 'Acesso total + gestão de utilizadores' },
  { id: 'comercial',  label: 'Comercial',  desc: 'CRM, projetos, métricas' },
  { id: 'financeiro', label: 'Financeiro', desc: 'Financeiro, métricas' },
  { id: 'operacoes',  label: 'Operações',  desc: 'Operações, alertas, métricas' },
  { id: 'parceiro',   label: 'Parceiro',   desc: 'Externo — só vê imóveis/projetos partilhados' },
  { id: 'investidor', label: 'Investidor', desc: 'Externo — só vê projetos onde foi adicionado' },
]

const COR_PALETTE = ['#C9A84C', '#475569', '#10b981', '#ef4444', '#f59e0b', '#8b5cf6', '#06b6d4', '#ec4899']

const FIELD = 'w-full bg-surface-raised text-sm text-ink px-3 py-2 rounded-lg border border-line placeholder:text-ink-muted/70 focus:outline-none focus:border-accent focus:ring-2 focus:ring-accent/30 transition-colors duration-fast'
const FIELD_LABEL = 'block text-overline uppercase font-semibold text-ink-muted mb-1.5'
const ICON_BTN = 'p-1.5 rounded-md text-ink-muted hover:text-ink hover:bg-surface-muted transition-colors duration-fast disabled:opacity-30 disabled:cursor-not-allowed'

export function Utilizadores() {
  const toast = useToast()
  const { profile, refreshProfile } = useAuth()
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  // Cada abertura do convite monta um formulário novo (estado limpo); o
  // componente fica montado ao fechar para a animação de saída correr.
  const [inviteKey, setInviteKey] = useState(0)
  const [busy, setBusy] = useState(null)
  const [linkModal, setLinkModalData] = useState(null) // { url, note }
  const [linkAberto, setLinkAberto] = useState(false)
  const [expandedUser, setExpandedUser] = useState(null) // userId expandido para mostrar acessos

  function setLinkModal(data) {
    setLinkModalData(data)
    setLinkAberto(!!data)
  }

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const r = await apiFetch('/api/users')
      const j = await r.json()
      if (!r.ok) throw new Error(j.error || 'Erro')
      setUsers(j.data || [])
    } catch (e) {
      toast(`Erro a carregar utilizadores: ${e.message}`, 'error')
    } finally { setLoading(false) }
  }, [toast])

  useEffect(() => { load() }, [load])

  async function updateUser(id, patch) {
    setBusy(id)
    try {
      const r = await apiFetch(`/api/users/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      })
      const j = await r.json()
      if (!r.ok) throw new Error(j.error || 'Erro')
      setUsers(prev => prev.map(u => u.id === id ? j : u))
      if (id === profile?.id) await refreshProfile()
      toast('Atualizado', 'success')
    } catch (e) {
      toast(`Erro: ${e.message}`, 'error')
    } finally { setBusy(null) }
  }

  async function deleteUser(u) {
    if (!(await confirmar(`Apagar ${u.nome} (${u.email})?`))) return
    setBusy(u.id)
    try {
      const r = await apiFetch(`/api/users/${u.id}`, { method: 'DELETE' })
      const j = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(j.error || 'Erro')
      setUsers(prev => prev.filter(x => x.id !== u.id))
      toast('Removido', 'success')
    } catch (e) {
      toast(`Erro: ${e.message}`, 'error')
    } finally { setBusy(null) }
  }

  async function resetPassword(u) {
    if (!(await confirmar(`Gerar link de reset de password para ${u.email}?`))) return
    setBusy(u.id)
    try {
      const r = await apiFetch(`/api/users/${u.id}/reset-password`, { method: 'POST' })
      const j = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(j.error || 'Erro')
      if (j.actionLink) setLinkModal({ url: j.actionLink, note: `Link de reset de password para ${u.email}. Partilha-o com a pessoa.` })
      else toast('Link enviado por email', 'success')
    } catch (e) {
      toast(`Erro: ${e.message}`, 'error')
    } finally { setBusy(null) }
  }

  async function magicLink(u) {
    setBusy(u.id)
    try {
      const r = await apiFetch(`/api/users/${u.id}/magic-link`, { method: 'POST' })
      const j = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(j.error || 'Erro')
      if (j.actionLink) setLinkModal({ url: j.actionLink, note: `Magic link de acesso para ${u.email}. Válido uma vez.` })
      else toast('Link gerado', 'success')
    } catch (e) {
      toast(`Erro: ${e.message}`, 'error')
    } finally { setBusy(null) }
  }

  // KPIs do hero banner
  const totalUsers = users.length
  const admins = users.filter(u => u.role === 'admin').length
  const investidores = users.filter(u => u.role === 'investidor').length
  const ativos = users.filter(u => u.ativo).length

  return (
    <>
    <Header title="Utilizadores" subtitle="Acessos, roles e permissões da equipa" onRefresh={load} loading={loading} />
    <div className="p-4 sm:p-6 max-w-6xl mx-auto min-w-0 w-full">
      {/* Hero banner — Gestão de Acessos */}
      <div className="rounded-xl border border-line bg-surface-raised p-5 sm:p-6 shadow-xs mb-6">
        <div className="relative flex items-center justify-between mb-5 gap-3 flex-wrap">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-surface-muted flex items-center justify-center">
              <Users className="w-4 h-4 text-ink-muted" strokeWidth={1.75} />
            </div>
            <div>
              <h2 className="text-overline uppercase text-ink-muted">Gestão de Acessos</h2>
              <p className="text-ui font-semibold text-ink">Utilizadores · Roles · Permissões</p>
            </div>
          </div>
          <div className="flex gap-2">
            <Button variant="primary" size="sm" icon={Plus} onClick={() => { setInviteKey(k => k + 1); setShowForm(true) }}>
              Convidar utilizador
            </Button>
          </div>
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <SummaryStat label="Total utilizadores" value={totalUsers} sub={`${ROLES.length} roles definidos`} />
          <SummaryStat label="Admins" value={admins} sub="acesso total" />
          <SummaryStat label="Investidores" value={investidores} sub="acesso externo" />
          <SummaryStat label="Ativos" value={ativos} sub={`${totalUsers - ativos} inativos`} />
        </div>
      </div>

      {/* Painel de diagnóstico */}
      <DiagnosticoPanel />

      {/* Legenda de roles */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 mb-6">
        {ROLES.map(r => (
          <div key={r.id} className="px-3 py-2 rounded-lg border border-line bg-surface-raised">
            <p className="text-overline uppercase font-semibold text-ink">{r.label}</p>
            <p className="text-xs text-ink-muted mt-0.5">{r.desc}</p>
          </div>
        ))}
      </div>

      {/* Tabela */}
      <div className="rounded-xl overflow-hidden border border-line bg-surface-raised">
        <ScrollableTable>
        <table className="w-full text-sm min-w-[560px]">
          <thead className="bg-surface-muted/60">
            <tr className="text-left text-overline uppercase text-ink-muted">
              <th className="px-4 py-3 font-semibold">Nome</th>
              <th className="px-4 py-3 font-semibold">Email</th>
              <th className="px-4 py-3 font-semibold">Role</th>
              <th className="px-4 py-3 font-semibold">Estado</th>
              <th className="px-4 py-3 font-semibold text-right">Ações</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr><td colSpan={5} className="px-4 py-8 text-center text-ink-muted text-xs">A carregar…</td></tr>
            )}
            {!loading && users.length === 0 && (
              <tr><td colSpan={5} className="px-4 py-8 text-center text-ink-muted text-xs">Sem utilizadores</td></tr>
            )}
            {users.map(u => (
              <Fragment key={u.id}>
              <tr className="border-t border-line">
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    {u.role === 'parceiro' ? (
                      <button onClick={() => setExpandedUser(expandedUser === u.id ? null : u.id)}
                        aria-expanded={expandedUser === u.id}
                        className="text-ink-muted hover:text-ink transition-colors duration-fast" title="Ver acessos" aria-label="Ver acessos">
                        {expandedUser === u.id ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                      </button>
                    ) : <span className="w-3.5" />}
                    <div className="w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold text-white shrink-0 bg-[var(--cor)]"
                      style={{ '--cor': u.cor || '#C9A84C' }}>
                      {u.iniciais}
                    </div>
                    <span className="text-ink font-medium">{u.nome}</span>
                    {u.id === profile?.id && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-accent/10 text-accent-ink font-semibold">tu</span>
                    )}
                  </div>
                </td>
                <td className="px-4 py-3 text-ink-muted text-xs">{u.email}</td>
                <td className="px-4 py-3">
                  <select
                    value={u.role}
                    disabled={busy === u.id}
                    onChange={e => updateUser(u.id, { role: e.target.value })}
                    aria-label={`Role de ${u.nome}`}
                    className="bg-surface-raised text-ink text-xs px-2 py-1 rounded-md border border-line focus:outline-none focus:border-accent focus:ring-2 focus:ring-accent/30 transition-colors duration-fast disabled:opacity-50">
                    {ROLES.map(r => <option key={r.id} value={r.id}>{r.label}</option>)}
                  </select>
                </td>
                <td className="px-4 py-3">
                  <button
                    disabled={busy === u.id}
                    onClick={() => updateUser(u.id, { ativo: !u.ativo })}
                    title={u.ativo ? 'Clicar para desativar' : 'Clicar para ativar'}
                    className={`text-[11px] font-medium px-2 py-1 rounded-md border transition-colors duration-fast disabled:opacity-50 ${
                      u.ativo
                        ? 'bg-success/10 text-success border-success/30 hover:bg-success/15'
                        : 'bg-danger/10 text-danger border-danger/30 hover:bg-danger/15'
                    }`}>
                    {u.ativo ? 'Ativo' : 'Inativo'}
                  </button>
                </td>
                <td className="px-4 py-3 text-right">
                  <div className="inline-flex gap-1">
                    <button onClick={() => magicLink(u)} disabled={busy === u.id}
                      title="Gerar magic link de acesso" aria-label="Gerar magic link de acesso"
                      className={ICON_BTN}>
                      <LinkIcon className="w-3.5 h-3.5" />
                    </button>
                    <button onClick={() => resetPassword(u)} disabled={busy === u.id}
                      title="Gerar reset de password" aria-label="Gerar reset de password"
                      className={ICON_BTN}>
                      <KeyRound className="w-3.5 h-3.5" />
                    </button>
                    <button onClick={() => deleteUser(u)} disabled={busy === u.id || u.id === profile?.id}
                      title="Apagar" aria-label={`Apagar ${u.nome}`}
                      className="p-1.5 rounded-md text-danger/80 hover:text-danger hover:bg-danger/10 transition-colors duration-fast disabled:opacity-30 disabled:cursor-not-allowed">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </td>
              </tr>
              {u.role === 'parceiro' && expandedUser === u.id && (
                <tr className="bg-surface border-t border-line">
                  <td colSpan={5} className="p-0">
                    <div className="px-4 py-3">
                      <p className="text-overline uppercase text-ink-muted mb-1">Acessos atribuídos</p>
                      <p className="text-caption text-ink-muted mb-2">Para conceder acesso, vai ao detalhe do imóvel ou projeto e clica "Partilhar".</p>
                    </div>
                    <AcessosDoUser userId={u.id} />
                  </td>
                </tr>
              )}
              </Fragment>
            ))}
          </tbody>
        </table>
        </ScrollableTable>
      </div>

      <InviteForm
        key={inviteKey}
        open={showForm}
        onClose={() => setShowForm(false)}
        onCreated={(u) => {
          setUsers(prev => [u, ...prev.filter(x => x.id !== u.id)])
          setShowForm(false)
          if (u.actionLink) setLinkModal({ url: u.actionLink, note: u.deliveryNote || `Link de acesso para ${u.email}` })
          else if (u.deliveryNote) toast(u.deliveryNote, 'success')
        }}
      />
      <LinkModal open={linkAberto} url={linkModal?.url || ''} note={linkModal?.note} onClose={() => setLinkAberto(false)} />
    </div>
    </>
  )
}


function DiagnosticoPanel() {
  const [info, setInfo] = useState(null)
  const [loading, setLoading] = useState(true)
  const [open, setOpen] = useState(true)
  useEffect(() => {
    apiFetch('/api/users/whoami')
      .then(r => r.json())
      .then(setInfo)
      .catch(e => setInfo({ error: e.message }))
      .finally(() => setLoading(false))
  }, [])

  if (loading) return null
  return (
    <div className="mb-4 rounded-lg overflow-hidden border border-line bg-surface-raised">
      <button onClick={() => setOpen(!open)} aria-expanded={open}
        className="w-full px-3 py-2 text-left text-overline uppercase font-semibold flex items-center justify-between text-ink-muted hover:text-ink hover:bg-surface-muted transition-colors duration-fast">
        Diagnóstico de sessão
        {open ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
      </button>
      {open && (
        <pre className="p-3 text-[11px] text-ink-muted bg-surface overflow-x-auto whitespace-pre-wrap border-t border-line">
          {JSON.stringify(info, null, 2)}
        </pre>
      )}
    </div>
  )
}

function LinkModal({ open, url, note, onClose }) {
  const [copied, setCopied] = useState(false)
  async function copy() {
    try { await navigator.clipboard.writeText(url); setCopied(true); setTimeout(() => setCopied(false), 1500) } catch {}
  }
  return (
    <Modal open={open} onClose={onClose} size="md" title="Link gerado" subtitle={note}
      footer={<Modal.Footer><Button variant="secondary" onClick={onClose}>Fechar</Button></Modal.Footer>}>
      <div className="flex gap-2 items-stretch">
        <input readOnly value={url} onFocus={e => e.target.select()} aria-label="Link"
          className={`${FIELD} flex-1 min-w-0 text-xs num`} />
        <Button variant="primary" icon={copied ? Check : Copy} onClick={copy}>
          {copied ? 'Copiado' : 'Copiar'}
        </Button>
      </div>
    </Modal>
  )
}

function InviteForm({ open, onClose, onCreated }) {
  const toast = useToast()
  const formId = useId()
  const [form, setForm] = useState({ email: '', nome: '', role: 'comercial', cor: COR_PALETTE[0], method: 'magic_link', password: '', investidor_id: '' })
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState(null)
  const [investidores, setInvestidores] = useState([])

  // Quando role=investidor, carrega lista de investidores sem user_id ligado
  useEffect(() => {
    if (form.role !== 'investidor') { setInvestidores([]); return }
    apiFetch('/api/crm/investidores?limit=1000')
      .then(r => r.ok ? r.json() : null)
      .then(j => setInvestidores(j?.data?.filter(i => !i.user_id) || []))
      .catch(() => {})
  }, [form.role])

  // Auto-preencher nome/email a partir do investidor selecionado
  useEffect(() => {
    if (!form.investidor_id) return
    const inv = investidores.find(i => i.id === form.investidor_id)
    if (inv) {
      setForm(f => ({
        ...f,
        nome: f.nome || inv.nome || '',
        email: f.email || inv.email || '',
      }))
    }
  }, [form.investidor_id])

  async function submit(e) {
    e.preventDefault()
    setSubmitting(true)
    setError(null)
    try {
      const body = { email: form.email, nome: form.nome, role: form.role, cor: form.cor }
      if (form.method === 'password') body.password = form.password
      else if (form.method === 'magic_link') body.mode = 'magic_link'
      const r = await apiFetch('/api/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const j = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`)

      // Ligar investidor existente ao user criado (se aplicável). O POST /users
      // devolve o utilizador no topo (j.id), não em j.user. Ao gravar user_id,
      // o backend concede automaticamente acesso aos projectos do investidor.
      if (form.role === 'investidor' && form.investidor_id && j.id) {
        await apiFetch(`/api/crm/investidores/${form.investidor_id}`, {
          method: 'PUT', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ user_id: j.id }),
        }).catch(() => {})
      }

      onCreated(j)
    } catch (e) {
      setError(e.message)
      toast(`Erro: ${e.message}`, 'error')
    } finally { setSubmitting(false) }
  }

  const methodOpts = [
    { id: 'invite',     label: 'Convite por email (Supabase envia)', hint: 'Requer SMTP configurado no Supabase.' },
    { id: 'magic_link', label: 'Gerar link de acesso (envias tu)',    hint: 'Mostra um link que copias e envias por email/WhatsApp.' },
    { id: 'password',   label: 'Definir password manualmente',         hint: 'Crias com password e partilhas as credenciais.' },
  ]

  return (
    <Modal open={open} onClose={onClose} size="md" title="Dar acesso a uma pessoa"
      footer={
        <Modal.Footer>
          <Button type="button" variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button type="submit" form={formId} variant="primary" loading={submitting}>
            {submitting ? 'A criar…' : 'Dar acesso'}
          </Button>
        </Modal.Footer>
      }>
      <form id={formId} onSubmit={submit} className="flex flex-col gap-3">
        <div>
          <label className={FIELD_LABEL} htmlFor={`${formId}-email`}>Email</label>
          <input id={`${formId}-email`} type="email" required value={form.email} onChange={e => setForm({ ...form, email: e.target.value })}
            placeholder="pessoa@exemplo.com" className={FIELD} />
        </div>

        <div>
          <label className={FIELD_LABEL} htmlFor={`${formId}-nome`}>Nome</label>
          <input id={`${formId}-nome`} required value={form.nome} onChange={e => setForm({ ...form, nome: e.target.value })}
            className={FIELD} />
        </div>

        <div>
          <label className={FIELD_LABEL} htmlFor={`${formId}-role`}>Role</label>
          <select id={`${formId}-role`} value={form.role} onChange={e => setForm({ ...form, role: e.target.value })} className={FIELD}>
            {ROLES.map(r => <option key={r.id} value={r.id}>{r.label} — {r.desc}</option>)}
          </select>
        </div>

        {form.role === 'investidor' && (
          <div>
            <label className={FIELD_LABEL} htmlFor={`${formId}-inv`}>Ligar a investidor existente (opcional)</label>
            <select id={`${formId}-inv`} value={form.investidor_id} onChange={e => setForm({ ...form, investidor_id: e.target.value })} className={FIELD}>
              <option value="">— Sem ligação —</option>
              {investidores.map(i => (
                <option key={i.id} value={i.id}>{i.nome}{i.email ? ` · ${i.email}` : ''}</option>
              ))}
            </select>
            <p className="text-caption text-ink-muted mt-1">Sugestão: liga ao registo na lista de Investidores. Auto-preenche nome/email.</p>
          </div>
        )}

        <div>
          <span className={FIELD_LABEL}>Cor</span>
          <div className="flex flex-wrap gap-2.5">
            {COR_PALETTE.map(c => (
              <button key={c} type="button" onClick={() => setForm({ ...form, cor: c })}
                aria-label={`Cor ${c}`} aria-pressed={form.cor === c}
                className={`w-6 h-6 rounded-full bg-[var(--cor)] transition-transform duration-fast ease-entry ${form.cor === c ? 'scale-110 ring-2 ring-ink ring-offset-2 ring-offset-surface-raised' : ''}`}
                style={{ '--cor': c }} />
            ))}
          </div>
        </div>

        <div>
          <span className={FIELD_LABEL}>Como dar acesso?</span>
          <div className="flex flex-col gap-2">
            {methodOpts.map(opt => (
              <label key={opt.id}
                className={`flex items-start gap-2 p-2.5 rounded-lg border cursor-pointer transition-colors duration-fast ${
                  form.method === opt.id ? 'border-accent bg-accent/5' : 'border-line hover:bg-surface-muted'
                }`}>
                <input type="radio" name="method" value={opt.id}
                  checked={form.method === opt.id}
                  onChange={() => setForm({ ...form, method: opt.id })}
                  className="mt-0.5 accent-accent" />
                <div>
                  <p className="text-xs text-ink font-medium">{opt.label}</p>
                  <p className="text-caption text-ink-muted">{opt.hint}</p>
                </div>
              </label>
            ))}
          </div>
        </div>

        {form.method === 'password' && (
          <div>
            <label className={FIELD_LABEL} htmlFor={`${formId}-pw`}>Password</label>
            <input id={`${formId}-pw`} type="text" required minLength={8} value={form.password} onChange={e => setForm({ ...form, password: e.target.value })}
              placeholder="Mínimo 8 caracteres" className={`${FIELD} num`} />
          </div>
        )}

        {error && (
          <div className="p-3 rounded-lg text-xs bg-danger/10 border border-danger/30 text-danger" role="alert">
            <p className="font-semibold mb-1">Erro a criar utilizador:</p>
            <p className="num break-words">{error}</p>
          </div>
        )}
      </form>
    </Modal>
  )
}
