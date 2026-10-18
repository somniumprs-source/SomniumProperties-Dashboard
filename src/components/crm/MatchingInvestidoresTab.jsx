import { useEffect, useState } from 'react'
import { Target, TrendingUp, MapPin, Send, AlertTriangle } from 'lucide-react'
import { apiFetch } from '../../lib/api.js'
import { useToast } from '../ui/Toast.jsx'
import { friendlyError } from '../../lib/friendlyError.js'
import { EUR } from '../../constants.js'

const CAMPO_LABEL = {
  capital_max: 'capital máximo',
  regioes_preferidas: 'regiões preferidas',
  tipo_imovel_preferido: 'tipo de imóvel preferido',
  roi_pretendido: 'ROI previsto',
  estrategia: 'estratégia',
}

export function MatchingInvestidoresTab({ imovelId, imovelNome }) {
  const toast = useToast()
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

  if (loading) return <div className="text-sm text-ink-muted">A calcular compatibilidades…</div>
  if (!data || data.error) return <div className="text-sm text-danger">{data?.error || 'Sem dados'}</div>

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold flex items-center gap-2 text-ink ">
            <Target className="w-5 h-5 text-accent-ink" />
            Investidores compatíveis
          </h3>
          <p className="text-xs text-ink-muted mt-1">
            Algoritmo de score 0-100 baseado em capital disponível, região preferida, tipologia, ROI alvo e estratégia.
            Região do imóvel: <strong>{data.regiao}</strong>.
          </p>
        </div>
        <div className="text-right">
          <p className="text-xs text-ink-muted">Encontrados</p>
          <p className="text-2xl font-semibold">{data.total}</p>
        </div>
      </div>

      {data.top.length === 0 && (
        <div className="text-center py-8 text-sm text-ink-muted bg-surface  rounded-xl">
          Nenhum investidor elegível encontrado (todos "Não qualificado" ou "Inactivo").
        </div>
      )}

      <div className="space-y-2">
        {data.top.map((inv, i) => (
          <div key={inv.id} className="bg-surface-raised  rounded-xl border border-line  p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs text-ink-muted font-medium">#{i + 1}</span>
                  <h4 className="font-semibold text-ink ">{inv.nome}</h4>
                  {inv.classificacao && (
                    <span className="text-xs px-2 py-0.5 rounded-full bg-surface-muted  text-ink-muted ">
                      {inv.classificacao}
                    </span>
                  )}
                  {inv.regioes_preferidas?.map(r => (
                    <span key={r} className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-surface-muted text-ink dark:bg-blue-900/30 dark:text-blue-300">
                      <MapPin className="w-3 h-3" /> {r}
                    </span>
                  ))}
                </div>
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {inv.reasons.map((r, j) => (
                    <span key={j} className="text-xs px-2 py-1 rounded-md bg-success/10 dark:bg-green-900/20 text-success dark:text-green-300">
                      {r}
                    </span>
                  ))}
                  {inv.campos_em_falta?.length > 0 && (
                    <span className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-md bg-warning/10 dark:bg-amber-900/20 text-warning dark:text-amber-300">
                      <AlertTriangle className="w-3 h-3" />
                      Faltam: {inv.campos_em_falta.map(c => CAMPO_LABEL[c] || c).join(', ')}
                    </span>
                  )}
                </div>
                <div className="flex flex-wrap gap-4 mt-2 text-xs text-ink-muted">
                  <span>Capital: {EUR(inv.capital_min)} – {EUR(inv.capital_max)}</span>
                  {inv.roi_pretendido && <span>ROI previsto: {inv.roi_pretendido}</span>}
                  {inv.roi_anualizado_pretendido && <span>ROI anualizado: {inv.roi_anualizado_pretendido}</span>}
                  {inv.tipo_imovel_preferido && <span>Tipologia: {inv.tipo_imovel_preferido}</span>}
                </div>
              </div>
              <div className="text-center shrink-0">
                <div className="relative w-16 h-16">
                  <svg className="w-16 h-16 transform -rotate-90">
                    <circle cx="32" cy="32" r="28" stroke="currentColor" strokeWidth="4" fill="none" className="text-neutral-200 " />
                    <circle cx="32" cy="32" r="28" stroke="currentColor" strokeWidth="4" fill="none"
                      strokeDasharray={`${(inv.score / 100) * 176} 176`}
                      className={inv.score >= 70 ? 'text-success' : inv.score >= 40 ? 'text-warning' : 'text-danger'} />
                  </svg>
                  <div className="absolute inset-0 flex items-center justify-center">
                    <span className="text-sm font-bold text-ink ">{inv.score}</span>
                  </div>
                </div>
                <p className="text-xs text-ink-muted mt-1">score</p>
              </div>
            </div>
            <div className="mt-3 flex justify-end gap-2">
              <button
                className="flex items-center gap-1 text-xs px-2 py-1 rounded-md text-ink-muted  hover:bg-surface-muted "
                onClick={() => window.location.href = `/crm?tab=Investidores&id=${inv.id}`}
              >
                Ver perfil
              </button>
              <button
                className="flex items-center gap-1 text-xs px-2 py-1 rounded-md bg-ink text-surface hover:opacity-90"
                onClick={async () => {
                  const r = await apiFetch('/api/crm/regiao/lead-360', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                      entidade_tipo: 'investidor', entidade_id: inv.id,
                      canal: 'proposta', direcao: 'Enviado',
                      assunto: `Match com ${imovelNome}`,
                      conteudo: `Marcado como compatível (score ${inv.score}). Motivos: ${inv.reasons.join('; ')}`,
                    }),
                  }).catch(e => e)
                  if (r?.ok) toast(`Registo guardado no Lead 360 de ${inv.nome}.`, 'success')
                  else toast(friendlyError(r instanceof Error ? r : { status: r?.status }), 'error')
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
