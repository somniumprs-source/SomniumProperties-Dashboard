/**
 * Tab de dados legais do investidor: empresa (pessoa colectiva, com sócios e
 * representantes) e titular do capital quando é outra pessoa (o investidor
 * actua como representante). Ambos alimentam o Dossiê de Investidor.
 */
import { useState } from 'react'
import { Building2, Plus, Trash2 } from 'lucide-react'
import { apiFetch } from '../../lib/api.js'
import { useToast } from '../ui/Toast.jsx'
import { friendlyError } from '../../lib/friendlyError.js'

const EMPRESA_VAZIA = {
  firma: '', forma_juridica: '', nipc: '', niss: '', capital_social: '',
  sede: '', iban: '', email_empresa: '', socios: [],
}

const SOCIO_VAZIO = {
  nome: '', estado_civil: '', naturalidade: '', nif: '', cartao_cidadao: '', cartao_cidadao_validade: '', morada: '',
}

const TITULAR_VAZIO = {
  nome: '', relacao: '', estado_civil: '', naturalidade: '', nif: '', cartao_cidadao: '', cartao_cidadao_validade: '',
  morada: '', email: '', iban: '',
}

const TITULAR_CAMPOS = [
  { key: 'nome', label: 'Nome completo' },
  { key: 'relacao', label: 'Relação com o investidor', placeholder: 'Ex.: capital da mãe, representada pelo investidor' },
  ...SOCIO_CAMPOS_BASE(),
  { key: 'email', label: 'Email' },
  { key: 'iban', label: 'IBAN de origem' },
]

function SOCIO_CAMPOS_BASE() {
  return [
    { key: 'estado_civil', label: 'Estado Civil' },
    { key: 'naturalidade', label: 'Naturalidade' },
    { key: 'nif', label: 'NIF' },
    { key: 'cartao_cidadao', label: 'Cartão de Cidadão' },
    { key: 'cartao_cidadao_validade', label: 'Validade CC' },
    { key: 'morada', label: 'Residência' },
  ]
}

const preenchido = (obj, ignorar = []) => Object.entries(obj || {}).some(([k, v]) =>
  !ignorar.includes(k) && (Array.isArray(v) ? v.length > 0 : String(v ?? '').trim() !== ''))

function normalizeDadosEmpresa(raw) {
  if (!raw || typeof raw !== 'object') return { ...EMPRESA_VAZIA }
  return {
    ...EMPRESA_VAZIA,
    ...raw,
    socios: Array.isArray(raw.socios) ? raw.socios.map(s => ({ ...SOCIO_VAZIO, ...s })) : [],
  }
}

const EMPRESA_CAMPOS = [
  { key: 'firma', label: 'Firma / Denominação' },
  { key: 'forma_juridica', label: 'Forma Jurídica' },
  { key: 'nipc', label: 'NIPC / Registo Comercial' },
  { key: 'niss', label: 'NISS' },
  { key: 'capital_social', label: 'Capital Social' },
  { key: 'sede', label: 'Sede' },
  { key: 'iban', label: 'IBAN / NIB' },
  { key: 'email_empresa', label: 'Email' },
]

const SOCIO_CAMPOS = [
  { key: 'nome', label: 'Nome' },
  { key: 'estado_civil', label: 'Estado Civil' },
  { key: 'naturalidade', label: 'Naturalidade' },
  { key: 'nif', label: 'NIF' },
  { key: 'cartao_cidadao', label: 'Cartão de Cidadão' },
  { key: 'cartao_cidadao_validade', label: 'Validade CC' },
  { key: 'morada', label: 'Residência' },
]

export function DadosEmpresaInvestidorTab({ investidorId, dadosEmpresa: initial, titularCapital, onUpdate, readOnly = false }) {
  const toast = useToast()
  const [form, setForm] = useState(() => normalizeDadosEmpresa(initial))
  const formBruto = form
  const [titular, setTitular] = useState(() => ({ ...TITULAR_VAZIO, ...(titularCapital && typeof titularCapital === 'object' ? titularCapital : {}) }))
  const titularBruto = titular
  const [saving, setSaving] = useState(false)

  const inputClass = 'w-full px-3 py-2 rounded-lg border border-line text-sm focus:outline-none focus:ring-2 focus:ring-accent/40'

  function setCampo(key, value) {
    setForm(f => ({ ...f, [key]: value }))
  }

  function setSocio(idx, key, value) {
    setForm(f => ({ ...f, socios: f.socios.map((s, i) => (i === idx ? { ...s, [key]: value } : s)) }))
  }

  function addSocio() {
    setForm(f => ({ ...f, socios: [...f.socios, { ...SOCIO_VAZIO }] }))
  }

  function removeSocio(idx) {
    setForm(f => ({ ...f, socios: f.socios.filter((_, i) => i !== idx) }))
  }

  async function handleSave() {
    setSaving(true)
    try {
      // Texto colado de tabelas traz tabulações e espaços nas pontas.
      const limpar = (o) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k,
        typeof v === 'string' ? v.replace(/\s+/g, ' ').trim() : Array.isArray(v) ? v.map(x => (x && typeof x === 'object' ? limpar(x) : x)) : v]))
      const form = limpar(formBruto)
      const titular = limpar(titularBruto)
      const r = await apiFetch(`/api/crm/investidores/${investidorId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        // Vazio grava null: dados_empresa preenchido marca o investidor como empresa.
        body: JSON.stringify({
          dados_empresa: preenchido(form) ? form : null,
          titular_capital: preenchido(titular) ? titular : null,
        }),
      })
      if (!r.ok) {
        const err = await r.json().catch(() => ({}))
        throw new Error(err.error || `Erro ${r.status}`)
      }
      setForm(form); setTitular(titular)
      toast('Dados legais guardados', 'success')
      if (onUpdate) onUpdate()
    } catch (err) {
      toast(friendlyError(err.message || 'Erro ao guardar dados da empresa'), 'error')
    }
    setSaving(false)
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <Building2 className="w-4 h-4 text-ink-muted" />
        <h3 className="text-sm font-semibold text-ink">Dados da Empresa</h3>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {EMPRESA_CAMPOS.map(c => (
          <div key={c.key}>
            <label className="block text-xs font-medium text-ink-muted mb-1">{c.label}</label>
            <input
              value={form[c.key] || ''}
              onChange={e => setCampo(c.key, e.target.value)}
              className={inputClass}
              disabled={readOnly}
            />
          </div>
        ))}
      </div>

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-ink">Representantes Legais / Sócios</h3>
          {!readOnly && (
            <button
              onClick={addSocio}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-accent text-accent-foreground hover:brightness-[1.04] transition-colors"
            >
              <Plus className="w-3.5 h-3.5" /> Adicionar Sócio
            </button>
          )}
        </div>

        {form.socios.length === 0 ? (
          <div className="text-center py-6 text-ink-muted text-sm">Nenhum sócio registado.</div>
        ) : (
          form.socios.map((socio, idx) => (
            <div key={idx} className="bg-surface rounded-xl p-4 space-y-3 border border-line">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-ink-muted">Sócio {idx + 1}</span>
                {!readOnly && (
                  <button
                    onClick={() => removeSocio(idx)}
                    className="p-1.5 rounded-lg hover:bg-danger/10 text-ink-muted hover:text-danger"
                    title="Remover sócio"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {SOCIO_CAMPOS.map(c => (
                  <div key={c.key}>
                    <label className="block text-xs font-medium text-ink-muted mb-1">{c.label}</label>
                    <input
                      value={socio[c.key] || ''}
                      onChange={e => setSocio(idx, c.key, e.target.value)}
                      className={inputClass}
                      disabled={readOnly}
                    />
                  </div>
                ))}
              </div>
            </div>
          ))
        )}
      </div>

      <div className="space-y-3">
        <div>
          <h3 className="text-sm font-semibold text-ink">Titular do Capital</h3>
          <p className="text-xs text-ink-muted mt-0.5">Preencher só quando o capital pertence a outra pessoa e o investidor actua como seu representante.</p>
        </div>
        <div className="bg-surface rounded-xl p-4 border border-line grid grid-cols-1 sm:grid-cols-2 gap-3">
          {TITULAR_CAMPOS.map(c => (
            <div key={c.key} className={c.key === 'relacao' ? 'sm:col-span-2' : ''}>
              <label className="block text-xs font-medium text-ink-muted mb-1">{c.label}</label>
              <input
                value={titular[c.key] || ''}
                placeholder={c.placeholder || ''}
                onChange={e => setTitular(t => ({ ...t, [c.key]: e.target.value }))}
                className={inputClass}
                disabled={readOnly}
              />
            </div>
          ))}
        </div>
      </div>

      {!readOnly && (
        <div className="flex justify-end">
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-4 py-1.5 text-xs font-medium rounded-lg bg-accent text-accent-foreground hover:brightness-[1.04] disabled:opacity-50"
          >
            {saving ? 'A guardar...' : 'Guardar'}
          </button>
        </div>
      )}
    </div>
  )
}
