import { Lock, RefreshCw } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext.jsx'

export function NoAccess({ area, message }) {
  const { signOut, profile, refreshProfile, session } = useAuth()
  return (
    // Ecrã de entrada: sempre escuro (bg-brand-dark é constante), cores brancas com opacidade.
    <div className="min-h-screen flex items-center justify-center bg-brand-dark px-4 py-10">
      <div className="max-w-md w-full text-center rounded-2xl p-6 sm:p-8 border border-white/10 bg-white/[0.03]">
        <div className="w-12 h-12 mx-auto rounded-full flex items-center justify-center mb-4 bg-white/[0.06] border border-white/15">
          <Lock className="w-5 h-5 text-white/70" />
        </div>
        <h1 className="font-display text-2xl text-white mb-2">Sem acesso</h1>
        <p className="text-sm text-white/75 mb-1">
          {message || (area
            ? `O teu perfil (${profile?.role || 'sem role'}) não tem acesso à área "${area}".`
            : 'Não tens permissão para esta área.')}
        </p>
        {session?.user?.email && (
          <p className="text-caption text-white/45 mb-1">Sessão: {session.user.email}</p>
        )}
        <p className="text-ui text-white/60 mb-6">Pede ao administrador para te dar acesso.</p>
        <div className="flex flex-wrap justify-center gap-2">
          {refreshProfile && (
            <button onClick={refreshProfile}
              className="flex items-center gap-1.5 text-ui font-semibold px-4 py-2 rounded-lg bg-accent text-accent-foreground hover:bg-accent/90 transition-colors duration-fast focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/50">
              <RefreshCw className="w-3.5 h-3.5" /> Tentar de novo
            </button>
          )}
          <button onClick={signOut}
            className="text-ui font-medium px-4 py-2 rounded-lg text-white/80 border border-white/15 hover:bg-white/[0.06] transition-colors duration-fast focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/50">
            Terminar sessão
          </button>
        </div>
      </div>
    </div>
  )
}
