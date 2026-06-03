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
  { value: 'Sem', label: 'Sem regime fiscal (valor bruto)' },
]

const CATEGORIAS_IRS = [
  { value: 'G', label: 'Cat. G — Mais-Valia (deal pontual)' },
  { value: 'B-simplificado', label: 'Cat. B — Simplificado (vendas × 0,15)' },
  { value: 'B-organizada', label: 'Cat. B — Contabilidade Organizada' },
]

export function CalculadoraForm({ analise, imovel, onUpdate }) {
  const [form, setForm] = useState({})
  // Só Aquisição e Venda abertos por defeito
  const [openSections, setOpenSections] = useState({
    aquisicao: true, financiamento: false, obra: false,
    detencao: false, venda: true, fiscal: false, exit_alt: false,
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

  // Preco de aquisicao derivado da ficha: Wholesaling -> valor_com_cedencia; outros modelos -> valor_proposta
  const isWholesaling = imovel?.modelo_negocio === 'Wholesaling'
  const fonteCompra = isWholesaling ? Number(imovel?.valor_com_cedencia) : Number(imovel?.valor_proposta)
  const compraLabel = isWholesaling ? 'Valor já com Cedência' : 'Valor da Proposta'
  const compraLocked = Number.isFinite(fonteCompra) && fonteCompra > 0

  return (
    <div className="space-y-3">
      {/* A. Custos de Aquisição */}
      <Section title="Aquisição" tag="A" open={openSections.aquisicao} onToggle={() => toggleSection('aquisicao')}
        summary={analise.total_aquisicao > 0 ? EUR(analise.total_aquisicao) : null}
        hint="Preço de compra, impostos e custos de escritura">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          <Input
            label={compraLocked ? compraLabel : 'Preço de Compra'}
            field="compra"
            value={compraLocked ? fonteCompra : form.compra}
            onChange={handleChange}
            placeholder="Ex: 150000"
            required
            readOnly={compraLocked}
            hint={compraLocked ? `Definido em Valores → ${compraLabel}` : null}
          />
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
        <div className="mb-3">
          <Select label="Modo de cálculo" field="modo_obra" value={form.modo_obra || 'calculado'}
            options={[
              { value: 'calculado', label: 'Calculado (orçamento + PMO % + IVA)' },
              { value: 'fixo', label: 'Valor fixo do empreiteiro / gestor de obra' },
            ]} onChange={handleChange} />
        </div>
        {form.modo_obra === 'fixo' ? (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              <Input label="Valor final (c/ IVA, do empreiteiro)" field="obra" value={form.obra} onChange={handleChange} placeholder="Ex: 36900" />
              <Input label="Licenciamento" field="licenciamento" value={form.licenciamento} onChange={handleChange} placeholder="0" />
            </div>
            <div className="mt-2 text-xs text-gray-400">
              Valor usado tal e qual — sem IVA computado, sem PMO % nem regimes ARU/Ampliação.
            </div>
            <CalcRow items={[
              { label: 'Obra (valor fixo)', value: analise.obra_com_iva, bold: true },
            ]} />
          </>
        ) : (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              <Input label="Custo da Obra (s/ IVA)" field="obra" value={form.obra} onChange={handleChange} placeholder="Ex: 30000" />
              <Input label="% Mão-de-obra" field="pmo_perc" value={form.pmo_perc} onChange={handleChange} step="5" placeholder="65" />
              <Toggle label="Zona ARU (IVA 6%)" field="aru" value={form.aru} onChange={handleChange} />
              <Toggle label="Ampliação (IVA 23%)" field="ampliacao" value={form.ampliacao} onChange={handleChange} />
              <Input label="Licenciamento" field="licenciamento" value={form.licenciamento} onChange={handleChange} placeholder="0" />
            </div>
            {(form.pmo_perc > 0) && (
              <div className="mt-3 pl-3 border-l-2" style={{ borderColor: GOLD + '60' }}>
                <div className="text-xs text-gray-500 mb-2">Desagregação do PMO (opcional — mostra detalhe no relatório):</div>
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                  <Input label="Arquitectura %" field="pmo_arq_perc" value={form.pmo_arq_perc} onChange={handleChange} step="0.5" placeholder="0" />
                  <Input label="Fiscalização %" field="pmo_fisc_perc" value={form.pmo_fisc_perc} onChange={handleChange} step="0.5" placeholder="0" />
                  <Input label="Coord. Segurança %" field="pmo_seg_obra_perc" value={form.pmo_seg_obra_perc} onChange={handleChange} step="0.5" placeholder="0" />
                  <Input label="Outros %" field="pmo_outros_perc" value={form.pmo_outros_perc} onChange={handleChange} step="0.5" placeholder="0" />
                </div>
                <PMOValidation form={form} />
              </div>
            )}
            <CalcRow items={[
              { label: 'IVA Obra', value: analise.iva_obra },
              { label: 'Obra c/ IVA', value: analise.obra_com_iva, bold: true },
            ]} />
          </>
        )}
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
          <Input label="Taxa IMI %" field="taxa_imi" value={form.taxa_imi} onChange={handleChange} step="0.05" placeholder="0.30 a 0.45 (Coimbra 0.30 · Porto/Gaia 0.40)" />
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
        summary={form.regime_fiscal === 'Sem' ? 'Sem regime fiscal (valor bruto)' : (analise.impostos > 0 ? `Impostos: ${EUR(analise.impostos)}` : null)}
        hint="IRC (empresa), IRS (particular) ou valor bruto — OE 2026">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          <Select label="Regime Fiscal" field="regime_fiscal" value={form.regime_fiscal} options={REGIMES} onChange={handleChange} />
          {form.regime_fiscal === 'Empresa' ? <>
            <Input label="Derrama Municipal %" field="derrama_perc" value={form.derrama_perc} onChange={handleChange} step="0.5" placeholder="1.5" />
            <Input label="% Distribuição Dividendos" field="perc_dividendos" value={form.perc_dividendos} onChange={handleChange} step="10" placeholder="100" />
          </> : form.regime_fiscal === 'Sem' ? null : <>
            <Select label="Categoria IRS" field="categoria_irs" value={form.categoria_irs || 'G'} options={CATEGORIAS_IRS} onChange={handleChange} />
            <Input label="Ano de Aquisição" field="ano_aquisicao" value={form.ano_aquisicao} onChange={handleChange} step="1" placeholder="2026" />
            {(form.categoria_irs || 'G') === 'G' ? <>
              <Toggle label="Englobamento IRS" field="englobamento" value={form.englobamento} onChange={handleChange} />
              {form.englobamento && <Input label="Taxa IRS Marginal %" field="taxa_irs_marginal" value={form.taxa_irs_marginal} onChange={handleChange} step="1" placeholder="28" />}
            </> : <>
              <Input label="Taxa IRS Marginal %" field="taxa_irs_marginal" value={form.taxa_irs_marginal} onChange={handleChange} step="1" placeholder="28" />
            </>}
          </>}
        </div>
        {form.regime_fiscal === 'Sem' && (
          <div className="mt-2 text-xs text-gray-400 leading-relaxed">
            <strong>Sem regime fiscal</strong>: apresenta o lucro bruto ao investidor, sem deduzir qualquer imposto.
            O lucro líquido iguala o lucro bruto. A fiscalidade fica a cargo do investidor, conforme a estrutura
            jurídica que adoptar para o negócio.
          </div>
        )}
        {form.regime_fiscal === 'Particular' && (
          <div className="mt-2 text-xs text-gray-400 leading-relaxed">
            <strong>Cat. G</strong>: mais-valia ocasional — 50% × 28% (autónoma) ou × marginal (englobada). Art. 43.º n.º 2 CIRS.<br />
            <strong>Cat. B simplificado</strong>: actividade habitual de revenda — base = VVR × 0,15 (Art. 31.º), tributada à marginal IRS.<br />
            <strong>Cat. B organizada</strong>: contabilidade organizada — base = lucro bruto × marginal IRS.<br />
            Em dúvida, consultar o contabilista. A AT pode reclassificar Cat. G→B em caso de habitualidade.
          </div>
        )}
        <CalcRow items={[
          { label: 'Impostos', value: analise.impostos, bold: true },
          ...(form.regime_fiscal === 'Empresa' ? [{ label: 'Retenção Dividendos', value: analise.retencao_dividendos }] : []),
        ]} />
      </Section>

      {/* Exit Alternativo (arrendamento) */}
      <Section title="Exit Alternativo" tag="K" open={openSections.exit_alt} onToggle={() => toggleSection('exit_alt')}
        summary={form.renda_mensal > 0 ? `${EUR(form.renda_mensal)}/mês` : 'Não preenchido'}
        hint="Análise de arrendamento como saída alternativa">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          <Input label="Renda Mensal Estimada" field="renda_mensal" value={form.renda_mensal} onChange={handleChange} placeholder="Ex: 750" />
          <Input label="Vacancy %" field="vacancy_pct" value={form.vacancy_pct} onChange={handleChange} step="0.5" placeholder="5" />
          <Input label="Custos Gestão %" field="gestao_arr_pct" value={form.gestao_arr_pct} onChange={handleChange} step="0.5" placeholder="8" />
        </div>
        <div className="mt-2 text-xs text-gray-400">
          Activa a secção "K. Exit Alternativo" no relatório PDF.
        </div>
      </Section>
    </div>
  )
}

function PMOValidation({ form }) {
  const total = parseFloat(form.pmo_perc) || 0
  const soma = (parseFloat(form.pmo_arq_perc) || 0)
    + (parseFloat(form.pmo_fisc_perc) || 0)
    + (parseFloat(form.pmo_seg_obra_perc) || 0)
    + (parseFloat(form.pmo_outros_perc) || 0)
  if (soma === 0) return null
  if (Math.abs(soma - total) > 0.1) {
    return (
      <div className="mt-2 text-xs" style={{ color: '#8B1A1A' }}>
        ⚠ Soma dos sub-campos ({soma.toFixed(1)}%) não corresponde ao PMO total ({total.toFixed(1)}%).
      </div>
    )
  }
  return (
    <div className="mt-2 text-xs" style={{ color: '#1B5E20' }}>
      ✓ Desagregação válida ({soma.toFixed(1)}% = PMO total).
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

function Input({ label, field, value, onChange, step, placeholder, required, readOnly, hint }) {
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
        readOnly={readOnly}
        className={`w-full rounded-lg border border-gray-200 px-3 py-2.5 text-sm font-mono placeholder:text-gray-300 focus:outline-none focus:ring-2 transition-shadow ${readOnly ? 'bg-gray-50 cursor-not-allowed text-gray-600' : ''}`}
        style={{ '--tw-ring-color': GOLD + '66' }}
      />
      {hint && <p className="text-[10px] text-gray-400 mt-1 italic">{hint}</p>}
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
