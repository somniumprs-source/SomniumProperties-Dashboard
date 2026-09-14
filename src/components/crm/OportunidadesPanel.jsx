/**
 * Oportunidades — fila de candidatos a imóvel da pesquisa diária Idealista
 * (SOP 1 §5.2.1, cron-procura-imoveis). Aprovar cria o imóvel no CRM, pronto
 * para Cold Call em 24h; rejeitar descarta e não volta a aparecer.
 */
import { useEffect, useState } from 'react'
import { ImageOff, MapPin, Home, Calendar, Ruler } from 'lucide-react'
import { apiFetch } from '../../lib/api.js'
import { useToast } from '../ui/Toast.jsx'
import { Modal } from '../ui/Modal.jsx'
import { QuickCheck } from '../analise/QuickCheck.jsx'
import { EUR } from '../../constants.js'

const PLACEHOLDER_TONES = [
  'from-brand-gold-300 to-brand-gold-600',
  'from-neutral-300 to-neutral-500',
  'from-neutral-400 to-neutral-700',
]

export function OportunidadesPanel({ regiao }) {
  const [data, setData] = useState([])
  const [loading, setLoading] = useState(true)
  const [rentAlvo, setRentAlvo] = useState(null) // candidato aberto no modal de rentabilidade
  const toast = useToast()

  const load = async () => {
    setLoading(true)
    try {
      const r = await apiFetch('/api/crm/oportunidades?estado=pendente', { regiao })
      const d = await r.json()
      setData(d.data ?? [])
    } catch {
      toast('Não foi possível carregar as oportunidades', 'error')
    }
    setLoading(false)
  }

  useEffect(() => { load() }, [regiao]) // eslint-disable-line react-hooks/exhaustive-deps

  const aprovar = async (id) => {
    try {
      const r = await apiFetch(`/api/crm/oportunidades/${id}/aprovar`, { method: 'POST' })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error || 'Falhou aprovar')
      setData(prev => prev.filter(c => c.id !== id))
      setRentAlvo(null)
      toast('Imóvel criado — pronto para Cold Call', 'success')
    } catch (e) { toast(e.message, 'error') }
  }

  const rejeitar = async (id) => {
    const motivo = window.prompt('Motivo da rejeição (opcional):') || null
    try {
      const r = await apiFetch(`/api/crm/oportunidades/${id}/rejeitar`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ motivo }),
      })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error || 'Falhou rejeitar')
      setData(prev => prev.filter(c => c.id !== id))
      setRentAlvo(null)
      toast('Oportunidade rejeitada', 'success')
    } catch (e) { toast(e.message, 'error') }
  }

  if (loading) return <div className="text-center text-sm text-gray-400 py-12">A carregar oportunidades...</div>

  if (data.length === 0) {
    return (
      <div className="text-center text-sm text-gray-400 py-16">
        Sem candidatos pendentes. A pesquisa diária corre às 7h — volta amanhã ou aprova/rejeita os que já tens.
      </div>
    )
  }

  return (
    <>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {data.map((c, i) => (
          <OportunidadeCard key={c.id} candidato={c} tone={PLACEHOLDER_TONES[i % PLACEHOLDER_TONES.length]}
            onOpen={() => setRentAlvo(c)} onAprovar={() => aprovar(c.id)} onRejeitar={() => rejeitar(c.id)} />
        ))}
      </div>

      <Modal open={!!rentAlvo} onClose={() => setRentAlvo(null)}
        title={rentAlvo?.morada || rentAlvo?.tipologia} subtitle={rentAlvo?.concelho} size="lg">
        {rentAlvo && (
          <div className="space-y-5">
            <p className="text-xs text-gray-400 -mt-2">
              Obra e VVR não vêm do anúncio — são uma estimativa inicial (área × referência da zona), editável abaixo.
              Triagem rápida; a Análise completa só se faz depois de aprovado.
            </p>
            <QuickCheck analise={estimativaAnalise(rentAlvo)} />
            <div className="flex gap-2 pt-2 border-t border-gray-100 dark:border-neutral-800">
              <button onClick={() => rejeitar(rentAlvo.id)}
                className="flex-1 py-2 text-sm rounded-lg border border-gray-200 dark:border-neutral-700 text-gray-500 hover:border-red-400 hover:text-red-600 transition-colors">
                Rejeitar
              </button>
              <button onClick={() => aprovar(rentAlvo.id)}
                className="flex-1 py-2 text-sm rounded-lg bg-brand-gold text-brand-dark font-semibold hover:brightness-105 transition-all">
                Aprovar imóvel
              </button>
            </div>
          </div>
        )}
      </Modal>
    </>
  )
}

function estimativaAnalise(c) {
  const area = Number(c.area) || 0
  const compra = Number(c.preco) || 0
  const obra = Math.round(area * (c.sinal_obras ? 400 : 120))
  const refM2 = Number(c.preco_m2_referencia_usado) || null
  const vvr = refM2 && area ? Math.round(area * refM2) : compra
  return { compra, obra, vvr, meses: 6 }
}

function OportunidadeCard({ candidato: c, tone, onOpen, onAprovar, onRejeitar }) {
  return (
    <div className="rounded-2xl border border-gray-100 dark:border-neutral-800 bg-white dark:bg-neutral-900 shadow-sm hover:shadow-lg hover:-translate-y-0.5 transition-all cursor-pointer overflow-hidden flex flex-col"
      onClick={onOpen}>
      <div className={`relative h-36 bg-gradient-to-br ${tone} flex items-center justify-center`}>
        <ImageOff className="w-8 h-8 text-white/60" />
        <span className="absolute top-2.5 right-2.5 text-[10.5px] font-semibold text-white bg-black/40 backdrop-blur px-2.5 py-1 rounded-full">
          {c.concelho}
        </span>
        <span className="absolute left-3 bottom-2.5 text-lg font-extrabold text-white drop-shadow font-mono">
          {EUR(c.preco)}
        </span>
      </div>

      <div className="p-4 flex flex-col gap-2.5 flex-1">
        <div>
          <p className="text-sm font-bold text-gray-900 dark:text-neutral-100 line-clamp-1">
            {c.tipologia}{c.morada ? ` — ${c.morada}` : ''}
          </p>
          <p className="text-xs text-gray-400 flex items-center gap-1 mt-0.5">
            <MapPin className="w-3 h-3" /> {c.freguesia || c.concelho}
          </p>
        </div>

        <div className="grid grid-cols-3 gap-2 py-2 border-y border-gray-50 dark:border-neutral-800 text-center">
          <Stat icon={Ruler} label="€/m²" value={c.preco_m2 ? Math.round(c.preco_m2) : '—'} />
          <Stat icon={Home} label="Área" value={c.area ? `${Math.round(c.area)} m²` : '—'} />
          <Stat icon={Calendar} label="Ano" value={c.ano_construcao || '—'} />
        </div>

        <div className="flex flex-wrap gap-1.5">
          {c.sinal_equity_ano && <Badge tone="green">Construção &lt; 2000</Badge>}
          {c.sinal_equity_preco_m2 && <Badge tone="green">€/m² abaixo da média</Badge>}
          {c.sinal_obras && <Badge tone="amber">Necessita obras</Badge>}
          {!c.sinal_equity_ano && !c.sinal_equity_preco_m2 && !c.sinal_obras && <Badge tone="gray">Sem sinal de equity</Badge>}
        </div>

        <p className="text-[11px] font-semibold text-brand-gold-600">Ver rentabilidade estimada →</p>

        <div className="flex gap-2 mt-auto pt-1" onClick={e => e.stopPropagation()}>
          <button onClick={onRejeitar}
            className="flex-1 py-2 text-xs font-semibold rounded-lg border border-gray-200 dark:border-neutral-700 text-gray-500 hover:border-red-400 hover:text-red-600 transition-colors">
            Rejeitar
          </button>
          <button onClick={onAprovar}
            className="flex-1 py-2 text-xs font-semibold rounded-lg bg-brand-gold text-brand-dark shadow-gold hover:brightness-105 transition-all">
            Aprovar
          </button>
        </div>
      </div>
    </div>
  )
}

function Stat({ icon: Icon, label, value }) {
  return (
    <div className="flex flex-col items-center gap-0.5">
      <span className="text-[9px] uppercase tracking-wide text-gray-400 font-semibold flex items-center gap-1">
        <Icon className="w-2.5 h-2.5" /> {label}
      </span>
      <span className="text-xs font-bold font-mono text-gray-700 dark:text-neutral-200">{value}</span>
    </div>
  )
}

const BADGE_TONE = {
  green: 'bg-green-50 text-green-700 dark:bg-green-500/10 dark:text-green-400',
  amber: 'bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-400',
  gray: 'bg-gray-100 text-gray-500 dark:bg-neutral-800 dark:text-neutral-400',
}
function Badge({ tone, children }) {
  return <span className={`text-[10.5px] font-semibold px-2 py-0.5 rounded-md ${BADGE_TONE[tone]}`}>{children}</span>
}
