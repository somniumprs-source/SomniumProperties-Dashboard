import { useEffect, useState } from 'react'
import { Share2, X, UserPlus, Trash2 } from 'lucide-react'
import { apiFetch } from '../lib/api.js'
import { useToast } from './ui/Toast.jsx'
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
          className="w-5 h-5 rounded-full bg-amber-100 text-amber-700 hover:bg-amber-500 hover:text-white flex items-center justify-center transition-colors"
          title="Partilhar acesso">
          <Share2 className="w-3 h-3" />
        </button>
      ) : (
        <button onClick={() => setOpen(true)}
          className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded transition-colors hover:bg-gray-100"
          style={{ border: '1px solid #e5e5e5', color: '#666' }}
          title="Partilhar com parceiro externo">
          <Share2 className="w-3.5 h-3.5" /> Partilhar
        </button>
      )}
      {open && <PartilharModal entidade={entidade} entidadeId={entidadeId} nome={nome} onClose={() => setOpen(false)} />}
    </>
  )
}

function PartilharModal({ entidade, entidadeId, nome, onClose }) {
  const toast = useToast()
  const [loading, setLoading] = useState(true)
  const [parceiros, setParceiros] = useState([])     // todos os users role=parceiro
  const [comAcesso, setComAcesso] = useState([])     // users que já têm acesso a este registo
  const [busy, setBusy] = useState(null)

  async function load() {
    setLoading(true)
    try {
      const [usersRes, accRes] = await Promise.all([
        apiFetch('/api/users').then(r => r.json()),
        apiFetch(`/api/acessos/${entidade}/${entidadeId}`).then(r => r.json()),
      ])
      setParceiros((usersRes.data || []).filter(u => u.role === 'parceiro' && u.ativo))
      setComAcesso(accRes.data || [])
    } catch (e) {
      toast(`Erro: ${e.message}`, 'error')
    } finally { setLoading(false) }
  }
  useEffect(() => { load() /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [entidade, entidadeId])

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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()}
        className="bg-white rounded-2xl p-6 w-full max-w-md max-h-[85vh] overflow-y-auto shadow-2xl">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h3 className="font-semibold text-gray-900 flex items-center gap-2">
              <Share2 className="w-4 h-4" style={{ color: '#C9A84C' }} /> Partilhar acesso
            </h3>
            {nome && <p className="text-xs text-gray-500 mt-0.5 truncate">{nome}</p>}
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700"><X className="w-5 h-5" /></button>
        </div>

        <p className="text-xs text-gray-500 mb-4">
          Selecciona os parceiros externos que podem ver e editar este {entidade}.
        </p>

        {loading && <p className="text-sm text-gray-400 text-center py-6">A carregar…</p>}

        {!loading && parceiros.length === 0 && (
          <div className="text-center py-6 text-sm text-gray-400">
            <UserPlus className="w-8 h-8 mx-auto mb-2 opacity-40" />
            Não há parceiros criados.
            <p className="text-xs mt-1">Vai a <span className="font-mono">Utilizadores → Convidar</span> e escolhe role <strong>parceiro</strong>.</p>
          </div>
        )}

        {!loading && parceiros.length > 0 && (
          <div className="flex flex-col gap-2">
            {parceiros.map(p => {
              const tem = !!acessoIdsByUser[p.id]
              return (
                <label key={p.id}
                  className="flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors"
                  style={{ borderColor: tem ? '#C9A84C' : '#e5e5e5', backgroundColor: tem ? '#fdf9ed' : '#fff' }}>
                  <input
                    type="checkbox"
                    checked={tem}
                    disabled={busy === p.id}
                    onChange={() => tem ? revoke(p) : grant(p)}
                    className="w-4 h-4 accent-[#C9A84C]" />
                  <div className="w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold text-white shrink-0"
                    style={{ backgroundColor: p.cor || '#C9A84C' }}>
                    {p.iniciais}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">{p.nome}</p>
                    <p className="text-xs text-gray-500 truncate">{p.email}</p>
                  </div>
                  {tem && <span className="text-[10px] uppercase tracking-widest font-semibold" style={{ color: '#C9A84C' }}>com acesso</span>}
                </label>
              )
            })}
          </div>
        )}

        <div className="mt-5 pt-4 border-t flex justify-end">
          <button onClick={onClose}
            className="px-4 py-2 text-xs rounded text-gray-600 hover:bg-gray-100">Fechar</button>
        </div>
      </div>
    </div>
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
      const r = await apiFetch(`/api/users/${userId}/acessos`).then(r => r.json())
      setItems(r.data || [])
    } finally { setLoading(false) }
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

  if (loading) return <p className="text-xs text-gray-400 px-4 py-3">A carregar…</p>
  if (!items.length) return <p className="text-xs text-gray-400 px-4 py-3">Sem acessos atribuídos.</p>

  return (
    <ul className="flex flex-col divide-y" style={{ borderColor: '#1a1a1a' }}>
      {items.map(a => (
        <li key={a.id} className="flex items-center justify-between px-4 py-2">
          <div className="min-w-0">
            <p className="text-xs text-white truncate">{a.nome || a.entidade_id}</p>
            <p className="text-[10px] text-gray-500">
              {a.entidade === 'imovel' ? 'Imóvel' : 'Negócio'}
              {a.imovel_estado && ` · ${a.imovel_estado}`}
              {a.negocio_fase && ` · ${a.negocio_fase}`}
            </p>
          </div>
          <button onClick={() => revoke(a)}
            className="p-1.5 rounded hover:bg-white/5" style={{ color: '#ef4444' }} title="Revogar">
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </li>
      ))}
    </ul>
  )
}
