import { useEffect, useState } from 'react'
import { Target, TrendingUp, MapPin, Send } from 'lucide-react'
import { apiFetch } from '../../lib/api.js'
import { EUR } from '../../constants.js'

export function MatchingInvestidoresTab({ imovelId, imovelNome }) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!imovelId) return
    setLoading(true)
    apiFetch(`/api/crm/regiao/match/imovel/${imovelId}`)
      .then(r => r.json())
      .then(d => { setData(d); setLoading(false) })
      .catch(() => setLoading(false))
  }, [imovelId])

  if (loading) return <div className="text-sm text-neutral-500">A calcular compatibilidades…</div>
  if (!data || data.error) return <div className="text-sm text-red-500">{data?.error || 'Sem dados'}</div>

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold flex items-center gap-2 text-neutral-900 dark:text-white">
            <Target className="w-5 h-5" style={{ color: '#C9A84C' }} />
            Investidores compatíveis
          </h3>
          <p className="text-xs text-neutral-500 mt-1">
            Algoritmo de score 0-100 baseado em capital disponível, região preferida, tipologia, ROI alvo e estratégia.
            Região do imóvel: <strong>{data.regiao}</strong>.
          </p>
        </div>
        <div className="text-right">
          <p className="text-xs text-neutral-400">Encontrados</p>
          <p className="text-2xl font-semibold">{data.total}</p>
        </div>
      </div>

      {data.top.length === 0 && (
        <div className="text-center py-8 text-sm text-neutral-400 bg-neutral-50 dark:bg-neutral-900 rounded-xl">
          Nenhum investidor compatível encontrado. Verifica preenchimento de capital, ROI alvo e regiões preferidas.
        </div>
      )}

      <div className="space-y-2">
        {data.top.map((inv, i) => (
          <div key={inv.id} className="bg-white dark:bg-neutral-900 rounded-xl border border-neutral-200 dark:border-neutral-800 p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs text-neutral-400 font-medium">#{i + 1}</span>
                  <h4 className="font-semibold text-neutral-900 dark:text-white">{inv.nome}</h4>
                  {inv.classificacao && (
                    <span className="text-xs px-2 py-0.5 rounded-full bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-300">
                      {inv.classificacao}
                    </span>
                  )}
                  {inv.regioes_preferidas?.map(r => (
                    <span key={r} className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300">
                      <MapPin className="w-3 h-3" /> {r}
                    </span>
                  ))}
                </div>
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {inv.reasons.map((r, j) => (
                    <span key={j} className="text-xs px-2 py-1 rounded-md bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-300">
                      {r}
                    </span>
                  ))}
                </div>
                <div className="flex flex-wrap gap-4 mt-2 text-xs text-neutral-500">
                  <span>Capital: {EUR(inv.capital_min)} – {EUR(inv.capital_max)}</span>
                  {inv.roi_pretendido && <span>ROI alvo: {inv.roi_pretendido}</span>}
                  {inv.tipo_imovel_preferido && <span>Tipologia: {inv.tipo_imovel_preferido}</span>}
                </div>
              </div>
              <div className="text-center shrink-0">
                <div className="relative w-16 h-16">
                  <svg className="w-16 h-16 transform -rotate-90">
                    <circle cx="32" cy="32" r="28" stroke="currentColor" strokeWidth="4" fill="none" className="text-neutral-200 dark:text-neutral-800" />
                    <circle cx="32" cy="32" r="28" stroke="currentColor" strokeWidth="4" fill="none"
                      strokeDasharray={`${(inv.score / 100) * 176} 176`}
                      className={inv.score >= 70 ? 'text-green-500' : inv.score >= 40 ? 'text-amber-500' : 'text-red-500'} />
                  </svg>
                  <div className="absolute inset-0 flex items-center justify-center">
                    <span className="text-sm font-bold text-neutral-900 dark:text-white">{inv.score}</span>
                  </div>
                </div>
                <p className="text-xs text-neutral-400 mt-1">score</p>
              </div>
            </div>
            <div className="mt-3 flex justify-end gap-2">
              <button
                className="flex items-center gap-1 text-xs px-2 py-1 rounded-md text-neutral-600 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800"
                onClick={() => window.location.href = `/crm?tab=Investidores&id=${inv.id}`}
              >
                Ver perfil
              </button>
              <button
                className="flex items-center gap-1 text-xs px-2 py-1 rounded-md bg-neutral-900 dark:bg-white text-white dark:text-neutral-900 hover:opacity-90"
                onClick={async () => {
                  await apiFetch('/api/crm/regiao/lead-360', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                      entidade_tipo: 'investidor', entidade_id: inv.id,
                      canal: 'proposta', direcao: 'Enviado',
                      assunto: `Match com ${imovelNome}`,
                      conteudo: `Marcado como compatível (score ${inv.score}). Motivos: ${inv.reasons.join('; ')}`,
                    }),
                  })
                  alert(`Registo guardado no Lead 360 de ${inv.nome}.`)
                }}
              >
                <Send className="w-3 h-3" /> Marcar como contactado
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
