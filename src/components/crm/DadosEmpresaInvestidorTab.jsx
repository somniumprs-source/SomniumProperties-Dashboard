/**
 * Tab de dados legais de empresa (investidor pessoa colectiva).
 * Firma/NIPC/NISS/capital/sede/IBAN + lista repetivel de socios.
 */
import { useState } from 'react'
import { Building2, Plus, Trash2 } from 'lucide-react'
import { apiFetch } from '../../lib/api.js'

const EMPRESA_VAZIA = {
  firma: '', forma_juridica: '', nipc: '', niss: '', capital_social: '',
  sede: '', iban: '', email_empresa: '', socios: [],
}

const SOCIO_VAZIO = {
  nome: '', estado_civil: '', naturalidade: '', nif: '', cartao_cidadao: '', cartao_cidadao_validade: '', morada: '',
}

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

export function DadosEmpresaInvestidorTab({ investidorId, dadosEmpresa: initial, onUpdate, readOnly = false }) {
  const [form, setForm] = useState(() => normalizeDadosEmpresa(initial))
  const [saving, setSaving] = useState(false)

  const inputClass = 'w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300'

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
      await apiFetch(`/api/crm/investidores/${investidorId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dados_empresa: form }),
      })
      if (onUpdate) onUpdate()
    } catch (err) {
      alert(err.message || 'Erro ao guardar dados da empresa')
    }
    setSaving(false)
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <Building2 className="w-4 h-4 text-indigo-500" />
        <h3 className="text-sm font-semibold text-gray-700">Dados da Empresa</h3>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {EMPRESA_CAMPOS.map(c => (
          <div key={c.key}>
            <label className="block text-xs font-medium text-gray-500 mb-1">{c.label}</label>
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
          <h3 className="text-sm font-semibold text-gray-700">Representantes Legais / Sócios</h3>
          {!readOnly && (
            <button
              onClick={addSocio}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 transition-colors"
            >
              <Plus className="w-3.5 h-3.5" /> Adicionar Sócio
            </button>
          )}
        </div>

        {form.socios.length === 0 ? (
          <div className="text-center py-6 text-gray-400 text-sm">Nenhum sócio registado.</div>
        ) : (
          form.socios.map((socio, idx) => (
            <div key={idx} className="bg-gray-50 rounded-xl p-4 space-y-3 border border-gray-200">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-gray-500">Sócio {idx + 1}</span>
                {!readOnly && (
                  <button
                    onClick={() => removeSocio(idx)}
                    className="p-1.5 rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-500"
                    title="Remover sócio"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {SOCIO_CAMPOS.map(c => (
                  <div key={c.key}>
                    <label className="block text-xs font-medium text-gray-500 mb-1">{c.label}</label>
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

      {!readOnly && (
        <div className="flex justify-end">
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-4 py-1.5 text-xs font-medium rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50"
          >
            {saving ? 'A guardar...' : 'Guardar'}
          </button>
        </div>
      )}
    </div>
  )
}
