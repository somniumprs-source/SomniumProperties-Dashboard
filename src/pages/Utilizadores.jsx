import { useEffect, useState, useCallback } from 'react'
import { Shield, Plus, Trash2, KeyRound, RefreshCw, X, Link as LinkIcon, Copy, Check } from 'lucide-react'
import { apiFetch } from '../lib/api.js'
import { useToast } from '../components/ui/Toast.jsx'
import { useAuth } from '../contexts/AuthContext.jsx'

const ROLES = [
  { id: 'admin',      label: 'Admin',      desc: 'Acesso total + gestão de utilizadores' },
  { id: 'comercial',  label: 'Comercial',  desc: 'CRM, projectos, métricas' },
  { id: 'financeiro', label: 'Financeiro', desc: 'Financeiro, métricas' },
  { id: 'operacoes',  label: 'Operações',  desc: 'Operações, alertas, métricas' },
]

const COR_PALETTE = ['#C9A84C', '#6366f1', '#10b981', '#ef4444', '#f59e0b', '#8b5cf6', '#06b6d4', '#ec4899']

export function Utilizadores() {
  const toast = useToast()
  const { profile, refreshProfile } = useAuth()
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [busy, setBusy] = useState(null)
  const [linkModal, setLinkModal] = useState(null) // { url, note }

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
    if (!confirm(`Apagar ${u.nome} (${u.email})?`)) return
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
    if (!confirm(`Gerar link de reset de password para ${u.email}?`)) return
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

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <div className="flex items-center gap-2">
            <Shield className="w-5 h-5" style={{ color: '#C9A84C' }} />
            <h1 className="text-xl font-semibold">Utilizadores</h1>
          </div>
          <p className="text-xs text-gray-500 mt-1">Gestão de acessos por camada (admin · comercial · financeiro · operações)</p>
        </div>
        <div className="flex gap-2">
          <button onClick={load}
            className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs hover:bg-white/5"
            style={{ border: '1px solid #1a1a1a', color: '#999' }}>
            <RefreshCw className="w-3.5 h-3.5" /> Atualizar
          </button>
          <button onClick={() => setShowForm(true)}
            className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium"
            style={{ backgroundColor: '#C9A84C', color: '#0d0d0d' }}>
            <Plus className="w-3.5 h-3.5" /> Convidar utilizador
          </button>
        </div>
      </div>

      {/* Legenda de roles */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-2 mb-6">
        {ROLES.map(r => (
          <div key={r.id} className="px-3 py-2 rounded-lg" style={{ border: '1px solid #1a1a1a', backgroundColor: '#0f0f0f' }}>
            <p className="text-[10px] uppercase tracking-widest font-semibold" style={{ color: '#C9A84C' }}>{r.label}</p>
            <p className="text-xs text-gray-400 mt-0.5">{r.desc}</p>
          </div>
        ))}
      </div>

      {/* Tabela */}
      <div className="rounded-xl overflow-hidden" style={{ border: '1px solid #1a1a1a' }}>
        <table className="w-full text-sm">
          <thead style={{ backgroundColor: '#0f0f0f' }}>
            <tr className="text-left text-[10px] uppercase tracking-widest text-gray-500">
              <th className="px-4 py-3">Nome</th>
              <th className="px-4 py-3">Email</th>
              <th className="px-4 py-3">Role</th>
              <th className="px-4 py-3">Estado</th>
              <th className="px-4 py-3 text-right">Ações</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr><td colSpan={5} className="px-4 py-8 text-center text-gray-500 text-xs">A carregar...</td></tr>
            )}
            {!loading && users.length === 0 && (
              <tr><td colSpan={5} className="px-4 py-8 text-center text-gray-500 text-xs">Sem utilizadores</td></tr>
            )}
            {users.map(u => (
              <tr key={u.id} style={{ borderTop: '1px solid #1a1a1a' }}>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold text-white"
                      style={{ backgroundColor: u.cor || '#C9A84C' }}>
                      {u.iniciais}
                    </div>
                    <span className="text-white">{u.nome}</span>
                    {u.id === profile?.id && (
                      <span className="text-[9px] px-1.5 py-0.5 rounded" style={{ color: '#C9A84C', backgroundColor: 'rgba(201,168,76,0.1)' }}>tu</span>
                    )}
                  </div>
                </td>
                <td className="px-4 py-3 text-gray-400 text-xs">{u.email}</td>
                <td className="px-4 py-3">
                  <select
                    value={u.role}
                    disabled={busy === u.id}
                    onChange={e => updateUser(u.id, { role: e.target.value })}
                    className="bg-transparent text-xs px-2 py-1 rounded outline-none"
                    style={{ border: '1px solid #1a1a1a', color: '#fff' }}>
                    {ROLES.map(r => <option key={r.id} value={r.id} style={{ backgroundColor: '#111' }}>{r.label}</option>)}
                  </select>
                </td>
                <td className="px-4 py-3">
                  <button
                    disabled={busy === u.id}
                    onClick={() => updateUser(u.id, { ativo: !u.ativo })}
                    className="text-[10px] px-2 py-1 rounded transition-colors"
                    style={{
                      backgroundColor: u.ativo ? 'rgba(16,185,129,0.1)' : 'rgba(239,68,68,0.1)',
                      color: u.ativo ? '#10b981' : '#ef4444',
                      border: `1px solid ${u.ativo ? 'rgba(16,185,129,0.3)' : 'rgba(239,68,68,0.3)'}`,
                    }}>
                    {u.ativo ? 'Activo' : 'Inactivo'}
                  </button>
                </td>
                <td className="px-4 py-3 text-right">
                  <div className="inline-flex gap-1">
                    <button onClick={() => magicLink(u)} disabled={busy === u.id}
                      title="Gerar magic link de acesso"
                      className="p-1.5 rounded hover:bg-white/5" style={{ color: '#999' }}>
                      <LinkIcon className="w-3.5 h-3.5" />
                    </button>
                    <button onClick={() => resetPassword(u)} disabled={busy === u.id}
                      title="Gerar reset de password"
                      className="p-1.5 rounded hover:bg-white/5" style={{ color: '#999' }}>
                      <KeyRound className="w-3.5 h-3.5" />
                    </button>
                    <button onClick={() => deleteUser(u)} disabled={busy === u.id || u.id === profile?.id}
                      title="Apagar"
                      className="p-1.5 rounded hover:bg-white/5 disabled:opacity-30 disabled:cursor-not-allowed"
                      style={{ color: '#ef4444' }}>
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showForm && (
        <InviteForm
          onClose={() => setShowForm(false)}
          onCreated={(u) => {
            setUsers(prev => [u, ...prev.filter(x => x.id !== u.id)])
            setShowForm(false)
            if (u.actionLink) setLinkModal({ url: u.actionLink, note: u.deliveryNote || `Link de acesso para ${u.email}` })
            else if (u.deliveryNote) toast(u.deliveryNote, 'success')
          }}
        />
      )}
      {linkModal && <LinkModal {...linkModal} onClose={() => setLinkModal(null)} />}
    </div>
  )
}

function LinkModal({ url, note, onClose }) {
  const [copied, setCopied] = useState(false)
  async function copy() {
    try { await navigator.clipboard.writeText(url); setCopied(true); setTimeout(() => setCopied(false), 1500) } catch {}
  }
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ backgroundColor: 'rgba(0,0,0,0.7)' }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()}
        className="rounded-2xl p-6 w-full max-w-lg" style={{ backgroundColor: '#111', border: '1px solid #1a1a1a' }}>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-white font-semibold">Link gerado</h3>
          <button type="button" onClick={onClose} className="text-gray-500 hover:text-white"><X className="w-4 h-4" /></button>
        </div>
        <p className="text-xs text-gray-400 mb-3">{note}</p>
        <div className="flex gap-2 items-stretch">
          <input readOnly value={url} onFocus={e => e.target.select()}
            className="flex-1 bg-transparent text-xs text-white px-3 py-2 rounded outline-none font-mono"
            style={{ border: '1px solid #1a1a1a' }} />
          <button onClick={copy}
            className="flex items-center gap-1.5 px-3 text-xs font-medium rounded"
            style={{ backgroundColor: '#C9A84C', color: '#0d0d0d' }}>
            {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
            {copied ? 'Copiado' : 'Copiar'}
          </button>
        </div>
      </div>
    </div>
  )
}

function InviteForm({ onClose, onCreated }) {
  const toast = useToast()
  // method: 'invite' (email Supabase) | 'magic_link' (gera link, partilhas tu) | 'password' (defines manualmente)
  const [form, setForm] = useState({ email: '', nome: '', role: 'comercial', cor: COR_PALETTE[0], method: 'magic_link', password: '' })
  const [submitting, setSubmitting] = useState(false)

  async function submit(e) {
    e.preventDefault()
    setSubmitting(true)
    try {
      const body = { email: form.email, nome: form.nome, role: form.role, cor: form.cor }
      if (form.method === 'password') body.password = form.password
      else if (form.method === 'magic_link') body.mode = 'magic_link'
      // 'invite' → sem extras: usa inviteUserByEmail
      const r = await apiFetch('/api/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const j = await r.json()
      if (!r.ok) throw new Error(j.error || 'Erro')
      onCreated(j)
    } catch (e) {
      toast(`Erro: ${e.message}`, 'error')
    } finally { setSubmitting(false) }
  }

  const methodOpts = [
    { id: 'invite',     label: 'Convite por email (Supabase envia)', hint: 'Requer SMTP configurado no Supabase.' },
    { id: 'magic_link', label: 'Gerar link de acesso (envias tu)',    hint: 'Mostra um link que copias e envias por email/WhatsApp.' },
    { id: 'password',   label: 'Definir password manualmente',         hint: 'Crias com password e partilhas as credenciais.' },
  ]

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ backgroundColor: 'rgba(0,0,0,0.7)' }} onClick={onClose}>
      <form onClick={e => e.stopPropagation()} onSubmit={submit}
        className="rounded-2xl p-6 w-full max-w-md max-h-[90vh] overflow-y-auto" style={{ backgroundColor: '#111', border: '1px solid #1a1a1a' }}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-white font-semibold">Dar acesso a uma pessoa</h3>
          <button type="button" onClick={onClose} className="text-gray-500 hover:text-white"><X className="w-4 h-4" /></button>
        </div>

        <label className="block text-[10px] uppercase tracking-widest text-gray-500 mb-1">Email</label>
        <input type="email" required value={form.email} onChange={e => setForm({ ...form, email: e.target.value })}
          placeholder="pessoa@exemplo.com"
          className="w-full bg-transparent text-sm text-white px-3 py-2 rounded mb-3 outline-none"
          style={{ border: '1px solid #1a1a1a' }} />

        <label className="block text-[10px] uppercase tracking-widest text-gray-500 mb-1">Nome</label>
        <input required value={form.nome} onChange={e => setForm({ ...form, nome: e.target.value })}
          className="w-full bg-transparent text-sm text-white px-3 py-2 rounded mb-3 outline-none"
          style={{ border: '1px solid #1a1a1a' }} />

        <label className="block text-[10px] uppercase tracking-widest text-gray-500 mb-1">Role</label>
        <select value={form.role} onChange={e => setForm({ ...form, role: e.target.value })}
          className="w-full bg-transparent text-sm text-white px-3 py-2 rounded mb-3 outline-none"
          style={{ border: '1px solid #1a1a1a' }}>
          {ROLES.map(r => <option key={r.id} value={r.id} style={{ backgroundColor: '#111' }}>{r.label} — {r.desc}</option>)}
        </select>

        <label className="block text-[10px] uppercase tracking-widest text-gray-500 mb-1">Cor</label>
        <div className="flex gap-2 mb-4">
          {COR_PALETTE.map(c => (
            <button key={c} type="button" onClick={() => setForm({ ...form, cor: c })}
              className="w-6 h-6 rounded-full transition-transform"
              style={{ backgroundColor: c, transform: form.cor === c ? 'scale(1.2)' : 'scale(1)', border: form.cor === c ? '2px solid #fff' : 'none' }} />
          ))}
        </div>

        <label className="block text-[10px] uppercase tracking-widest text-gray-500 mb-2">Como dar acesso?</label>
        <div className="flex flex-col gap-2 mb-4">
          {methodOpts.map(opt => (
            <label key={opt.id}
              className="flex items-start gap-2 p-2.5 rounded cursor-pointer"
              style={{
                border: form.method === opt.id ? '1px solid #C9A84C' : '1px solid #1a1a1a',
                backgroundColor: form.method === opt.id ? 'rgba(201,168,76,0.05)' : 'transparent',
              }}>
              <input type="radio" name="method" value={opt.id}
                checked={form.method === opt.id}
                onChange={() => setForm({ ...form, method: opt.id })}
                className="mt-0.5 accent-[#C9A84C]" />
              <div>
                <p className="text-xs text-white font-medium">{opt.label}</p>
                <p className="text-[10px] text-gray-500">{opt.hint}</p>
              </div>
            </label>
          ))}
        </div>

        {form.method === 'password' && (
          <>
            <label className="block text-[10px] uppercase tracking-widest text-gray-500 mb-1">Password</label>
            <input type="text" required minLength={8} value={form.password} onChange={e => setForm({ ...form, password: e.target.value })}
              placeholder="Mínimo 8 caracteres"
              className="w-full bg-transparent text-sm text-white px-3 py-2 rounded mb-4 outline-none font-mono"
              style={{ border: '1px solid #1a1a1a' }} />
          </>
        )}

        <div className="flex gap-2 justify-end">
          <button type="button" onClick={onClose}
            className="px-4 py-2 text-xs rounded hover:bg-white/5" style={{ color: '#999' }}>
            Cancelar
          </button>
          <button type="submit" disabled={submitting}
            className="px-4 py-2 text-xs font-medium rounded"
            style={{ backgroundColor: '#C9A84C', color: '#0d0d0d' }}>
            {submitting ? 'A criar...' : 'Dar acesso'}
          </button>
        </div>
      </form>
    </div>
  )
}
