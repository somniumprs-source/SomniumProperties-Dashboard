import { useEffect } from 'react'
import { MapPin, Building2 } from 'lucide-react'
import { REGIAO_LABEL, REGIAO_COR } from '../constants.js'
import { getUltimaRegiao } from '../contexts/RegiaoContext.jsx'

const REGIOES_META = {
  Coimbra: {
    titulo: 'Coimbra',
    sub: 'Operação base · estabelecida',
    desc: 'Mercado consolidado, pipeline activo, equipa principal.',
    Icon: MapPin,
  },
  AMP: {
    titulo: 'Área Metropolitana do Porto',
    sub: 'Porto · Vila Nova de Gaia',
    desc: 'Expansão wholesaling, equipa local autónoma, pipeline em construção.',
    Icon: Building2,
  },
}

/**
 * Modal de escolha de região. Recebe um gate (resultado de useRegiaoGate)
 * via props ou os campos individuais.
 *
 *   <RegiaoModal gate={gate} contexto="o módulo Projectos" />
 */
export function RegiaoModal({ gate, contexto }) {
  const { modalAberto, regiao, setRegiao, fecharModal, regioesDisponiveis } = gate
  const ultimaRegiao = getUltimaRegiao()

  useEffect(() => {
    if (!modalAberto) return
    function onKey(e) { if (e.key === 'Escape' && regiao) fecharModal() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [modalAberto, regiao, fecharModal])

  if (!modalAberto) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-black/70 backdrop-blur-md animate-fade-in">
      <div className="w-full max-w-3xl">
        <div className="text-center mb-8">
          <img src="/logo-transparent.png" alt="Somnium" className="mx-auto opacity-80" style={{ height: 40 }} />
          <h1 className="mt-4 text-2xl font-semibold tracking-tight text-white">
            Em que região vai trabalhar?
          </h1>
          <p className="mt-1 text-sm text-neutral-400">
            {contexto
              ? `${contexto} fica restrito à região escolhida.`
              : 'Esta área da dashboard fica restrita à região escolhida.'}
          </p>
          {ultimaRegiao && !regiao && (
            <p className="mt-2 text-xs text-neutral-500">
              Última escolha: <span className="text-neutral-300">{REGIAO_LABEL[ultimaRegiao]}</span>
            </p>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {regioesDisponiveis.map(r => {
            const meta = REGIOES_META[r]
            const Icon = meta.Icon
            const cor = REGIAO_COR[r]
            const isActive = regiao === r
            return (
              <button
                key={r}
                onClick={() => setRegiao(r)}
                className={`group relative overflow-hidden rounded-2xl border-2 transition-all p-8 text-left
                  ${isActive ? 'border-white/40' : 'border-neutral-800 hover:border-neutral-700'}
                  bg-neutral-900 hover:bg-neutral-800/80
                  focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-black focus:ring-white/30`}
                style={{ minHeight: 220 }}
              >
                <div
                  className="absolute inset-x-0 top-0 h-1 opacity-70 group-hover:opacity-100 transition-opacity"
                  style={{ backgroundColor: cor }}
                />
                <div className="flex items-start justify-between">
                  <div
                    className="w-12 h-12 rounded-xl flex items-center justify-center"
                    style={{ backgroundColor: `${cor}22`, color: cor }}
                  >
                    <Icon className="w-6 h-6" />
                  </div>
                  {isActive && (
                    <span className="text-xs px-2 py-1 rounded-full bg-white/10 text-white">activa</span>
                  )}
                </div>
                <h2 className="mt-5 text-xl font-semibold text-white">{meta.titulo}</h2>
                <p className="mt-1 text-xs uppercase tracking-wider text-neutral-500">{meta.sub}</p>
                <p className="mt-3 text-sm text-neutral-400 leading-relaxed">{meta.desc}</p>
                <div className="mt-5 flex items-center gap-2 text-sm font-medium" style={{ color: cor }}>
                  Entrar em {r === 'AMP' ? 'AMP' : r}
                  <span className="transition-transform group-hover:translate-x-1">→</span>
                </div>
              </button>
            )
          })}
        </div>

        {regiao && (
          <div className="text-center mt-6">
            <button
              onClick={fecharModal}
              className="text-sm text-neutral-500 hover:text-neutral-300 transition-colors"
            >
              Cancelar (manter {REGIAO_LABEL[regiao]})
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
