/**
 * Painel de detalhe para Imóveis, Investidores, Consultores.
 * Mostra: campos editáveis + relações + timeline + tarefas.
 */
import { useState, useEffect } from 'react'
import { FileDown } from 'lucide-react'
import { AnaliseTab } from '../analise/AnaliseTab.jsx'

const EUR = v => new Intl.NumberFormat('pt-PT', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(v ?? 0)

const ACAO_LABEL = { INSERT: 'Criado', UPDATE: 'Atualizado', DELETE: 'Apagado' }
const ACAO_COLOR = { INSERT: 'text-green-600', UPDATE: 'text-blue-600', DELETE: 'text-red-600' }

export function DetailPanel({ type, id, onClose, onSave }) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState('detalhe')

  const endpoint = { 'Imóveis': 'imoveis', 'Investidores': 'investidores', 'Consultores': 'consultores' }[type]

  useEffect(() => {
    if (!id || !endpoint) return
    setLoading(true)
    setActiveTab('detalhe')
    fetch(`/api/crm/${endpoint}/${id}/full`)
      .then(r => r.json())
      .then(setData)
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [id, endpoint])

  if (loading) return <div className="bg-white rounded-xl border border-gray-200 p-8 text-center text-gray-400">A carregar...</div>
  if (!data) return null

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
      {/* Header */}
      <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between" style={{ backgroundColor: '#0d0d0d' }}>
        <div>
          <p className="text-xs uppercase tracking-widest" style={{ color: '#C9A84C' }}>{type}</p>
          <h2 className="text-lg font-bold text-white">{data.nome ?? data.movimento}</h2>
        </div>
        <div className="flex items-center gap-2">
          {type === 'Imóveis' && (
            <a href={`/api/crm/imoveis/${id}/relatorio`} target="_blank" rel="noreferrer"
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg transition-colors"
              style={{ backgroundColor: '#1a1a1a', color: '#C9A84C', border: '1px solid #C9A84C33' }}>
              <FileDown className="w-3.5 h-3.5" /> Relatório PDF
            </a>
          )}
          <button onClick={onClose} className="text-gray-400 hover:text-white text-xl">&times;</button>
        </div>
      </div>

      {/* Tabs */}
      {type === 'Imóveis' && (
        <div className="flex border-b border-gray-200" style={{ backgroundColor: '#F5F4F0' }}>
          {[
            { key: 'detalhe', label: 'Detalhe', icon: '📋' },
            { key: 'analise', label: 'Análise Financeira', icon: '📊' },
          ].map(t => (
            <button key={t.key} onClick={() => setActiveTab(t.key)}
              className="relative px-5 py-3 text-sm font-medium transition-colors"
              style={{
                color: activeTab === t.key ? '#1A1A1A' : '#9ca3af',
                backgroundColor: activeTab === t.key ? 'white' : 'transparent',
              }}>
              <span className="mr-1.5">{t.icon}</span>{t.label}
              {activeTab === t.key && (
                <span className="absolute bottom-0 left-0 right-0 h-0.5" style={{ backgroundColor: '#C9A84C' }} />
              )}
            </button>
          ))}
        </div>
      )}

      {/* Análise Financeira tab */}
      {type === 'Imóveis' && activeTab === 'analise' ? (
        <div className="p-6">
          <AnaliseTab imovelId={data.id} imovelNome={data.nome} />
        </div>
      ) : (

      <div className="p-6 grid grid-cols-1 xl:grid-cols-3 gap-6">
        {/* Main info */}
        <div className="xl:col-span-2 space-y-6">
          {/* Key fields */}
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {type === 'Imóveis' && <>
              <Field label="Estado" value={data.estado?.replace(/^\d+-/, '')} />
              <Field label="Ask Price" value={data.ask_price > 0 ? EUR(data.ask_price) : '—'} />
              <Field label="Valor Proposta" value={data.valor_proposta > 0 ? EUR(data.valor_proposta) : '—'} />
              <Field label="ROI" value={data.roi > 0 ? `${data.roi}%` : '—'} />
              <Field label="Zona" value={data.zona} />
              <Field label="Tipologia" value={data.tipologia} />
              <Field label="Modelo" value={data.modelo_negocio} />
              <Field label="Origem" value={data.origem} />
              <Field label="Consultor" value={data.nome_consultor} />
              <Field label="Data Adicionado" value={data.data_adicionado} />
              <Field label="Data Chamada" value={data.data_chamada} />
              <Field label="Data Visita" value={data.data_visita} />
              <Field label="Data Proposta" value={data.data_proposta} />
            </>}
            {type === 'Investidores' && <>
              <Field label="Status" value={data.status} />
              <Field label="Classificação" value={data.classificacao} />
              <Field label="Pontuação" value={data.pontuacao} />
              <Field label="Origem" value={data.origem} />
              <Field label="Capital Min" value={data.capital_min > 0 ? EUR(data.capital_min) : '—'} />
              <Field label="Capital Max" value={data.capital_max > 0 ? EUR(data.capital_max) : '—'} />
              <Field label="Telemóvel" value={data.telemovel} />
              <Field label="Email" value={data.email} />
              <Field label="NDA" value={data.nda_assinado ? 'Sim' : 'Não'} />
              <Field label="1º Contacto" value={data.data_primeiro_contacto} />
              <Field label="Reunião" value={data.data_reuniao} />
              <Field label="Próxima Ação" value={data.proxima_acao} />
            </>}
            {type === 'Consultores' && <>
              <Field label="Estatuto" value={data.estatuto} />
              <Field label="Classificação" value={data.classificacao} />
              <Field label="Contacto" value={data.contacto} />
              <Field label="Email" value={data.email} />
              <Field label="Imobiliária" value={(() => { try { return JSON.parse(data.imobiliaria || '[]').join(', ') } catch { return '—' } })()} />
              <Field label="Leads Enviados" value={data.imoveis_enviados} />
              <Field label="Off-Market" value={data.imoveis_off_market} />
              <Field label="Comissão" value={data.comissao > 0 ? `${data.comissao}%` : '—'} />
              <Field label="Follow Up" value={data.data_follow_up} />
              <Field label="Próx. Follow Up" value={data.data_proximo_follow_up} />
            </>}
          </div>

          {data.notas && (
            <div>
              <p className="text-xs text-gray-400 uppercase tracking-wide mb-1">Notas</p>
              <p className="text-sm text-gray-700 bg-gray-50 rounded-lg p-3">{data.notas}</p>
            </div>
          )}

          {/* Relações */}
          {data.negocios?.length > 0 && (
            <div>
              <p className="text-xs text-gray-400 uppercase tracking-wide mb-2">Negócios Associados</p>
              <div className="space-y-2">
                {data.negocios.map(n => (
                  <div key={n.id} className="flex items-center justify-between bg-indigo-50 rounded-lg px-3 py-2">
                    <span className="text-sm font-medium text-indigo-800">{n.movimento}</span>
                    <div className="flex gap-3 text-xs">
                      <span className="text-indigo-600">{n.categoria}</span>
                      <span className="font-mono">{EUR(n.lucro_estimado)}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {data.consultores?.length > 0 && (
            <div>
              <p className="text-xs text-gray-400 uppercase tracking-wide mb-2">Consultores</p>
              <div className="space-y-2">
                {data.consultores.map(c => (
                  <div key={c.id} className="flex items-center justify-between bg-blue-50 rounded-lg px-3 py-2">
                    <span className="text-sm font-medium text-blue-800">{c.nome}</span>
                    <span className="text-xs text-blue-600">{c.estatuto} · {c.contacto}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {data.imoveis?.length > 0 && (
            <div>
              <p className="text-xs text-gray-400 uppercase tracking-wide mb-2">Imóveis</p>
              <div className="space-y-2">
                {data.imoveis.map(i => (
                  <div key={i.id} className="flex items-center justify-between bg-green-50 rounded-lg px-3 py-2">
                    <span className="text-sm font-medium text-green-800">{i.nome}</span>
                    <div className="flex gap-3 text-xs">
                      <span className="text-green-600">{i.estado?.replace(/^\d+-/, '')}</span>
                      <span className="font-mono">{EUR(i.ask_price)}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Sidebar: Tarefas + Timeline */}
        <div className="space-y-6">
          {/* Tarefas */}
          <div>
            <p className="text-xs text-gray-400 uppercase tracking-wide mb-2">Tarefas</p>
            {data.tarefas?.length > 0 ? (
              <div className="space-y-1.5">
                {data.tarefas.slice(0, 10).map(t => (
                  <div key={t.id} className={`text-xs px-2 py-1.5 rounded ${t.status === 'Concluida' ? 'bg-green-50 text-green-700 line-through' : t.status === 'Atrasada' ? 'bg-red-50 text-red-700' : 'bg-gray-50 text-gray-700'}`}>
                    {t.tarefa}
                  </div>
                ))}
              </div>
            ) : <p className="text-xs text-gray-300">Sem tarefas</p>}
          </div>

          {/* Timeline */}
          <div>
            <p className="text-xs text-gray-400 uppercase tracking-wide mb-2">Timeline</p>
            {data.timeline?.length > 0 ? (
              <div className="space-y-2">
                {data.timeline.slice(0, 15).map(t => (
                  <div key={t.id} className="flex gap-2 text-xs">
                    <span className="text-gray-300 w-16 shrink-0">{t.created_at?.slice(5, 10)}</span>
                    <span className={`font-medium ${ACAO_COLOR[t.acao] ?? 'text-gray-500'}`}>{ACAO_LABEL[t.acao] ?? t.acao}</span>
                  </div>
                ))}
              </div>
            ) : <p className="text-xs text-gray-300">Sem histórico</p>}
          </div>
        </div>
      </div>
      )}
    </div>
  )
}

function Field({ label, value }) {
  return (
    <div>
      <p className="text-xs text-gray-400">{label}</p>
      <p className="text-sm font-medium text-gray-800 truncate">{value || '—'}</p>
    </div>
  )
}
