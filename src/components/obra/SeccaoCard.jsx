/**
 * Cartão colapsável reutilizável para uma secção do orçamento.
 * Renderiza inputs por tipo (fixed | por_piso | mixto | unitario | capoto)
 * e mostra o subtotal da secção (calculado do lado do consumidor).
 */
import { useState } from 'react'
import { ChevronDown, ChevronUp, Plus, Trash2 } from 'lucide-react'

const GOLD = '#C9A84C'

const EUR = v => {
  if (v == null || !Number.isFinite(Number(v)) || Number(v) === 0) return '—'
  return new Intl.NumberFormat('pt-PT', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(v)
}

function NumInput({ value, onChange, sufixo, placeholder }) {
  return (
    <div className="flex items-center gap-1">
      <input
        type="number"
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value === '' ? '' : Number(e.target.value))}
        placeholder={placeholder}
        className="w-24 px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:border-gray-500"
        step="any"
      />
      {sufixo && <span className="text-xs text-gray-400 whitespace-nowrap">{sufixo}</span>}
    </div>
  )
}

function Field({ campo, value, onChange }) {
  return (
    <div className="flex items-center justify-between gap-3 py-1">
      <label className="text-sm text-gray-700 flex-1">{campo.label}</label>
      <NumInput value={value} onChange={onChange} sufixo={campo.sufixo} placeholder={campo.placeholder} />
    </div>
  )
}

function PisoRow({ piso, valores, onChange, campos }) {
  return (
    <div className="border border-gray-200 rounded-lg p-3 bg-gray-50/50">
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm font-medium text-gray-800">{piso.nome}</span>
        <span className="text-xs text-gray-400">{piso.area_m2 || 0} m²</span>
      </div>
      <div className="space-y-1">
        {campos.map(c => {
          const isAreaField = c.key === 'area_m2'
          return (
            <div key={c.key} className="flex items-center justify-between gap-3">
              <label className="text-xs text-gray-600 flex-1">{c.label}</label>
              <NumInput
                value={valores?.[c.key] ?? (isAreaField ? piso.area_m2 : '')}
                onChange={(v) => onChange({ ...valores, [c.key]: v })}
                sufixo={c.sufixo}
                placeholder={c.placeholder}
              />
            </div>
          )
        })}
      </div>
    </div>
  )
}

function CapotoEditor({ trecos, onChange }) {
  const update = (i, patch) => {
    onChange(trecos.map((t, idx) => idx === i ? { ...t, ...patch } : t))
  }
  const remover = (i) => onChange(trecos.filter((_, idx) => idx !== i))
  const adicionar = () => onChange([...trecos, { label: `Troço ${trecos.length + 1}`, perimetro: 0, altura: 3, eur_m2: 55 }])

  return (
    <div className="space-y-2">
      {trecos.map((t, i) => (
        <div key={i} className="flex items-center gap-2 p-2 bg-gray-50 rounded-lg">
          <input
            type="text"
            value={t.label || ''}
            onChange={(e) => update(i, { label: e.target.value })}
            className="w-32 px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:border-gray-500"
            placeholder="Troço"
          />
          <NumInput value={t.perimetro} onChange={(v) => update(i, { perimetro: v })} sufixo="m perímetro" />
          <NumInput value={t.altura} onChange={(v) => update(i, { altura: v })} sufixo="m altura" />
          <NumInput value={t.eur_m2} onChange={(v) => update(i, { eur_m2: v })} sufixo="€/m²" />
          <button
            onClick={() => remover(i)}
            className="p-1.5 text-gray-400 hover:text-red-500"
            title="Remover troço"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      ))}
      <button
        onClick={adicionar}
        className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-dashed border-gray-300 text-gray-600 hover:border-gray-400 hover:bg-gray-50 transition-colors"
      >
        <Plus className="w-3.5 h-3.5" /> Adicionar troço
      </button>
    </div>
  )
}

export function SeccaoCard({ seccao, dados, pisos, onChange, subtotal, acumulado }) {
  const [aberto, setAberto] = useState(false)
  const semPisos = (seccao.tipo === 'por_piso' || seccao.tipo === 'mixto') && pisos.length === 0

  const setCampo = (key, value) => {
    onChange({ ...(dados || {}), [key]: value })
  }
  const setPiso = (pisoNome, valoresPiso) => {
    onChange({
      ...(dados || {}),
      por_piso: { ...(dados?.por_piso || {}), [pisoNome]: valoresPiso },
    })
  }
  const setNotas = (v) => onChange({ ...(dados || {}), notas: v })
  const setTrecos = (trecos) => onChange({ ...(dados || {}), trecos })

  return (
    <div className="bg-white border border-gray-200 rounded-xl mb-3 overflow-hidden">
      <button
        onClick={() => setAberto(!aberto)}
        className="w-full flex items-center justify-between p-4 hover:bg-gray-50 transition-colors"
      >
        <div className="flex items-center gap-3">
          <span className="text-xl">{seccao.icon}</span>
          <div className="text-left">
            <h4 className="text-sm font-semibold text-gray-800">{seccao.label}</h4>
            {!aberto && acumulado != null && !seccao.isLicenciamento && (
              <span className="text-xs text-gray-400">Acumulado: {EUR(acumulado)}</span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-base font-bold" style={{ color: subtotal > 0 ? '#0d0d0d' : '#9ca3af' }}>
            {EUR(subtotal)}
          </span>
          {aberto ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
        </div>
      </button>

      {aberto && (
        <div className="p-4 border-t border-gray-100 space-y-3">
          {semPisos && (
            <div className="text-sm text-amber-600 bg-amber-50 border border-amber-200 rounded-lg p-3">
              Adicione pelo menos um piso para preencher esta secção.
            </div>
          )}

          {/* Campos por piso (eletricidade, pavimento, pladur, vmc, pintura) */}
          {(seccao.tipo === 'por_piso' || seccao.tipo === 'mixto') && pisos.length > 0 && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {pisos.map(p => (
                <PisoRow
                  key={p.nome}
                  piso={p}
                  campos={seccao.campos_piso}
                  valores={dados?.por_piso?.[p.nome]}
                  onChange={(v) => setPiso(p.nome, v)}
                />
              ))}
            </div>
          )}

          {/* Campos fixos */}
          {(seccao.tipo === 'fixed' || seccao.tipo === 'mixto' || seccao.tipo === 'unitario') && seccao.campos && (
            <div className="space-y-1">
              {seccao.campos.map(c => (
                <Field
                  key={c.key}
                  campo={c}
                  value={dados?.[c.key]}
                  onChange={(v) => setCampo(c.key, v)}
                />
              ))}
            </div>
          )}

          {/* Capoto */}
          {seccao.tipo === 'capoto' && (
            <CapotoEditor
              trecos={Array.isArray(dados?.trecos) ? dados.trecos : []}
              onChange={setTrecos}
            />
          )}

          {seccao.nota && (
            <p className="text-xs text-gray-400 italic">{seccao.nota}</p>
          )}

          {/* Notas livres por secção */}
          <textarea
            value={dados?.notas || ''}
            onChange={(e) => setNotas(e.target.value)}
            placeholder="Notas (opcional) — premissas, fornecedores, datas..."
            className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:border-gray-500 resize-none"
            rows={2}
          />
        </div>
      )}
    </div>
  )
}

SeccaoCard.GOLD = GOLD
