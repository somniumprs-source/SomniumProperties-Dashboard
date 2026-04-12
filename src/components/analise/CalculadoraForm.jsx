/**
 * Formulário da calculadora de rentabilidade — secções A-F.
 * Os inputs são guardados com debounce via useAnalise.guardar().
 * Nunca calcula localmente — envia para o backend e recebe resultados.
 */
import { useState, useEffect, useCallback } from 'react'
import { EUR } from '../../constants.js'

const FINALIDADES = [
  { value: 'HPP', label: 'HPP' },
  { value: 'HS', label: 'Hab. Secundária' },
  { value: 'Empresa', label: 'Empresa Imobiliária' },
  { value: 'Empresa_isencao', label: 'Empresa c/ isenção IMT' },
]

const REGIMES = [
  { value: 'Empresa', label: 'Empresa (IRC)' },
  { value: 'Particular', label: 'Particular (IRS)' },
]

export function CalculadoraForm({ analise, onUpdate }) {
  const [form, setForm] = useState({})
  const [openSections, setOpenSections] = useState({ aquisicao: true, obra: true, venda: true })

  // Sync form com análise seleccionada
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

  if (!analise) return <p className="text-sm text-gray-400 py-8 text-center">Cria uma análise para começar</p>

  return (
    <div className="space-y-4">
      {/* A. Custos de Aquisição */}
      <Section title="A. Custos de Aquisição" open={openSections.aquisicao} onToggle={() => toggleSection('aquisicao')}
        summary={analise.total_aquisicao > 0 ? EUR(analise.total_aquisicao) : null}>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          <Input label="Preço de Compra" field="compra" value={form.compra} onChange={handleChange} type="money" />
          <Input label="VPT" field="vpt" value={form.vpt} onChange={handleChange} type="money" />
          <Select label="Finalidade" field="finalidade" value={form.finalidade} options={FINALIDADES} onChange={handleChange} />
          <Input label="Escritura" field="escritura" value={form.escritura} onChange={handleChange} type="money" />
          <Input label="CPCV Compra" field="cpcv_compra" value={form.cpcv_compra} onChange={handleChange} type="money" />
          <Input label="Due Diligence" field="due_diligence" value={form.due_diligence} onChange={handleChange} type="money" />
        </div>
        <div className="mt-2 grid grid-cols-3 gap-2 text-xs">
          <Calc label="IMT" value={analise.imt} />
          <Calc label="I. Selo" value={analise.imposto_selo} />
          <Calc label="Total Aquisição" value={analise.total_aquisicao} bold />
        </div>
      </Section>

      {/* B. Financiamento */}
      <Section title="B. Financiamento" open={openSections.financiamento} onToggle={() => toggleSection('financiamento')}
        summary={analise.valor_financiado > 0 ? EUR(analise.valor_financiado) : null}>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          <Input label="% Financiamento" field="perc_financiamento" value={form.perc_financiamento} onChange={handleChange} type="percent" />
          <Input label="Prazo (anos)" field="prazo_anos" value={form.prazo_anos} onChange={handleChange} type="number" />
          <Input label="TAN %" field="tan" value={form.tan} onChange={handleChange} type="percent" />
          <Select label="Tipo Taxa" field="tipo_taxa" value={form.tipo_taxa}
            options={[{ value: 'Fixa', label: 'Fixa' }, { value: 'Variável', label: 'Variável' }]} onChange={handleChange} />
          <Input label="Comissões Banco" field="comissoes_banco" value={form.comissoes_banco} onChange={handleChange} type="money" />
          <Input label="Hipoteca" field="hipoteca" value={form.hipoteca} onChange={handleChange} type="money" />
        </div>
        <div className="mt-2 grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
          <Calc label="Financiado" value={analise.valor_financiado} />
          <Calc label="Prestação/mês" value={analise.prestacao_mensal} />
          <Calc label="IS Financ." value={analise.is_financiamento} />
          <Calc label="Penaliz." value={analise.penalizacao_amort} />
        </div>
      </Section>

      {/* C. Custos de Obra */}
      <Section title="C. Custos de Obra" open={openSections.obra} onToggle={() => toggleSection('obra')}
        summary={analise.obra_com_iva > 0 ? EUR(analise.obra_com_iva) : null}>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          <Input label="Obra (s/ IVA)" field="obra" value={form.obra} onChange={handleChange} type="money" />
          <Input label="% Mão-de-obra" field="pmo_perc" value={form.pmo_perc} onChange={handleChange} type="percent" />
          <Toggle label="ARU" field="aru" value={form.aru} onChange={handleChange} />
          <Toggle label="Ampliação" field="ampliacao" value={form.ampliacao} onChange={handleChange} />
          <Input label="Licenciamento" field="licenciamento" value={form.licenciamento} onChange={handleChange} type="money" />
        </div>
        <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
          <Calc label="IVA Obra" value={analise.iva_obra} />
          <Calc label="Obra c/ IVA" value={analise.obra_com_iva} bold />
        </div>
      </Section>

      {/* D. Custos de Detenção */}
      <Section title="D. Custos de Detenção" open={openSections.detencao} onToggle={() => toggleSection('detencao')}
        summary={analise.total_detencao > 0 ? EUR(analise.total_detencao) : null}>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          <Input label="Meses" field="meses" value={form.meses} onChange={handleChange} type="number" />
          <Input label="Seguro/mês" field="seguro_mensal" value={form.seguro_mensal} onChange={handleChange} type="money" />
          <Input label="Condomínio/mês" field="condominio_mensal" value={form.condominio_mensal} onChange={handleChange} type="money" />
          <Input label="Utilidades/mês" field="utilidades_mensal" value={form.utilidades_mensal} onChange={handleChange} type="money" />
          <Input label="N.º Tranches" field="n_tranches" value={form.n_tranches} onChange={handleChange} type="number" />
          <Input label="Custo/Tranche" field="custo_tranche" value={form.custo_tranche} onChange={handleChange} type="money" />
          <Input label="Taxa IMI %" field="taxa_imi" value={form.taxa_imi} onChange={handleChange} type="percent" />
          <Input label="Ligação Serviços" field="ligacao_servicos" value={form.ligacao_servicos} onChange={handleChange} type="money" />
          <Input label="Excedente Capital" field="excedente_capital" value={form.excedente_capital} onChange={handleChange} type="money" />
        </div>
        <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
          <Calc label="IMI proporcional" value={analise.imi_proporcional} />
          <Calc label="Total Detenção" value={analise.total_detencao} bold />
        </div>
      </Section>

      {/* E. Custos de Venda */}
      <Section title="E. Custos de Venda" open={openSections.venda} onToggle={() => toggleSection('venda')}
        summary={analise.vvr > 0 ? EUR(analise.vvr) : null}>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          <Input label="VVR (Venda)" field="vvr" value={form.vvr} onChange={handleChange} type="money" />
          <Input label="Comissão %" field="comissao_perc" value={form.comissao_perc} onChange={handleChange} type="percent" />
          <Input label="CPCV Venda" field="cpcv_venda" value={form.cpcv_venda} onChange={handleChange} type="money" />
          <Input label="Cert. Energético" field="cert_energetico" value={form.cert_energetico} onChange={handleChange} type="money" />
          <Input label="Home Staging" field="home_staging" value={form.home_staging} onChange={handleChange} type="money" />
          <Input label="Outros" field="outros_venda" value={form.outros_venda} onChange={handleChange} type="money" />
        </div>
        <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
          <Calc label="Comissão c/ IVA" value={analise.comissao_com_iva} />
          <Calc label="Total Venda" value={analise.total_venda} bold />
        </div>
      </Section>

      {/* F. Fiscalidade */}
      <Section title="F. Fiscalidade" open={openSections.fiscal} onToggle={() => toggleSection('fiscal')}
        summary={analise.impostos > 0 ? EUR(analise.impostos) : null}>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          <Select label="Regime" field="regime_fiscal" value={form.regime_fiscal} options={REGIMES} onChange={handleChange} />
          {form.regime_fiscal === 'Empresa' ? <>
            <Input label="Derrama %" field="derrama_perc" value={form.derrama_perc} onChange={handleChange} type="percent" />
            <Input label="% Dividendos" field="perc_dividendos" value={form.perc_dividendos} onChange={handleChange} type="percent" />
          </> : <>
            <Input label="Ano Aquisição" field="ano_aquisicao" value={form.ano_aquisicao} onChange={handleChange} type="number" />
            <Toggle label="Englobamento" field="englobamento" value={form.englobamento} onChange={handleChange} />
            {form.englobamento && <Input label="Taxa IRS Marginal %" field="taxa_irs_marginal" value={form.taxa_irs_marginal} onChange={handleChange} type="percent" />}
          </>}
        </div>
        <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
          <Calc label="Impostos" value={analise.impostos} />
          {form.regime_fiscal === 'Empresa' && <Calc label="Retenção Divid." value={analise.retencao_dividendos} />}
        </div>
      </Section>
    </div>
  )
}

// ── Sub-componentes ──────────────────────────────────────────

function Section({ title, open, onToggle, summary, children }) {
  return (
    <div className="rounded-xl border border-gray-200 overflow-hidden">
      <button onClick={onToggle} className="w-full flex items-center justify-between px-4 py-3 bg-gray-50 hover:bg-gray-100 transition-colors">
        <span className="text-sm font-semibold text-gray-700">{title}</span>
        <div className="flex items-center gap-2">
          {summary && <span className="text-xs font-mono text-gray-500">{summary}</span>}
          <span className="text-gray-400 text-xs">{open ? '▲' : '▼'}</span>
        </div>
      </button>
      {open && <div className="px-4 py-3">{children}</div>}
    </div>
  )
}

function Input({ label, field, value, onChange, type = 'money' }) {
  const handleChange = (e) => {
    let v = e.target.value
    if (type === 'money' || type === 'percent') v = v === '' ? 0 : parseFloat(v)
    else if (type === 'number') v = v === '' ? 0 : parseInt(v)
    onChange(field, v)
  }

  return (
    <div>
      <label className="text-xs text-gray-500 block mb-0.5">{label}</label>
      <input
        type="number"
        step={type === 'percent' ? '0.1' : type === 'number' ? '1' : '100'}
        value={value ?? ''}
        onChange={handleChange}
        className="w-full rounded-lg border border-gray-200 px-3 py-1.5 text-sm font-mono focus:border-yellow-500 focus:ring-1 focus:ring-yellow-500 outline-none"
      />
    </div>
  )
}

function Select({ label, field, value, options, onChange }) {
  return (
    <div>
      <label className="text-xs text-gray-500 block mb-0.5">{label}</label>
      <select
        value={value ?? options[0]?.value}
        onChange={(e) => onChange(field, e.target.value)}
        className="w-full rounded-lg border border-gray-200 px-3 py-1.5 text-sm focus:border-yellow-500 focus:ring-1 focus:ring-yellow-500 outline-none"
      >
        {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </div>
  )
}

function Toggle({ label, field, value, onChange }) {
  return (
    <div className="flex items-center gap-2 pt-4">
      <button
        onClick={() => onChange(field, !value)}
        className={`w-9 h-5 rounded-full transition-colors ${value ? 'bg-yellow-500' : 'bg-gray-300'}`}
      >
        <div className={`w-4 h-4 bg-white rounded-full shadow transform transition-transform ${value ? 'translate-x-4' : 'translate-x-0.5'}`} />
      </button>
      <span className="text-xs text-gray-600">{label}</span>
    </div>
  )
}

function Calc({ label, value, bold }) {
  return (
    <div className="bg-gray-50 rounded px-2 py-1">
      <span className="text-gray-400">{label}: </span>
      <span className={`font-mono ${bold ? 'font-semibold text-gray-800' : 'text-gray-600'}`}>{EUR(value)}</span>
    </div>
  )
}
