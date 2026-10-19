/**
 * Tab "Análise Financeira" no detalhe do imóvel.
 * Container: selector de cenários + sub-tabs + form + resume.
 */
import { useState } from 'react'
import { BarChart3, Zap, Activity, ListChecks, Handshake, Pencil, Eye } from 'lucide-react'
import { useAnalise } from './useAnalise.js'
import { CalculadoraForm } from './CalculadoraForm.jsx'
import { AnaliseResume } from './AnaliseResume.jsx'
import { StressTests } from './StressTests.jsx'
import { Comparaveis } from './Comparaveis.jsx'
import { CAEPParcerias } from './CAEPParcerias.jsx'
import { QuickCheck } from './QuickCheck.jsx'
import { isWholesaling } from '../../lib/modelos.js'
import { confirmar } from '../ui/ConfirmDialog.jsx'

function RenameInput({ nome, onRename }) {
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState(nome || '')

  if (!editing) {
    return (
      <button
        onClick={() => { setValue(nome || ''); setEditing(true) }}
        className="rounded-lg border border-dashed border-line px-3 py-2 text-sm font-medium text-ink-muted hover:border-ink/30 hover:bg-surface-raised transition-colors"
        title="Clica para renomear"
      >
        <Pencil className="w-3.5 h-3.5 inline-block mr-1.5 align-[-2px]" />{nome || 'Sem nome'}
      </button>
    )
  }

  return (
    <input
      autoFocus
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onBlur={() => { if (value.trim() && value !== nome) onRename(value.trim()); setEditing(false) }}
      onKeyDown={(e) => { if (e.key === 'Enter') { if (value.trim() && value !== nome) onRename(value.trim()); setEditing(false) } if (e.key === 'Escape') setEditing(false) }}
      className="rounded-lg border-2 border-yellow-400 px-3 py-2 text-sm font-medium outline-none bg-surface-raised"
      style={{ minWidth: 160 }}
      placeholder="Nome do cenário"
    />
  )
}

const SUB_TABS = [
  { key: 'Calculadora', icon: BarChart3 },
  { key: 'Quick Check', icon: Zap },
  { key: 'Stress Tests', icon: Activity },
  { key: 'Comparáveis', icon: ListChecks },
  { key: 'CAEP', icon: Handshake },
]

const GOLD = '#C9A84C'
const BLACK = '#1A1A1A'

export function AnaliseTab({ imovelId, imovelNome, imovel, readOnly = false, emProjeto = false }) {
  const {
    analises, selected, loading, saving, lastSaveStatus,
    select, criar, guardar, guardarAgora, flush, activar, duplicar, apagar,
  } = useAnalise(imovelId)

  const [subTab, setSubTab] = useState('Calculadora')

  // Wholesaling é cedência de posição: Stress Tests e CAEP não fazem sentido — escondem-se.
  // Dentro de um Projecto o negócio já está validado e os investidores/montantes
  // vivem na aba Investidores: Quick Check e CAEP seriam informação duplicada.
  const wholesaling = isWholesaling(imovel)
  const ocultas = new Set([
    ...(wholesaling ? ['Stress Tests', 'CAEP'] : []),
    ...(emProjeto ? ['Quick Check', 'CAEP'] : []),
  ])
  const subTabs = SUB_TABS.filter(t => !ocultas.has(t.key))
  const effectiveSubTab = subTabs.some(t => t.key === subTab) ? subTab : 'Calculadora'

  // Mudar de subTab obriga a flush — garante que edições debounced (Comparáveis, Calculadora)
  // ficam persistidas antes do componente desmontar.
  const changeSubTab = async (key) => {
    if (key === subTab) return
    try { await flush?.() } catch {}
    setSubTab(key)
  }

  if (loading) {
    return (
      <div className="py-12 text-center">
        <div className="animate-spin w-6 h-6 border-2 border-t-transparent rounded-full mx-auto mb-3" style={{ borderColor: GOLD, borderTopColor: 'transparent' }} />
        <p className="text-sm text-ink-muted">A carregar análises...</p>
      </div>
    )
  }

  // Empty state — sem análises
  if (analises.length === 0) {
    return (
      <div className="py-8 flex flex-col items-center gap-5">
        <div className="w-16 h-16 rounded-2xl flex items-center justify-center" style={{ backgroundColor: GOLD + '15' }}>
          <BarChart3 className="w-7 h-7" style={{ color: GOLD }} />
        </div>
        <div className="text-center max-w-sm">
          <h3 className="text-base font-semibold text-ink mb-1">Análise de Rentabilidade</h3>
          <p className="text-sm text-ink-muted leading-relaxed">
            {readOnly
              ? <>Ainda não há análise financeira para <strong>{imovelNome}</strong>.</>
              : <>Cria a primeira análise financeira para <strong>{imovelNome}</strong>. Calcula custos, lucro, impostos e retorno com as fórmulas OE 2026.</>}
          </p>
        </div>
        {!readOnly && (
          <button
            onClick={() => criar({ nome: 'Cenário Base' })}
            className="px-5 py-2.5 text-sm font-semibold rounded-xl text-white transition-[background-color,border-color,color,box-shadow,opacity,transform] hover:scale-105"
            style={{ backgroundColor: BLACK }}
          >
            + Criar Primeira Análise
          </button>
        )}
        <div className="flex gap-6 text-xs text-ink-muted mt-2">
          <span>IMT · IS · IVA · IRC · IRS</span>
          <span>Stress Tests</span>
          <span>Comparáveis</span>
          <span>CAEP</span>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Barra de cenários */}
      <div className="flex flex-wrap items-center gap-2 rounded-xl p-3" style={{ backgroundColor: '#F5F4F0' }}>
        <select
          value={selected?.id || ''}
          onChange={(e) => select(e.target.value)}
          className="rounded-lg border border-line px-3 py-2 text-sm font-medium outline-none"
          style={{ minWidth: 180 }}
        >
          {analises.map(a => (
            <option key={a.id} value={a.id}>
              {a.nome || 'Cenário'} {a.activa ? '★' : ''} (v{a.versao})
            </option>
          ))}
        </select>

        {!readOnly && selected && (
          <RenameInput nome={selected.nome} onRename={(nome) => guardarAgora({ nome })} />
        )}

        {!readOnly && (
          <button
            onClick={() => criar({ nome: `Cenário ${analises.length + 1}` })}
            className="px-3 py-2 text-xs font-semibold rounded-lg text-white transition-colors"
            style={{ backgroundColor: BLACK }}
          >
            + Novo Cenário
          </button>
        )}

        {!readOnly && selected && !selected.activa && (
          <button
            onClick={() => activar(selected.id)}
            className="px-3 py-2 text-xs font-semibold rounded-lg border-2 transition-colors hover:opacity-80"
            style={{ borderColor: GOLD, color: GOLD }}
          >
            Tornar Ativa
          </button>
        )}

        {!readOnly && selected && (
          <button
            onClick={() => duplicar(selected.id)}
            className="px-3 py-2 text-xs rounded-lg border border-line text-ink-muted hover:bg-surface-raised transition-colors"
          >
            Duplicar
          </button>
        )}

        {!readOnly && selected && analises.length > 1 && (
          <button
            onClick={async () => { if (await confirmar('Apagar esta análise?')) apagar(selected.id) }}
            className="px-3 py-2 text-xs rounded-lg text-danger hover:bg-danger/10 transition-colors"
          >
            Apagar
          </button>
        )}

        <div className="flex-1" />

        {selected?.activa && (
          <span className="px-3 py-1 rounded-full text-xs font-bold" style={{ backgroundColor: GOLD + '20', color: GOLD }}>
            ★ ATIVA
          </span>
        )}

        {readOnly ? (
          <span className="px-3 py-1 rounded-full text-xs font-bold bg-warning/15 text-warning">
            <Eye className="w-3.5 h-3.5 inline-block mr-1 align-[-2px]" />SÓ CONSULTA
          </span>
        ) : saving && (
          <span className="flex items-center gap-1.5 text-xs text-ink-muted">
            <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
            Guardado automaticamente
          </span>
        )}
      </div>

      {/* Mobile resume — barra compacta visível só em mobile */}
      {selected && (
        <div className="xl:hidden rounded-xl p-3 flex items-center justify-between" style={{ backgroundColor: selected.retorno_anualizado >= 15 ? '#22c55e15' : selected.retorno_anualizado >= 8 ? '#f59e0b15' : '#ef444415' }}>
          <div className="flex gap-4 text-xs">
            <div><span className="text-ink-muted">Lucro </span><strong className={selected.lucro_liquido >= 0 ? 'text-success' : 'text-danger'}>{fmtEur(selected.lucro_liquido)}</strong></div>
            <div><span className="text-ink-muted">RA </span><strong>{(selected.retorno_anualizado || 0).toFixed(1)}%</strong></div>
            <div><span className="text-ink-muted">Capital </span><strong>{fmtEur(selected.capital_necessario)}</strong></div>
          </div>
        </div>
      )}

      {/* Sub-tabs */}
      {selected && (
        <div className="flex gap-1 overflow-x-auto pb-1 -mx-1 px-1">
          {subTabs.map(t => (
            <button
              key={t.key}
              onClick={() => changeSubTab(t.key)}
              className={`px-3 py-2 text-xs font-medium rounded-lg whitespace-nowrap transition-[background-color,border-color,color,box-shadow,opacity,transform] ${
                effectiveSubTab === t.key
                  ? 'text-white shadow-sm'
                  : 'text-ink-muted hover:bg-surface-muted'
              }`}
              style={effectiveSubTab === t.key ? { backgroundColor: BLACK } : undefined}
            >
              <t.icon className="w-3.5 h-3.5 inline-block mr-1.5 align-[-2px]" />{t.key}
            </button>
          ))}
        </div>
      )}

      {/* Conteúdo — em modo só-consulta, fica dentro de um <fieldset disabled>: dá para
          navegar livremente entre cenários e sub-abas (fora deste bloco), mas os campos e
          acções de edição de cada sub-aba ficam desligados. Não expande secções fechadas
          por defeito nem detalhes internos — para isso, edita/consulta em Projetos. */}
      {selected && (
        <fieldset disabled={readOnly} className="min-w-0 p-0 m-0 border-0">
          <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
            {/* Coluna principal */}
            <div className="xl:col-span-2">
              {effectiveSubTab === 'Calculadora' && (
                <CalculadoraForm analise={selected} imovel={imovel} onUpdate={guardar} />
              )}
              {effectiveSubTab === 'Quick Check' && (
                <QuickCheck analise={selected} onTransfer={(dados) => { guardarAgora(dados); setSubTab('Calculadora') }} />
              )}
              {effectiveSubTab === 'Stress Tests' && (
                <StressTests analise={selected} />
              )}
              {effectiveSubTab === 'Comparáveis' && (
                <Comparaveis
                  analise={selected}
                  imovel={imovel}
                  onUpdate={guardar}
                  flush={flush}
                  guardarAgora={guardarAgora}
                  lastSaveStatus={lastSaveStatus}
                />
              )}
              {effectiveSubTab === 'CAEP' && (
                <CAEPParcerias analise={selected} onUpdate={guardarAgora} />
              )}
            </div>

            {/* Sidebar resume — desktop only */}
            <div className="hidden xl:block xl:sticky xl:top-4 xl:self-start">
              <AnaliseResume analise={selected} />
            </div>
          </div>
        </fieldset>
      )}
    </div>
  )
}

function fmtEur(v) {
  if (v === null || v === undefined) return '—'
  return new Intl.NumberFormat('pt-PT', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(v)
}
