/**
 * Gestão de pisos do orçamento. Topo do separador Obra.
 */
import { useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { PISO_PRESETS } from './seccoesConfig.js'

const GOLD = '#C9A84C'

export function PisosManager({ pisos, onChange }) {
  const [novoNome, setNovoNome] = useState('')
  const [novaArea, setNovaArea] = useState('')

  const adicionar = (nome, area) => {
    const nomeFinal = (nome || '').trim()
    if (!nomeFinal) return
    if (pisos.some(p => p.nome === nomeFinal)) return
    onChange([...pisos, { nome: nomeFinal, area_m2: Number(area) || 0 }])
  }

  const remover = (nome) => {
    onChange(pisos.filter(p => p.nome !== nome))
  }

  const editar = (nome, patch) => {
    onChange(pisos.map(p => p.nome === nome ? { ...p, ...patch } : p))
  }

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-4 mb-4">
      <h3 className="text-sm font-semibold text-gray-800 mb-3">Pisos do imóvel</h3>

      {pisos.length === 0 ? (
        <p className="text-sm text-gray-400 mb-3">Adicione os pisos para que as secções por m² possam replicar.</p>
      ) : (
        <div className="space-y-2 mb-3">
          {pisos.map(p => (
            <div key={p.nome} className="flex items-center gap-2 p-2 bg-gray-50 rounded-lg">
              <span className="text-sm font-medium text-gray-700 w-28 truncate" title={p.nome}>{p.nome}</span>
              <input
                type="number"
                value={p.area_m2 || ''}
                onChange={(e) => editar(p.nome, { area_m2: Number(e.target.value) || 0 })}
                className="w-24 px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:border-gray-500"
                placeholder="m²"
              />
              <span className="text-xs text-gray-400">m² (ABP)</span>
              <input
                type="text"
                value={p.descricao || ''}
                onChange={(e) => editar(p.nome, { descricao: e.target.value })}
                className="flex-1 px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:border-gray-500"
                placeholder="Descrição (ex: 2 quartos + sala + cozinha)"
              />
              <button
                onClick={() => remover(p.nome)}
                className="p-1.5 text-gray-400 hover:text-red-500 transition-colors"
                title="Remover piso"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-gray-100">
        <input
          type="text"
          value={novoNome}
          onChange={(e) => setNovoNome(e.target.value)}
          list="piso-presets"
          className="w-36 px-2 py-1.5 text-sm border border-gray-300 rounded focus:outline-none focus:border-gray-500"
          placeholder="Nome (ex: R/C)"
        />
        <datalist id="piso-presets">
          {PISO_PRESETS.map(p => <option key={p} value={p} />)}
        </datalist>
        <input
          type="number"
          value={novaArea}
          onChange={(e) => setNovaArea(e.target.value)}
          className="w-24 px-2 py-1.5 text-sm border border-gray-300 rounded focus:outline-none focus:border-gray-500"
          placeholder="Área m²"
        />
        <button
          onClick={() => { adicionar(novoNome, novaArea); setNovoNome(''); setNovaArea('') }}
          className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-lg transition-colors"
          style={{ backgroundColor: GOLD, color: '#0d0d0d' }}
        >
          <Plus className="w-4 h-4" /> Adicionar piso
        </button>
      </div>
    </div>
  )
}
