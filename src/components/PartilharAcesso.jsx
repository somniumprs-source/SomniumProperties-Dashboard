import { useEffect, useState } from 'react'
import { Share2, UserPlus, Trash2 } from 'lucide-react'
import { apiFetch, apiFetchJson } from '../lib/api.js'
import { useToast } from './ui/Toast.jsx'
import { Modal } from './ui/Modal.jsx'
import { Button } from './ui/Button.jsx'
import { useAuth } from '../contexts/AuthContext.jsx'

/**
 * Botão + modal para gerir quem tem acesso a um registo (imóvel ou negócio).
 * Só renderiza para admins.
 *
 * Uso: <PartilharAcesso entidade="imovel" entidadeId={imovel.id} nome={imovel.nome} />
 */
export function PartilharAcesso({ entidade, entidadeId, nome, compact = false }) {
  const { profile } = useAuth()
  const [open, setOpen] = useState(false)
  if (profile?.role !== 'admin') return null
  if (!entidadeId) return null

  return (
    <>
      {compact ? (
        <button onClick={(e) => { e.stopPropagation(); setOpen(true) }}
          className="w-5 h-5 rounded-full bg-warning/15 text-warning hover:bg-warning hover:text-white flex items-center justify-center transition-colors"
          title="Partilhar acesso">
          <Share2 className="w-3 h-3" />
        </button>
      ) : (
        <button onClick={() => setOpen(true)}
          className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-md border border-line text-ink-muted hover:text-ink transition-colors hover:bg-surface-muted"
          title="Partilhar com parceiro externo">
          <Share2 className="w-3.5 h-3.5" /> Partilhar
        </button>
      )}
      <PartilharModal open={open} entidade={entidade} entidadeId={entidadeId} nome={nome} onClose={() => setOpen(false)} />
    </>
  )
}

function PartilharModal({ open, entidade, entidadeId, nome, onClose }) {
  const toast = useToast()
  const [loading, setLoading] = useState(true)
  const [parceiros, setParceiros] = useState([])     // todos os users role=parceiro
  const [comAcesso, setComAcesso] = useState([])     // users que já têm acesso a este registo
  const [busy, setBusy] = useState(null)

  async function load() {
    setLoading(true)
    try {
      const [usersRes, accRes] = await Promise.all([
        apiFetchJson('/api/users'),
        apiFetchJson(`/api/acessos/${entidade}/${entidadeId}`),
      ])
      setParceiros((usersRes.data || []).filter(u => u.role === 'parceiro' && u.ativo))
      setComAcesso(accRes.data || [])
    } catch (e) {
      toast(`Erro: ${e.message}`, 'error')
    } finally { setLoading(false) }
  }
  useEffect(() => { if (open) load() /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [open, entidade, entidadeId])

  const acessoIdsByUser = Object.fromEntries(comAcesso.map(a => [a.user_id, a.acesso_id]))

  async function grant(user) {
    setBusy(user.id)
    try {
      const r = await apiFetch(`/api/users/${user.id}/acessos`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ entidade, entidade_id: entidadeId }),
      })
      const j = await r.json()
      if (!r.ok) throw new Error(j.error || 'Erro')
      toast(`${user.nome} agora tem acesso`, 'success')
      load()
    } catch (e) { toast(`Erro: ${e.message}`, 'error') }
    finally { setBusy(null) }
  }

  async function revoke(user) {
    const acessoId = acessoIdsByUser[user.id]
    if (!acessoId) return
    setBusy(user.id)
    try {
      const r = await apiFetch(`/api/users/${user.id}/acessos/${acessoId}`, { method: 'DELETE' })
      if (!r.ok) {
        const j = await r.json().catch(() => ({}))
        throw new Error(j.error || 'Erro')
      }
      toast(`Acesso removido de ${user.nome}`, 'success')
      load()
    } catch (e) { toast(`Erro: ${e.message}`, 'error') }
    finally { setBusy(null) }
  }

  return (
    <Modal open={open} onClose={onClose} size="md"
      title={<span className="flex items-center gap-2"><Share2 className="w-4 h-4 text-accent-ink" /> Partilhar acesso</span>}
      subtitle={nome || undefined}
      footer={<Modal.Footer><Button variant="secondary" onClick={onClose}>Fechar</Button></Modal.Footer>}>
        <p className="text-xs text-ink-muted mb-4">
          Seleciona os parceiros externos que podem consultar este {entidade} (só leitura).
        </p>

        {loading && <p className="text-sm text-ink-muted text-center py-6">A carregar…</p>}

        {!loading && parceiros.length === 0 && (
          <div className="text-center py-6 text-sm text-ink-muted">
            <UserPlus className="w-8 h-8 mx-auto mb-2 opacity-40" />
            Não há parceiros criados.
            <p className="text-xs mt-1">Vai a <span className="num">Utilizadores → Convidar</span> e escolhe role <strong>parceiro</strong>.</p>
          </div>
        )}

        {!loading && parceiros.length > 0 && (
          <div className="flex flex-col gap-2">
            {parceiros.map(p => {
              const tem = !!acessoIdsByUser[p.id]
              return (
                <label key={p.id}
                  className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors duration-fast ${tem ? 'border-accent bg-accent/10' : 'border-line bg-surface-raised hover:bg-surface'}`}>
                  <input
                    type="checkbox"
                    checked={tem}
                    disabled={busy === p.id}
                    onChange={() => tem ? revoke(p) : grant(p)}
                    className="w-4 h-4 accent-accent" />
                  <div className="w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold text-white shrink-0 bg-[var(--cor)]"
                    style={{ '--cor': p.cor || '#C9A84C' }}>
                    {p.iniciais}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-ink truncate">{p.nome}</p>
                    <p className="text-xs text-ink-muted truncate">{p.email}</p>
                  </div>
                  {tem && <span className="text-[10px] uppercase tracking-widest font-semibold text-accent-ink">com acesso</span>}
                </label>
              )
            })}
          </div>
        )}
    </Modal>
  )
}

/**
 * Lista compacta de acessos de um user (para a página /admin/utilizadores).
 */
export function AcessosDoUser({ userId }) {
  const toast = useToast()
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)

  async function load() {
    setLoading(true)
    try {
      const r = await apiFetchJson(`/api/users/${userId}/acessos`)
      setItems(r.data || [])
    } catch (e) { toast(`Erro: ${e.message}`, 'error') }
    finally { setLoading(false) }
  }
  useEffect(() => { load() /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [userId])

  async function revoke(a) {
    if (!confirm(`Remover acesso a "${a.nome || a.entidade_id}"?`)) return
    try {
      const r = await apiFetch(`/api/users/${userId}/acessos/${a.id}`, { method: 'DELETE' })
      if (!r.ok) throw new Error('Erro')
      toast('Removido', 'success')
      load()
    } catch (e) { toast(`Erro: ${e.message}`, 'error') }
  }

  if (loading) return <p className="text-xs text-ink-muted px-4 py-3">A carregar…</p>
  if (!items.length) return <p className="text-xs text-ink-muted px-4 py-3">Sem acessos atribuídos.</p>

  return (
    <ul className="flex flex-col divide-y divide-line">
      {items.map(a => (
        <li key={a.id} className="flex items-center justify-between px-4 py-2">
          <div className="min-w-0">
            <p className="text-xs text-ink truncate">{a.nome || a.entidade_id}</p>
            <p className="text-[10px] text-ink-muted">
              {a.entidade === 'imovel' ? 'Imóvel' : 'Negócio'}
              {a.imovel_estado && ` · ${a.imovel_estado}`}
              {a.negocio_fase && ` · ${a.negocio_fase}`}
            </p>
          </div>
          <button onClick={() => revoke(a)}
            className="p-1.5 rounded text-ink-muted hover:text-danger hover:bg-danger/10 transition-colors duration-fast" title="Revogar" aria-label="Revogar acesso">
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </li>
      ))}
    </ul>
  )
}
