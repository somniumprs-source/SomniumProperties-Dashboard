import { Lock, RefreshCw } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext.jsx'

export function NoAccess({ area, message }) {
  const { signOut, profile, refreshProfile, session } = useAuth()
  return (
    <div className="min-h-screen flex items-center justify-center p-6" style={{ backgroundColor: '#0d0d0d' }}>
      <div className="max-w-md w-full text-center rounded-2xl p-8 border" style={{ backgroundColor: '#111', borderColor: '#1a1a1a' }}>
        <div className="w-14 h-14 mx-auto rounded-full flex items-center justify-center mb-4"
          style={{ backgroundColor: 'rgba(201,168,76,0.12)', border: '1px solid rgba(201,168,76,0.3)' }}>
          <Lock className="w-6 h-6" style={{ color: '#C9A84C' }} />
        </div>
        <h2 className="text-white text-lg font-semibold mb-2">Sem acesso</h2>
        <p className="text-sm text-gray-400 mb-1">
          {message || (area
            ? `O teu perfil (${profile?.role || 'sem role'}) não tem acesso à área "${area}".`
            : 'Não tens permissão para esta área.')}
        </p>
        {session?.user?.email && (
          <p className="text-[10px] text-gray-600 mb-1">Sessão: {session.user.email}</p>
        )}
        <p className="text-xs text-gray-500 mb-6">Pede ao administrador para te dar acesso.</p>
        <div className="flex justify-center gap-2">
          {refreshProfile && (
            <button onClick={refreshProfile}
              className="flex items-center gap-1.5 text-xs px-4 py-2 rounded transition-colors hover:bg-white/5"
              style={{ color: '#999', border: '1px solid #1a1a1a' }}>
              <RefreshCw className="w-3 h-3" /> Tentar de novo
            </button>
          )}
          <button onClick={signOut}
            className="text-xs px-4 py-2 rounded transition-colors hover:bg-white/5"
            style={{ color: '#C9A84C', border: '1px solid rgba(201,168,76,0.3)' }}>
            Terminar sessão
          </button>
        </div>
      </div>
    </div>
  )
}
