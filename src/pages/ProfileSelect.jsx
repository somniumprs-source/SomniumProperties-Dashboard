import { useAuth } from '../contexts/AuthContext.jsx'

const GOLD = '#C9A84C'

export function ProfileSelect() {
  const { profiles, selectProfile, signOut } = useAuth()

  return (
    <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: '#0d0d0d' }}>
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8">
          <img src="/logo.png" alt="Somnium Properties" className="h-16 mx-auto mb-4" />
          <div className="h-px mx-auto w-32" style={{ background: `linear-gradient(90deg, transparent, ${GOLD}55, transparent)` }} />
        </div>

        <div className="rounded-2xl p-8 border" style={{ backgroundColor: '#111', borderColor: '#1a1a1a' }}>
          <h2 className="text-white text-lg font-semibold text-center mb-2">Quem está a usar?</h2>
          <p className="text-gray-500 text-xs text-center mb-6">Seleciona o teu perfil</p>

          <div className="grid grid-cols-2 gap-4">
            {profiles.map(p => (
              <button key={p.id} onClick={() => selectProfile(p.id)}
                className="flex flex-col items-center gap-3 p-6 rounded-xl border transition-all hover:scale-105"
                style={{ backgroundColor: '#1a1a1a', borderColor: '#333' }}
                onMouseOver={e => { e.currentTarget.style.borderColor = p.cor; e.currentTarget.style.boxShadow = `0 0 20px ${p.cor}22` }}
                onMouseOut={e => { e.currentTarget.style.borderColor = '#333'; e.currentTarget.style.boxShadow = 'none' }}>
                <div className="w-16 h-16 rounded-full flex items-center justify-center text-xl font-bold text-white"
                  style={{ backgroundColor: p.cor }}>
                  {p.iniciais}
                </div>
                <span className="text-white text-sm font-medium">{p.nome}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="text-center mt-6">
          <button onClick={signOut} className="text-xs text-gray-500 hover:text-gray-300 transition-colors">
            Terminar sessão
          </button>
        </div>
      </div>
    </div>
  )
}
