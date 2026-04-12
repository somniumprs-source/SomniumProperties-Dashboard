/**
 * Tab "Análise Financeira" no detalhe do imóvel.
 * Container: selector de cenários + sub-tabs + form + resume.
 */
import { useState } from 'react'
import { useAnalise } from './useAnalise.js'
import { CalculadoraForm } from './CalculadoraForm.jsx'
import { AnaliseResume } from './AnaliseResume.jsx'
import { StressTests } from './StressTests.jsx'
import { Comparaveis } from './Comparaveis.jsx'
import { CAEPParcerias } from './CAEPParcerias.jsx'
import { QuickCheck } from './QuickCheck.jsx'

const SUB_TABS = [
  { key: 'Calculadora', icon: '📊' },
  { key: 'Quick Check', icon: '⚡' },
  { key: 'Stress Tests', icon: '🎯' },
  { key: 'Comparáveis', icon: '📋' },
  { key: 'CAEP', icon: '🤝' },
]

const GOLD = '#C9A84C'
const BLACK = '#1A1A1A'

export function AnaliseTab({ imovelId, imovelNome }) {
  const {
    analises, selected, loading, saving,
    select, criar, guardar, guardarAgora, activar, duplicar, apagar,
  } = useAnalise(imovelId)

  const [subTab, setSubTab] = useState('Calculadora')

  if (loading) {
    return (
      <div className="py-12 text-center">
        <div className="animate-spin w-6 h-6 border-2 border-t-transparent rounded-full mx-auto mb-3" style={{ borderColor: GOLD, borderTopColor: 'transparent' }} />
        <p className="text-sm text-gray-400">A carregar análises...</p>
      </div>
    )
  }

  // Empty state — sem análises
  if (analises.length === 0) {
    return (
      <div className="py-8 flex flex-col items-center gap-5">
        <div className="w-16 h-16 rounded-2xl flex items-center justify-center text-3xl" style={{ backgroundColor: GOLD + '15' }}>
          📊
        </div>
        <div className="text-center max-w-sm">
          <h3 className="text-base font-semibold text-gray-800 mb-1">Análise de Rentabilidade</h3>
          <p className="text-sm text-gray-500 leading-relaxed">
            Cria a primeira análise financeira para <strong>{imovelNome}</strong>.
            Calcula custos, lucro, impostos e retorno com as fórmulas OE 2026.
          </p>
        </div>
        <button
          onClick={() => criar({ nome: 'Cenário Base' })}
          className="px-5 py-2.5 text-sm font-semibold rounded-xl text-white transition-all hover:scale-105"
          style={{ backgroundColor: BLACK }}
        >
          + Criar Primeira Análise
        </button>
        <div className="flex gap-6 text-xs text-gray-400 mt-2">
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
          className="rounded-lg border border-gray-200 px-3 py-2 text-sm font-medium outline-none"
          style={{ minWidth: 180 }}
        >
          {analises.map(a => (
            <option key={a.id} value={a.id}>
              {a.nome || 'Cenário'} {a.activa ? '★' : ''} (v{a.versao})
            </option>
          ))}
        </select>

        <button
          onClick={() => criar({ nome: `Cenário ${analises.length + 1}` })}
          className="px-3 py-2 text-xs font-semibold rounded-lg text-white transition-colors"
          style={{ backgroundColor: BLACK }}
        >
          + Novo Cenário
        </button>

        {selected && !selected.activa && (
          <button
            onClick={() => activar(selected.id)}
            className="px-3 py-2 text-xs font-semibold rounded-lg border-2 transition-colors hover:opacity-80"
            style={{ borderColor: GOLD, color: GOLD }}
          >
            Tornar Activa
          </button>
        )}

        {selected && (
          <button
            onClick={() => duplicar(selected.id)}
            className="px-3 py-2 text-xs rounded-lg border border-gray-300 text-gray-600 hover:bg-white transition-colors"
          >
            Duplicar
          </button>
        )}

        {selected && analises.length > 1 && (
          <button
            onClick={() => { if (confirm('Apagar esta análise?')) apagar(selected.id) }}
            className="px-3 py-2 text-xs rounded-lg text-red-500 hover:bg-red-50 transition-colors"
          >
            Apagar
          </button>
        )}

        <div className="flex-1" />

        {selected?.activa && (
          <span className="px-3 py-1 rounded-full text-xs font-bold" style={{ backgroundColor: GOLD + '20', color: GOLD }}>
            ★ ACTIVA
          </span>
        )}

        {saving && (
          <span className="flex items-center gap-1.5 text-xs text-gray-400">
            <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
            Guardado automaticamente
          </span>
        )}
      </div>

      {/* Mobile resume — barra compacta visível só em mobile */}
      {selected && (
        <div className="xl:hidden rounded-xl p-3 flex items-center justify-between" style={{ backgroundColor: selected.retorno_anualizado >= 15 ? '#22c55e15' : selected.retorno_anualizado >= 8 ? '#f59e0b15' : '#ef444415' }}>
          <div className="flex gap-4 text-xs">
            <div><span className="text-gray-400">Lucro </span><strong className={selected.lucro_liquido >= 0 ? 'text-green-700' : 'text-red-600'}>{fmtEur(selected.lucro_liquido)}</strong></div>
            <div><span className="text-gray-400">RA </span><strong>{(selected.retorno_anualizado || 0).toFixed(1)}%</strong></div>
            <div><span className="text-gray-400">Capital </span><strong>{fmtEur(selected.capital_necessario)}</strong></div>
          </div>
        </div>
      )}

      {/* Sub-tabs */}
      {selected && (
        <div className="flex gap-1 overflow-x-auto pb-1 -mx-1 px-1">
          {SUB_TABS.map(t => (
            <button
              key={t.key}
              onClick={() => setSubTab(t.key)}
              className={`px-3 py-2 text-xs font-medium rounded-lg whitespace-nowrap transition-all ${
                subTab === t.key
                  ? 'text-white shadow-sm'
                  : 'text-gray-500 hover:bg-gray-100'
              }`}
              style={subTab === t.key ? { backgroundColor: BLACK } : undefined}
            >
              <span className="mr-1">{t.icon}</span> {t.key}
            </button>
          ))}
        </div>
      )}

      {/* Conteúdo */}
      {selected && (
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
          {/* Coluna principal */}
          <div className="xl:col-span-2">
            {subTab === 'Calculadora' && (
              <CalculadoraForm analise={selected} onUpdate={guardar} />
            )}
            {subTab === 'Quick Check' && (
              <QuickCheck analise={selected} onTransfer={(dados) => { guardarAgora(dados); setSubTab('Calculadora') }} />
            )}
            {subTab === 'Stress Tests' && (
              <StressTests analise={selected} />
            )}
            {subTab === 'Comparáveis' && (
              <Comparaveis analise={selected} onUpdate={guardarAgora} />
            )}
            {subTab === 'CAEP' && (
              <CAEPParcerias analise={selected} onUpdate={guardarAgora} />
            )}
          </div>

          {/* Sidebar resume — desktop only */}
          <div className="hidden xl:block xl:sticky xl:top-4 xl:self-start">
            <AnaliseResume analise={selected} />
          </div>
        </div>
      )}
    </div>
  )
}

function fmtEur(v) {
  if (v === null || v === undefined) return '—'
  return new Intl.NumberFormat('pt-PT', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(v)
}
