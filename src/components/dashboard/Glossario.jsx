import { useMemo, useState } from 'react'
import { BookOpen, Search } from 'lucide-react'
import { Input, Select } from '../ui/Input.jsx'
import { Badge } from '../ui/Badge.jsx'
import { pesquisar, ESTADOS, DEPARTAMENTOS } from '../../lib/catalogoMetricas.js'
import { TOM_ESTADO, useFicha } from './Indicador.jsx'

// Aba de consulta: todas as siglas, com nome em português e inglês e explicação.
export function Glossario() {
  const abrir = useFicha()
  const [texto, setTexto] = useState('')
  const [departamento, setDepartamento] = useState('')
  const [estado, setEstado] = useState('')
  const lista = useMemo(() => pesquisar(texto)
    .filter(x => (!departamento || x.departamento === departamento) && (!estado || x.estado === estado))
    .sort((a, b) => a.sigla.localeCompare(b.sigla, 'pt-PT')), [texto, departamento, estado])

  return (
    <div className="bg-surface-raised rounded-xl border border-line shadow-xs overflow-hidden">
      <div className="px-4 py-3 border-b border-line flex items-center gap-3">
        <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-surface-muted">
          <BookOpen className="w-4 h-4 text-ink-muted" aria-hidden="true" />
        </div>
        <div>
          <h3 className="text-ui font-semibold text-ink">Glossário</h3>
          <p className="text-caption text-ink-muted">{lista.length} indicadores. Abre qualquer um para ver a explicação completa.</p>
        </div>
      </div>
      <div className="p-4 grid grid-cols-1 sm:grid-cols-[1fr_auto_auto] gap-2 border-b border-line">
        <Input aria-label="Pesquisar" placeholder="Sigla ou nome, em português ou inglês" prefix={<Search className="w-4 h-4" />} value={texto} onChange={e => setTexto(e.target.value)} />
        <Select aria-label="Departamento" value={departamento} onChange={e => setDepartamento(e.target.value)}>
          <option value="">Todos os departamentos</option>
          {Object.entries(DEPARTAMENTOS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </Select>
        <Select aria-label="Estado" value={estado} onChange={e => setEstado(e.target.value)}>
          <option value="">Todos os estados</option>
          {Object.entries(ESTADOS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </Select>
      </div>
      {lista.length === 0 && <p className="p-6 text-sm text-center text-ink-muted">Nenhum indicador corresponde à pesquisa.</p>}
      <ul className="divide-y divide-line">
        {lista.map(x => (
          <li key={x.id}>
            <button type="button" onClick={() => abrir(x.id)} className="w-full text-left px-4 py-3 flex gap-3 hover:bg-surface-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent">
              <span className="w-20 shrink-0 text-sm font-semibold text-ink num break-words">{x.sigla}</span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-medium text-ink">{x.nome}</span>
                <span className="block text-caption text-ink-muted">{x.nomeEn}</span>
                <span className="block text-sm text-ink-muted mt-0.5">{x.explicacao}</span>
              </span>
              <Badge tone={TOM_ESTADO[x.estado]} className="self-start shrink-0">{ESTADOS[x.estado].label}</Badge>
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}
