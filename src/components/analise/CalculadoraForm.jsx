/**
 * Formulário da calculadora de rentabilidade — secções A-F.
 * Os inputs são guardados com debounce via useAnalise.guardar().
 */
import { useState, useEffect, useCallback } from 'react'
import { EUR } from '../../constants.js'

const GOLD = '#C9A84C'
const BLACK = '#1A1A1A'

const FINALIDADES = [
  { value: 'Empresa_isencao', label: 'Empresa c/ isenção IMT (Lei 56/2023)' },
  { value: 'Empresa', label: 'Empresa Imobiliária' },
  { value: 'HPP', label: 'Habitação Própria Permanente' },
  { value: 'HS', label: 'Habitação Secundária' },
]

const REGIMES = [
  { value: 'Empresa', label: 'Empresa (IRC PME)' },
  { value: 'Particular', label: 'Particular (IRS)' },
]

export function CalculadoraForm({ analise, onUpdate }) {
  const [form, setForm] = useState({})
  // Só Aquisição e Venda abertos por defeito
  const [openSections, setOpenSections] = useState({
    aquisicao: true, financiamento: false, obra: false,
    detencao: false, venda: true, fiscal: false,
  })

  useEffect(() => {
    if (analise) setForm(analise)
  }, [analise?.id, analise?.versao])

  const handleChange = useCallback((field, value) => {
    setForm(prev => {
      const next = { ...prev, [field]: value }
      onUpdate({ [field]: value })
      return next
    })
  }, [onUpdate])

  const toggleSection = (s) => setOpenSections(prev => ({ ...prev, [s]: !prev[s] }))

  if (!analise) return null

  return (
    <div className="space-y-3">
      {/* A. Custos de Aquisição */}
      <Section title="Aquisição" tag="A" open={openSections.aquisicao} onToggle={() => toggleSection('aquisicao')}
        summary={analise.total_aquisicao > 0 ? EUR(analise.total_aquisicao) : null}
        hint="Preço de compra, impostos e custos de escritura">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          <Input label="Preço de Compra" field="compra" value={form.compra} onChange={handleChange} placeholder="Ex: 150000" required />
          <Input label="Valor Patrimonial (VPT)" field="vpt" value={form.vpt} onChange={handleChange} placeholder="Caderneta predial" />
          <Select label="Finalidade" field="finalidade" value={form.finalidade} options={FINALIDADES} onChange={handleChange} />
          <Input label="Escritura" field="escritura" value={form.escritura} onChange={handleChange} placeholder="~700€" />
          <Input label="CPCV Compra" field="cpcv_compra" value={form.cpcv_compra} onChange={handleChange} placeholder="0" />
          <Input label="Due Diligence" field="due_diligence" value={form.due_diligence} onChange={handleChange} placeholder="0" />
        </div>
        <CalcRow items={[
          { label: 'IMT', value: analise.imt },
          { label: 'Imposto Selo', value: analise.imposto_selo },
          { label: 'Total Aquisição', value: analise.total_aquisicao, bold: true },
        ]} />
      </Section>

      {/* B. Financiamento */}
      <Section title="Financiamento" tag="B" open={openSections.financiamento} onToggle={() => toggleSection('financiamento')}
        summary={analise.valor_financiado > 0 ? EUR(analise.valor_financiado) : 'Sem financiamento'}
        hint="Crédito bancário (opcional)">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          <Input label="% Financiamento" field="perc_financiamento" value={form.perc_financiamento} onChange={handleChange} step="1" placeholder="0 = sem crédito" />
          <Input label="Prazo (anos)" field="prazo_anos" value={form.prazo_anos} onChange={handleChange} step="1" placeholder="30" />
          <Input label="TAN %" field="tan" value={form.tan} onChange={handleChange} step="0.1" placeholder="3.5" />
          <Select label="Tipo Taxa" field="tipo_taxa" value={form.tipo_taxa}
            options={[{ value: 'Fixa', label: 'Taxa Fixa' }, { value: 'Variável', label: 'Taxa Variável' }]} onChange={handleChange} />
          <Input label="Comissões Banco" field="comissoes_banco" value={form.comissoes_banco} onChange={handleChange} placeholder="0" />
          <Input label="Hipoteca" field="hipoteca" value={form.hipoteca} onChange={handleChange} placeholder="0" />
        </div>
        <CalcRow items={[
          { label: 'Financiado', value: analise.valor_financiado },
          { label: 'Prestação/mês', value: analise.prestacao_mensal },
          { label: 'IS Financ.', value: analise.is_financiamento },
          { label: 'Penalização', value: analise.penalizacao_amort },
        ]} />
      </Section>

      {/* C. Custos de Obra */}
      <Section title="Obra" tag="C" open={openSections.obra} onToggle={() => toggleSection('obra')}
        summary={analise.obra_com_iva > 0 ? EUR(analise.obra_com_iva) : 'Sem obra'}
        hint="Custos de remodelação e IVA">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          <Input label="Custo da Obra (s/ IVA)" field="obra" value={form.obra} onChange={handleChange} placeholder="Ex: 30000" />
          <Input label="% Mão-de-obra" field="pmo_perc" value={form.pmo_perc} onChange={handleChange} step="5" placeholder="65" />
          <Toggle label="Zona ARU (IVA 6%)" field="aru" value={form.aru} onChange={handleChange} />
          <Toggle label="Ampliação (IVA 23%)" field="ampliacao" value={form.ampliacao} onChange={handleChange} />
          <Input label="Licenciamento" field="licenciamento" value={form.licenciamento} onChange={handleChange} placeholder="0" />
        </div>
        <CalcRow items={[
          { label: 'IVA Obra', value: analise.iva_obra },
          { label: 'Obra c/ IVA', value: analise.obra_com_iva, bold: true },
        ]} />
      </Section>

      {/* D. Custos de Detenção */}
      <Section title="Detenção" tag="D" open={openSections.detencao} onToggle={() => toggleSection('detencao')}
        summary={`${analise.meses || 6} meses · ${EUR(analise.total_detencao)}`}
        hint="Custos mensais enquanto detém o imóvel">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          <Input label="Meses de detenção" field="meses" value={form.meses} onChange={handleChange} step="1" placeholder="6" required />
          <Input label="Seguro / mês" field="seguro_mensal" value={form.seguro_mensal} onChange={handleChange} placeholder="0" />
          <Input label="Condomínio / mês" field="condominio_mensal" value={form.condominio_mensal} onChange={handleChange} placeholder="0" />
          <Input label="Utilidades / mês" field="utilidades_mensal" value={form.utilidades_mensal} onChange={handleChange} placeholder="0" />
          <Input label="N.º Tranches obra" field="n_tranches" value={form.n_tranches} onChange={handleChange} step="1" placeholder="1" />
          <Input label="Custo / Tranche" field="custo_tranche" value={form.custo_tranche} onChange={handleChange} placeholder="0" />
          <Input label="Taxa IMI %" field="taxa_imi" value={form.taxa_imi} onChange={handleChange} step="0.05" placeholder="0.3" />
          <Input label="Ligação Serviços" field="ligacao_servicos" value={form.ligacao_servicos} onChange={handleChange} placeholder="0" />
          <Input label="Excedente Capital" field="excedente_capital" value={form.excedente_capital} onChange={handleChange} placeholder="0" />
        </div>
        <CalcRow items={[
          { label: 'IMI proporcional', value: analise.imi_proporcional },
          { label: 'Total Detenção', value: analise.total_detencao, bold: true },
        ]} />
      </Section>

      {/* E. Custos de Venda */}
      <Section title="Venda" tag="E" open={openSections.venda} onToggle={() => toggleSection('venda')}
        summary={analise.vvr > 0 ? `VVR: ${EUR(analise.vvr)}` : null}
        hint="Preço de venda e custos associados">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          <Input label="VVR (Valor de Venda)" field="vvr" value={form.vvr} onChange={handleChange} placeholder="Ex: 250000" required />
          <Input label="Comissão Agência %" field="comissao_perc" value={form.comissao_perc} onChange={handleChange} step="0.5" placeholder="2.5" />
          <Input label="CPCV Venda" field="cpcv_venda" value={form.cpcv_venda} onChange={handleChange} placeholder="0" />
          <Input label="Certificado Energético" field="cert_energetico" value={form.cert_energetico} onChange={handleChange} placeholder="~250" />
          <Input label="Home Staging" field="home_staging" value={form.home_staging} onChange={handleChange} placeholder="0" />
          <Input label="Outros custos" field="outros_venda" value={form.outros_venda} onChange={handleChange} placeholder="0" />
        </div>
        <CalcRow items={[
          { label: 'Comissão c/ IVA', value: analise.comissao_com_iva },
          { label: 'Total Venda', value: analise.total_venda, bold: true },
        ]} />
      </Section>

      {/* F. Fiscalidade */}
      <Section title="Fiscalidade" tag="F" open={openSections.fiscal} onToggle={() => toggleSection('fiscal')}
        summary={analise.impostos > 0 ? `Impostos: ${EUR(analise.impostos)}` : null}
        hint="IRC (empresa) ou IRS (particular) — OE 2026">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          <Select label="Regime Fiscal" field="regime_fiscal" value={form.regime_fiscal} options={REGIMES} onChange={handleChange} />
          {form.regime_fiscal === 'Empresa' ? <>
            <Input label="Derrama Municipal %" field="derrama_perc" value={form.derrama_perc} onChange={handleChange} step="0.5" placeholder="1.5" />
            <Input label="% Distribuição Dividendos" field="perc_dividendos" value={form.perc_dividendos} onChange={handleChange} step="10" placeholder="100" />
          </> : <>
            <Input label="Ano de Aquisição" field="ano_aquisicao" value={form.ano_aquisicao} onChange={handleChange} step="1" placeholder="2026" />
            <Toggle label="Englobamento IRS" field="englobamento" value={form.englobamento} onChange={handleChange} />
            {form.englobamento && <Input label="Taxa IRS Marginal %" field="taxa_irs_marginal" value={form.taxa_irs_marginal} onChange={handleChange} step="1" placeholder="28" />}
          </>}
        </div>
        <CalcRow items={[
          { label: 'Impostos', value: analise.impostos, bold: true },
          ...(form.regime_fiscal === 'Empresa' ? [{ label: 'Retenção Dividendos', value: analise.retencao_dividendos }] : []),
        ]} />
      </Section>
    </div>
  )
}

// ── Sub-componentes ──────────────────────────────────────────

function Section({ title, tag, open, onToggle, summary, hint, children }) {
  return (
    <div className="rounded-xl border border-gray-200 overflow-hidden transition-shadow hover:shadow-sm">
      <button onClick={onToggle} className="w-full flex items-center gap-3 px-4 py-3 transition-colors hover:bg-gray-50">
        <span className="w-6 h-6 rounded-md flex items-center justify-center text-xs font-bold text-white shrink-0" style={{ backgroundColor: BLACK }}>
          {tag}
        </span>
        <div className="flex-1 text-left">
          <span className="text-sm font-semibold text-gray-800">{title}</span>
          {!open && hint && <span className="text-xs text-gray-400 ml-2">{hint}</span>}
        </div>
        <div className="flex items-center gap-2">
          {summary && <span className="text-xs font-mono text-gray-500 hidden sm:inline">{summary}</span>}
          <span className="text-gray-400 text-sm transition-transform" style={{ transform: open ? 'rotate(180deg)' : 'none' }}>▾</span>
        </div>
      </button>
      {open && <div className="px-4 pb-4 pt-1 border-t border-gray-100">{children}</div>}
    </div>
  )
}

function CalcRow({ items }) {
  return (
    <div className="mt-3 flex flex-wrap gap-2">
      {items.map((item, i) => (
        <div key={i} className="rounded-lg px-3 py-1.5 text-xs" style={{ backgroundColor: item.bold ? GOLD + '15' : '#f3f4f6' }}>
          <span className="text-gray-400">{item.label}: </span>
          <span className={`font-mono ${item.bold ? 'font-semibold text-gray-800' : 'text-gray-600'}`}>{EUR(item.value)}</span>
        </div>
      ))}
    </div>
  )
}

function Input({ label, field, value, onChange, step, placeholder, required }) {
  const handleChange = (e) => {
    const v = e.target.value === '' ? 0 : parseFloat(e.target.value)
    onChange(field, v)
  }
  return (
    <div>
      <label className="text-xs text-gray-500 block mb-1">
        {label}{required && <span style={{ color: GOLD }}> *</span>}
      </label>
      <input
        type="number"
        step={step || '100'}
        value={value ?? ''}
        onChange={handleChange}
        placeholder={placeholder}
        className="w-full rounded-lg border border-gray-200 px-3 py-2.5 text-sm font-mono placeholder:text-gray-300 focus:outline-none focus:ring-2 transition-shadow"
        style={{ '--tw-ring-color': GOLD + '66' }}
      />
    </div>
  )
}

function Select({ label, field, value, options, onChange }) {
  return (
    <div>
      <label className="text-xs text-gray-500 block mb-1">{label}</label>
      <select
        value={value ?? options[0]?.value}
        onChange={(e) => onChange(field, e.target.value)}
        className="w-full rounded-lg border border-gray-200 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 transition-shadow"
        style={{ '--tw-ring-color': GOLD + '66' }}
      >
        {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </div>
  )
}

function Toggle({ label, field, value, onChange }) {
  return (
    <div className="flex items-center gap-3 py-2">
      <button
        type="button"
        onClick={() => onChange(field, !value)}
        className="w-10 h-5 rounded-full transition-colors relative"
        style={{ backgroundColor: value ? GOLD : '#d1d5db' }}
      >
        <div className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-all ${value ? 'left-5' : 'left-0.5'}`} />
      </button>
      <span className="text-sm text-gray-700">{label}</span>
    </div>
  )
}
