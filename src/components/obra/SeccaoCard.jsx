/**
 * Cartão colapsável reutilizável para uma secção do orçamento (v2).
 * Mostra inputs, fórmulas, IVA por linha (do regime fiscal global ou
 * com override local), flag autoliquidação e retenção IRS.
 */
import { useState } from 'react'
import { ChevronDown, ChevronUp, AlertTriangle } from 'lucide-react'
import { TAXAS_IVA, RETENCOES_IRS } from './seccoesConfig.js'

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

function SelectInput({ value, onChange, opcoes }) {
  return (
    <select
      value={value || ''}
      onChange={(e) => onChange(e.target.value)}
      className="px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:border-gray-500"
    >
      {opcoes.map(o => <option key={o} value={o}>{o}</option>)}
    </select>
  )
}

function Field({ campo, value, onChange, suporta_singular, valorSingular, onSingularChange }) {
  const isSel = Array.isArray(campo.opcoes)
  return (
    <div className="flex items-center justify-between gap-3 py-1">
      <label className="text-sm text-gray-700 flex-1">{campo.label}</label>
      {isSel
        ? <SelectInput value={value} onChange={onChange} opcoes={campo.opcoes} />
        : <NumInput value={value} onChange={onChange} sufixo={campo.sufixo} placeholder={campo.placeholder} />
      }
      {suporta_singular && campo.acompanha_singular && (
        <label className="flex items-center gap-1 text-xs text-gray-500" title="Prestador singular (cat. B IRS)?">
          <input
            type="checkbox"
            checked={!!valorSingular}
            onChange={(e) => onSingularChange(e.target.checked)}
            className="w-3 h-3"
          />
          Singular
        </label>
      )}
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
          const isSel = Array.isArray(c.opcoes)
          return (
            <div key={c.key} className="flex items-center justify-between gap-3">
              <label className="text-xs text-gray-600 flex-1">{c.label}</label>
              {isSel
                ? <SelectInput value={valores?.[c.key]} onChange={(v) => onChange({ ...valores, [c.key]: v })} opcoes={c.opcoes} />
                : <NumInput value={valores?.[c.key]} onChange={(v) => onChange({ ...valores, [c.key]: v })} sufixo={c.sufixo} placeholder={c.placeholder} />
              }
            </div>
          )
        })}
      </div>
    </div>
  )
}

function FiscalControls({ dados, regimeIvaDefault, onChange, suportaAutoliq }) {
  // Override de IVA / autoliquidação por secção
  return (
    <div className="flex flex-wrap items-center gap-3 px-3 py-2 bg-gray-50 rounded-lg text-xs">
      <span className="text-gray-500">Fiscalidade:</span>
      <label className="flex items-center gap-1">
        IVA
        <select
          value={dados?.iva_override ?? ''}
          onChange={(e) => onChange({ ...dados, iva_override: e.target.value === '' ? null : Number(e.target.value) })}
          className="px-2 py-1 border border-gray-300 rounded"
        >
          <option value="">Default ({regimeIvaDefault}%)</option>
          {TAXAS_IVA.map(t => <option key={t} value={t}>{t}%</option>)}
        </select>
      </label>
      {suportaAutoliq && (
        <label className="flex items-center gap-1" title="Autoliquidação (CIVA art 2º nº1 al. j) — entre sujeitos passivos">
          <input
            type="checkbox"
            checked={!!dados?.autoliquidacao}
            onChange={(e) => onChange({ ...dados, autoliquidacao: e.target.checked })}
            className="w-3 h-3"
          />
          Autoliquidação
        </label>
      )}
    </div>
  )
}

export function SeccaoCard({ seccao, dados, pisos, onChange, calc, regimeIvaDefault }) {
  const [aberto, setAberto] = useState(false)
  const semPisos = (seccao.tipo === 'por_piso' || seccao.tipo === 'mixto') && pisos.length === 0
  const subtotal = calc?.subtotal_bruto ?? 0
  const linhas = calc?.linhas || []
  const haAutoliq = linhas.some(l => l.autoliquidacao)

  const setCampo = (key, value) => onChange({ ...(dados || {}), [key]: value })
  const setSingular = (key, value) => onChange({ ...(dados || {}), [`${key}_singular`]: value })
  const setPiso = (pisoNome, valoresPiso) => onChange({
    ...(dados || {}),
    por_piso: { ...(dados?.por_piso || {}), [pisoNome]: valoresPiso },
  })
  const setNotas = (v) => onChange({ ...(dados || {}), notas: v })

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
            <span className="text-xs text-gray-400">
              {linhas.length > 0 ? `${linhas.length} linha${linhas.length > 1 ? 's' : ''}` : 'Por preencher'}
              {haAutoliq && ' · autoliquidação'}
            </span>
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
            <div className="flex items-start gap-2 text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-3">
              <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
              <span>Adicione pelo menos um piso para preencher esta secção.</span>
            </div>
          )}

          <FiscalControls
            dados={dados}
            regimeIvaDefault={regimeIvaDefault}
            onChange={onChange}
            suportaAutoliq={seccao.suporta_autoliq}
          />

          {/* Por piso */}
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
          {seccao.campos && (
            <div className="space-y-1">
              {seccao.campos.map(c => (
                <Field
                  key={c.key}
                  campo={c}
                  value={dados?.[c.key]}
                  onChange={(v) => setCampo(c.key, v)}
                  suporta_singular={true}
                  valorSingular={dados?.[`${c.key}_singular`]}
                  onSingularChange={(v) => setSingular(c.key, v)}
                />
              ))}
            </div>
          )}

          {seccao.nota && (
            <p className="text-xs text-gray-400 italic">{seccao.nota}</p>
          )}

          {/* Preview das linhas calculadas */}
          {linhas.length > 0 && (
            <div className="border-t border-gray-100 pt-3 space-y-1.5">
              {linhas.map((l, i) => (
                <div key={i} className="flex items-baseline justify-between gap-2 text-xs">
                  <div className="flex-1 truncate">
                    <span className="text-gray-700">{l.descricao}</span>
                    {l.formula && <span className="text-gray-400 ml-1">· {l.formula}</span>}
                  </div>
                  <div className="flex items-center gap-2 shrink-0 text-right">
                    <span className="text-gray-700">{EUR(l.base)}</span>
                    <span className={l.autoliquidacao ? 'text-amber-600' : 'text-gray-400'}>
                      {l.autoliquidacao ? `+ IVA autoliq.` : (l.taxa_iva > 0 ? `+ ${l.taxa_iva}%` : 'isento')}
                    </span>
                  </div>
                </div>
              ))}
              <div className="flex justify-between text-xs pt-2 border-t border-gray-100">
                <span className="text-gray-500">Base: {EUR(calc.subtotal_base)} · IVA: {EUR(calc.subtotal_iva)}{calc.iva_autoliq > 0 ? ` · autoliq.: ${EUR(calc.iva_autoliq)}` : ''}{calc.retencoes > 0 ? ` · retenções: -${EUR(calc.retencoes)}` : ''}</span>
                <span className="font-semibold text-gray-800">Total: {EUR(calc.subtotal_bruto)}</span>
              </div>
            </div>
          )}

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
