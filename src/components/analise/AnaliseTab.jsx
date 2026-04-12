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

const SUB_TABS = ['Calculadora', 'Quick Check', 'Stress Tests', 'Comparáveis', 'CAEP']

export function AnaliseTab({ imovelId, imovelNome }) {
  const {
    analises, selected, loading, saving,
    select, criar, guardar, guardarAgora, activar, duplicar, apagar,
  } = useAnalise(imovelId)

  const [subTab, setSubTab] = useState('Calculadora')

  if (loading) return <div className="py-8 text-center text-gray-400">A carregar análises...</div>

  return (
    <div className="space-y-4">
      {/* Barra de cenários */}
      <div className="flex flex-wrap items-center gap-2">
        {analises.length > 0 && (
          <select
            value={selected?.id || ''}
            onChange={(e) => select(e.target.value)}
            className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm focus:border-yellow-500 outline-none"
          >
            {analises.map(a => (
              <option key={a.id} value={a.id}>
                {a.nome || 'Cenário'} {a.activa ? '★' : ''} (v{a.versao})
              </option>
            ))}
          </select>
        )}

        <button
          onClick={() => criar({ nome: `Cenário ${analises.length + 1}` })}
          className="px-3 py-1.5 text-xs rounded-lg bg-gray-900 text-white hover:bg-gray-700 transition-colors"
        >
          + Nova Análise
        </button>

        {selected && !selected.activa && (
          <button
            onClick={() => activar(selected.id)}
            className="px-3 py-1.5 text-xs rounded-lg border border-yellow-500 text-yellow-700 hover:bg-yellow-50 transition-colors"
          >
            Activar
          </button>
        )}

        {selected && (
          <button
            onClick={() => duplicar(selected.id)}
            className="px-3 py-1.5 text-xs rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors"
          >
            Duplicar
          </button>
        )}

        {selected && analises.length > 1 && (
          <button
            onClick={() => { if (confirm('Apagar esta análise?')) apagar(selected.id) }}
            className="px-3 py-1.5 text-xs rounded-lg border border-red-200 text-red-600 hover:bg-red-50 transition-colors"
          >
            Apagar
          </button>
        )}

        {selected?.activa && (
          <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-yellow-100 text-yellow-700">
            ★ ACTIVA
          </span>
        )}

        {saving && <span className="text-xs text-gray-400 animate-pulse">A guardar...</span>}
      </div>

      {/* Sub-tabs */}
      {selected && (
        <div className="flex gap-1 border-b border-gray-100 pb-1">
          {SUB_TABS.map(t => (
            <button
              key={t}
              onClick={() => setSubTab(t)}
              className={`px-3 py-1.5 text-xs rounded-t-lg transition-colors ${
                subTab === t
                  ? 'bg-gray-900 text-white'
                  : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
              }`}
            >
              {t}
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
              <QuickCheck analise={selected} onTransfer={(dados) => guardarAgora(dados)} />
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

          {/* Sidebar resume */}
          <div className="xl:sticky xl:top-4 xl:self-start">
            <AnaliseResume analise={selected} />
          </div>
        </div>
      )}
    </div>
  )
}
