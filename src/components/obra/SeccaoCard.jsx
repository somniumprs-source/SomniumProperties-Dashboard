/**
 * Cartão de secção do orçamento (v4 — simplificado).
 *
 * Removido:
 *   - FiscalOverride por secção (decisão fiscal está no topo da aba)
 *   - Selectors "IVA mat" e "IVA MO" por linha (taxa derivada do regime)
 *
 * Adicionado:
 *   - Bloco MO compacto (dias × €/dia) no topo do body, em todas as
 *     secções marcadas com `has_mo: true` na config
 *
 * Cada secção mostra: campos guiados (por piso e fixos) + tabela editável
 * de linhas livres + resumo da secção.
 */
import { useState } from 'react'
import { ChevronDown, ChevronUp, AlertTriangle, Plus, Trash2 } from 'lucide-react'
import { RETENCOES_IRS } from './seccoesConfig.js'

const GOLD = '#C9A84C'

const EUR = v => {
  if (v == null || !Number.isFinite(Number(v)) || Number(v) === 0) return '—'
  return new Intl.NumberFormat('pt-PT', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(v)
}

function uid() { return 'l_' + Math.random().toString(36).slice(2, 10) }

// ── Inputs ──────────────────────────────────────────────────
function NumIn({ value, onChange, placeholder, w = 'w-20', tipoFiscal }) {
  const cor = tipoFiscal === 'material' ? 'border-blue-300 focus:border-blue-500'
            : tipoFiscal === 'mo' ? 'border-green-300 focus:border-green-500'
            : 'border-gray-300 focus:border-gray-500'
  return (
    <input
      type="number"
      value={value ?? ''}
      onChange={(e) => onChange(e.target.value === '' ? '' : Number(e.target.value))}
      placeholder={placeholder}
      className={`${w} px-2 py-1 text-sm border rounded focus:outline-none ${cor}`}
      step="any"
    />
  )
}

function TextIn({ value, onChange, placeholder, w = 'flex-1' }) {
  return (
    <input
      type="text"
      value={value ?? ''}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className={`${w} min-w-0 px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:border-gray-500`}
    />
  )
}

function SelectIn({ value, onChange, opcoes, w = 'w-20' }) {
  return (
    <select
      value={value ?? ''}
      onChange={(e) => {
        const v = e.target.value
        onChange(isNaN(Number(v)) ? v : Number(v))
      }}
      className={`${w} px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:border-gray-500 bg-white`}
    >
      {opcoes.map(o => {
        const val = typeof o === 'object' ? o.value : o
        const lbl = typeof o === 'object' ? o.label : o
        return <option key={String(val)} value={val}>{lbl}</option>
      })}
    </select>
  )
}

function FiscalBadge({ tipo }) {
  if (!tipo) return null
  const map = {
    material: { txt: 'Mat.', cls: 'bg-blue-100 text-blue-700 border-blue-200' },
    mo:       { txt: 'MO',   cls: 'bg-green-100 text-green-700 border-green-200' },
    taxas:    { txt: 'Taxa', cls: 'bg-gray-100 text-gray-700 border-gray-200' },
  }
  const m = map[tipo]
  if (!m) return null
  return <span className={`text-[10px] px-1.5 py-0.5 rounded border font-medium shrink-0 ${m.cls}`}>{m.txt}</span>
}

// ── Bloco MO (dias × €/dia) ─────────────────────────────────
function MOBlock({ dados, onChange, defaultEurDia = 147.5 }) {
  const setDias = (v) => onChange({ ...(dados || {}), dias_mo: v })
  const setEurDia = (v) => onChange({ ...(dados || {}), eur_dia_mo: v })
  const setAuto = (v) => onChange({ ...(dados || {}), autoliq_mo: v })

  const dias = Number(dados?.dias_mo) || 0
  const eurDia = Number(dados?.eur_dia_mo) || 0
  const total = dias * eurDia

  return (
    <div className="rounded-lg border border-green-200 bg-green-50/40 p-3">
      <div className="flex items-center gap-3 flex-wrap">
        <span className="text-xs font-semibold text-green-800 inline-flex items-center gap-1">
          <FiscalBadge tipo="mo" /> Mão-de-obra da secção
        </span>
        <div className="flex items-center gap-1.5">
          <NumIn value={dados?.dias_mo} onChange={setDias} w="w-16" />
          <span className="text-xs text-gray-500">dias ×</span>
          <NumIn value={dados?.eur_dia_mo} onChange={setEurDia} w="w-20" placeholder={String(defaultEurDia)} />
          <span className="text-xs text-gray-500">€/dia</span>
        </div>
        {total > 0 && (
          <span className="text-xs text-gray-600 ml-auto">
            = <strong className="text-gray-900">{EUR(total)}</strong>
          </span>
        )}
        <label className="flex items-center gap-1 text-[11px] text-gray-600 ml-2">
          <input
            type="checkbox"
            checked={!!dados?.autoliq_mo}
            onChange={(e) => setAuto(e.target.checked)}
            className="w-3 h-3"
          />
          Autoliquidação
        </label>
      </div>
    </div>
  )
}

// ── Bloco "Inputs guiados" ─────────────────────────────────
function CamposPiso({ piso, valores, onChange, campos }) {
  return (
    <div className="rounded-md border border-gray-200 p-2.5 bg-gray-50/40">
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-xs font-semibold text-gray-700">{piso.nome}</span>
        <span className="text-[10px] text-gray-400">{piso.area_m2 || 0} m²</span>
      </div>
      <div className="space-y-1">
        {campos.map(c => {
          const isSel = Array.isArray(c.opcoes)
          return (
            <div key={c.key} className="flex items-center gap-2">
              <label className="text-[11px] text-gray-600 flex-1 flex items-center gap-1 truncate">
                <span className="truncate" title={c.label || c.key}>{c.label || c.key}</span>
                <FiscalBadge tipo={c.tipo_fiscal} />
              </label>
              {isSel
                ? <SelectIn value={valores?.[c.key] ?? c.opcoes[0]} onChange={(v) => onChange({ ...valores, [c.key]: v })} opcoes={c.opcoes} w="w-28" />
                : <NumIn value={valores?.[c.key]} onChange={(v) => onChange({ ...valores, [c.key]: v })} placeholder={c.placeholder} tipoFiscal={c.tipo_fiscal} w="w-20" />
              }
              <span className="text-[10px] text-gray-400 w-12 text-left">{c.sufixo || ''}</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function CampoFixo({ campo, value, onChange, valorSingular, onSingularChange }) {
  const isSel = Array.isArray(campo.opcoes)
  return (
    <div className="flex items-center gap-2">
      <label className="text-xs text-gray-700 flex-1 flex items-center gap-1.5 min-w-0">
        <span className="truncate" title={campo.label}>{campo.label}</span>
        <FiscalBadge tipo={campo.tipo_fiscal} />
      </label>
      {isSel
        ? <SelectIn value={value} onChange={onChange} opcoes={campo.opcoes} w="w-28" />
        : <NumIn value={value} onChange={onChange} placeholder={campo.placeholder} tipoFiscal={campo.tipo_fiscal} w="w-24" />
      }
      <span className="text-[10px] text-gray-400 w-14 text-left">{campo.sufixo || ''}</span>
      {campo.acompanha_singular && (
        <label className="flex items-center gap-1 text-[10px] text-gray-500 shrink-0" title="Prestador singular (cat. B IRS) — retenção 25%">
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

// ── Tabela de linhas livres (sem selectors IVA) ────────────
function LinhasLivresTabela({ linhas, onChange }) {
  const adicionar = () => {
    onChange([...linhas, {
      id: uid(), descricao: '', qtd: 1, unidade: 'un',
      mat_eur_un: 0, mo_eur_un: 0, autoliq_mo: false, retencao_irs: 0,
    }])
  }
  const remover = (id) => onChange(linhas.filter(l => l.id !== id))
  const editar = (id, patch) => onChange(linhas.map(l => l.id === id ? { ...l, ...patch } : l))

  return (
    <div className="border border-gray-200 rounded-lg overflow-hidden">
      <div className="bg-gray-50 px-3 py-2 border-b border-gray-200 flex items-center justify-between">
        <span className="text-xs font-semibold text-gray-700 uppercase tracking-wide">Linhas livres</span>
        <button
          onClick={adicionar}
          className="flex items-center gap-1 text-xs font-medium px-2 py-1 rounded transition-colors hover:bg-white"
          style={{ color: GOLD, border: `1px solid ${GOLD}66` }}
        >
          <Plus className="w-3 h-3" /> Adicionar linha
        </button>
      </div>

      {linhas.length === 0 ? (
        <p className="text-xs text-gray-400 text-center py-4 italic">Sem linhas adicionais.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-gray-50 border-b border-gray-200 text-gray-500">
              <tr>
                <th className="text-left font-medium px-2 py-1.5 min-w-[200px]">Descrição</th>
                <th className="text-left font-medium px-1 py-1.5 w-16">Qtd</th>
                <th className="text-left font-medium px-1 py-1.5 w-16">Unid.</th>
                <th className="text-left font-medium px-1 py-1.5 w-24">
                  <span className="inline-flex items-center gap-1">€/un mat <FiscalBadge tipo="material" /></span>
                </th>
                <th className="text-left font-medium px-1 py-1.5 w-24">
                  <span className="inline-flex items-center gap-1">€/un MO <FiscalBadge tipo="mo" /></span>
                </th>
                <th className="text-left font-medium px-1 py-1.5 w-12" title="MO em autoliquidação">Auto.</th>
                <th className="text-left font-medium px-1 py-1.5 w-20">Ret. IRS</th>
                <th className="w-8"></th>
              </tr>
            </thead>
            <tbody>
              {linhas.map(l => (
                <tr key={l.id} className="border-b border-gray-100 hover:bg-gray-50/50">
                  <td className="px-2 py-1">
                    <TextIn value={l.descricao} onChange={(v) => editar(l.id, { descricao: v })} placeholder="Descrição" w="w-full" />
                  </td>
                  <td className="px-1 py-1"><NumIn value={l.qtd} onChange={(v) => editar(l.id, { qtd: v })} w="w-14" /></td>
                  <td className="px-1 py-1">
                    <SelectIn value={l.unidade} onChange={(v) => editar(l.id, { unidade: v })} opcoes={['un','m²','m','m³','h','dias','vg','kg']} w="w-14" />
                  </td>
                  <td className="px-1 py-1"><NumIn value={l.mat_eur_un} onChange={(v) => editar(l.id, { mat_eur_un: v })} tipoFiscal="material" w="w-20" /></td>
                  <td className="px-1 py-1"><NumIn value={l.mo_eur_un} onChange={(v) => editar(l.id, { mo_eur_un: v })} tipoFiscal="mo" w="w-20" /></td>
                  <td className="px-1 py-1 text-center">
                    <input
                      type="checkbox"
                      checked={!!l.autoliq_mo}
                      onChange={(e) => editar(l.id, { autoliq_mo: e.target.checked })}
                      className="w-3 h-3"
                    />
                  </td>
                  <td className="px-1 py-1">
                    <SelectIn value={l.retencao_irs} onChange={(v) => editar(l.id, { retencao_irs: v })} opcoes={RETENCOES_IRS.map(r => ({ value: r.key, label: r.key + '%' }))} w="w-20" />
                  </td>
                  <td className="px-1 py-1 text-right">
                    <button onClick={() => remover(l.id)} className="text-gray-400 hover:text-red-500 p-1" title="Remover">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// ── Componente principal ───────────────────────────────────
export function SeccaoCard({ seccao, dados, pisos, onChange, calc }) {
  const [aberto, setAberto] = useState(false)
  const subtotal = calc?.subtotal_bruto ?? 0
  const linhas = calc?.linhas || []
  const haAutoliq = linhas.some(l => l.autoliquidacao)
  const semPisos = (seccao.tipo === 'por_piso' || seccao.tipo === 'mixto') && pisos.length === 0

  const setCampo = (key, value) => onChange({ ...(dados || {}), [key]: value })
  const setSingular = (key, value) => onChange({ ...(dados || {}), [`${key}_singular`]: value })
  const setPiso = (pisoNome, valoresPiso) => onChange({
    ...(dados || {}),
    por_piso: { ...(dados?.por_piso || {}), [pisoNome]: valoresPiso },
  })
  const setNotas = (v) => onChange({ ...(dados || {}), notas: v })
  const setCustomLines = (lines) => onChange({ ...(dados || {}), custom_lines: lines })

  const customLines = Array.isArray(dados?.custom_lines) ? dados.custom_lines : []

  return (
    <div className="bg-white border border-gray-200 rounded-xl mb-3 overflow-hidden">
      <button
        onClick={() => setAberto(!aberto)}
        className="w-full flex items-center justify-between p-4 hover:bg-gray-50 transition-colors"
      >
        <div className="flex items-center gap-3 min-w-0">
          <span className="text-xl shrink-0">{seccao.icon}</span>
          <div className="text-left min-w-0">
            <h4 className="text-sm font-semibold text-gray-800 truncate">{seccao.label}</h4>
            <span className="text-[11px] text-gray-400">
              {linhas.length > 0 ? `${linhas.length} linha${linhas.length > 1 ? 's' : ''}` : 'Por preencher'}
              {haAutoliq && ' · autoliquidação'}
              {customLines.length > 0 && ` · ${customLines.length} linha${customLines.length > 1 ? 's' : ''} custom`}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <span className="text-base font-bold" style={{ color: subtotal > 0 ? '#0d0d0d' : '#9ca3af' }}>
            {EUR(subtotal)}
          </span>
          {aberto ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
        </div>
      </button>

      {aberto && (
        <div className="p-4 border-t border-gray-100 space-y-4">
          {semPisos && (
            <div className="flex items-start gap-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-2.5">
              <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
              <span>Adicione pelo menos um piso no topo do separador.</span>
            </div>
          )}

          {/* Bloco MO da secção (dias × €/dia) */}
          {seccao.has_mo && (
            <MOBlock
              dados={dados}
              onChange={onChange}
              defaultEurDia={seccao.mo_default_eur_dia}
            />
          )}

          {/* Por piso */}
          {(seccao.tipo === 'por_piso' || seccao.tipo === 'mixto') && pisos.length > 0 && seccao.campos_piso && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              {pisos.map(p => (
                <CamposPiso
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
          {seccao.campos && seccao.campos.length > 0 && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-1">
              {seccao.campos.map(c => (
                <CampoFixo
                  key={c.key}
                  campo={c}
                  value={dados?.[c.key]}
                  onChange={(v) => setCampo(c.key, v)}
                  valorSingular={dados?.[`${c.key}_singular`]}
                  onSingularChange={(v) => setSingular(c.key, v)}
                />
              ))}
            </div>
          )}

          {seccao.nota && (
            <p className="text-[11px] text-gray-400 italic border-l-2 border-gray-200 pl-2">{seccao.nota}</p>
          )}

          {/* Tabela de linhas livres */}
          <LinhasLivresTabela linhas={customLines} onChange={setCustomLines} />

          {/* Resumo da secção */}
          {linhas.length > 0 && (
            <div className="bg-gray-50 rounded-md p-3 text-xs">
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-gray-500">
                <span>Base: <strong className="text-gray-800">{EUR(calc.subtotal_base)}</strong></span>
                <span>IVA liquidado: <strong className="text-gray-800">{EUR(calc.subtotal_iva)}</strong></span>
                {calc.iva_autoliq > 0 && <span>Autoliq.: <strong className="text-amber-700">{EUR(calc.iva_autoliq)}</strong></span>}
                {calc.retencoes > 0 && <span>Retenções: <strong className="text-red-700">-{EUR(calc.retencoes)}</strong></span>}
                <span className="ml-auto">Total: <strong className="text-base text-gray-900">{EUR(calc.subtotal_bruto)}</strong></span>
              </div>
            </div>
          )}

          <textarea
            value={dados?.notas || ''}
            onChange={(e) => setNotas(e.target.value)}
            placeholder="Notas da secção (opcional)"
            className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:border-gray-500 resize-none"
            rows={2}
          />
        </div>
      )}
    </div>
  )
}

SeccaoCard.GOLD = GOLD
