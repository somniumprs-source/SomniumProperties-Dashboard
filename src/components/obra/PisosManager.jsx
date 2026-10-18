/**
 * Gestão de pisos do orçamento. Topo do separador Obra.
 */
import { useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { PISO_PRESETS } from './seccoesConfig.js'


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
    <div className="bg-surface-raised border border-line rounded-xl p-4 mb-4">
      <h3 className="text-sm font-semibold text-ink mb-3">Pisos do imóvel</h3>

      {pisos.length === 0 ? (
        <p className="text-sm text-ink-muted mb-3">Adicione os pisos para que as secções por m² possam replicar.</p>
      ) : (
        <div className="space-y-2 mb-3">
          {pisos.map(p => (
            <div key={p.nome} className="flex items-center gap-2 p-2 bg-surface rounded-lg">
              <span className="text-sm font-medium text-ink w-28 truncate" title={p.nome}>{p.nome}</span>
              <input
                type="number"
                step="any"
                value={p.area_m2 || ''}
                onChange={(e) => editar(p.nome, { area_m2: Number(e.target.value) || 0 })}
                className="w-24 px-2 py-1 text-sm border border-line rounded focus:outline-none focus:border-ink/40"
                placeholder="m²"
                onWheel={e => e.target.blur()}
              />
              <span className="text-xs text-ink-muted">m² (ABP)</span>
              <input
                type="text"
                value={p.descricao || ''}
                onChange={(e) => editar(p.nome, { descricao: e.target.value })}
                className="flex-1 px-2 py-1 text-sm border border-line rounded focus:outline-none focus:border-ink/40"
                placeholder="Descrição (ex: 2 quartos + sala + cozinha)"
              />
              <button
                onClick={() => remover(p.nome)}
                className="p-1.5 text-ink-muted hover:text-danger transition-colors"
                title="Remover piso"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-line">
        <input
          type="text"
          value={novoNome}
          onChange={(e) => setNovoNome(e.target.value)}
          list="piso-presets"
          className="w-36 px-2 py-1.5 text-sm border border-line rounded focus:outline-none focus:border-ink/40"
          placeholder="Nome (ex: R/C)"
        />
        <datalist id="piso-presets">
          {PISO_PRESETS.map(p => <option key={p} value={p} />)}
        </datalist>
        <input
          type="number"
          step="any"
          value={novaArea}
          onChange={(e) => setNovaArea(e.target.value)}
          className="w-24 px-2 py-1.5 text-sm border border-line rounded focus:outline-none focus:border-ink/40"
          placeholder="Área m²"
          onWheel={e => e.target.blur()}
        />
        <button
          onClick={() => { adicionar(novoNome, novaArea); setNovoNome(''); setNovaArea('') }}
          className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-lg bg-accent text-accent-foreground hover:brightness-[1.04] transition-[filter]"
        >
          <Plus className="w-4 h-4" /> Adicionar piso
        </button>
      </div>
    </div>
  )
}
