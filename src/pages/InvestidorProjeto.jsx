/**
 * Vista pública (sem login) de um projecto para investidores.
 * Acedida via /investidor/projeto/:token — token gerado em ProjectoDetalhe.
 *
 * Mostra: banner, KPIs (sem internos sensíveis), timeline de fases, galeria de fotos.
 */
import { useState, useEffect } from 'react'
import { useParams } from 'react-router-dom'
import { CheckCircle2, Circle, Calendar, Building2, FileDown } from 'lucide-react'

const EUR = v => v == null ? '—' : new Intl.NumberFormat('pt-PT', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(v)
const DATE = v => v ? new Date(v).toLocaleDateString('pt-PT') : '—'

const FASE_ICON = {
  aquisicao: '🔑', projeto_licenca: '📐', demolicoes: '🔨', estrutura_especialidades: '⚡',
  acabamentos: '🎨', exterior_fecho: '🏠', comercializacao: '📣', vendido: '✅',
}
const FASE_COR = {
  aquisicao: '#6366f1', projeto_licenca: '#0ea5e9', demolicoes: '#ef4444',
  estrutura_especialidades: '#f59e0b', acabamentos: '#10b981', exterior_fecho: '#8b5cf6',
  comercializacao: '#ec4899', vendido: '#22c55e',
}

export function InvestidorProjeto() {
  const { token } = useParams()
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    fetch(`/api/public/projetos/${token}`)
      .then(r => r.ok ? r.json() : r.json().then(e => Promise.reject(new Error(e.error || 'Erro'))))
      .then(setData)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [token])

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#0d0d0d]">
        <div className="w-6 h-6 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: '#C9A84C', borderTopColor: 'transparent' }} />
      </div>
    )
  }
  if (error || !data) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#0d0d0d] text-center px-6">
        <div>
          <p className="text-[#C9A84C] text-2xl font-bold mb-2">Link inválido</p>
          <p className="text-gray-400 text-sm">{error || 'O link de partilha não está ativo ou já expirou.'}</p>
        </div>
      </div>
    )
  }

  const { negocio, imovel, fases, fotos, percGlobal } = data

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header brand */}
      <header className="bg-[#0d0d0d] text-white">
        <div className="max-w-5xl mx-auto px-6 py-6 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img src="/logo-transparent.png" alt="Somnium" className="h-10" />
            <div>
              <p className="text-[#C9A84C] font-bold text-lg leading-tight">SOMNIUM PROPERTIES</p>
              <p className="text-[10px] uppercase tracking-wider text-gray-400">Acompanhamento de Projecto</p>
            </div>
          </div>
          <a href={`/api/public/projetos/${token}/pdf/relatorio`} target="_blank" rel="noreferrer"
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-[#C9A84C] text-[#0d0d0d] text-xs font-semibold hover:bg-[#b39440] transition-colors">
            <FileDown className="w-3.5 h-3.5" /> Descarregar PDF
          </a>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-6 space-y-6">
        {/* Banner do projeto */}
        <div className="bg-gradient-to-br from-[#0d0d0d] to-[#1f1f1f] rounded-2xl p-6 text-white shadow-md">
          <p className="text-[10px] uppercase tracking-wider text-[#C9A84C] opacity-80">{negocio.categoria}</p>
          <h1 className="text-3xl font-bold mt-1" style={{ color: '#C9A84C' }}>{negocio.movimento}</h1>
          {imovel?.nome && (
            <p className="text-sm text-gray-300 mt-1 flex items-center gap-1.5">
              <Building2 className="w-3.5 h-3.5" /> {imovel.nome}{imovel.zona && ` · ${imovel.zona}`}{imovel.tipologia && ` · ${imovel.tipologia}`}
            </p>
          )}
          <div className="mt-5 grid grid-cols-2 sm:grid-cols-4 gap-4">
            <Kpi label="Execução global" value={`${percGlobal}%`} />
            <Kpi label="Capital total" value={EUR(negocio.capital_total)} />
            <Kpi label="Faturação esperada" value={EUR(negocio.lucro_estimado)} />
            <Kpi label="Venda estimada" value={DATE(negocio.data_estimada_venda)} />
          </div>
          <div className="mt-5 w-full h-2 rounded-full bg-white/10 overflow-hidden">
            <div className="h-full rounded-full" style={{ width: `${percGlobal}%`, background: '#C9A84C' }} />
          </div>
        </div>

        {/* Timeline de fases */}
        <section className="bg-white rounded-2xl p-5 sm:p-6 shadow-sm border border-gray-200">
          <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-4 flex items-center gap-1.5">
            <Calendar className="w-4 h-4" /> Cronograma da Obra
          </h2>
          <div className="space-y-3">
            {fases.map((f) => {
              const cor = FASE_COR[f.fase_key] || '#6b7280'
              const icon = FASE_ICON[f.fase_key] || '🛠️'
              const isDone = f.estado === 'concluida'
              const isCurrent = f.estado === 'em_curso'
              return (
                <div key={f.id} className="flex items-start gap-3">
                  <div className="flex flex-col items-center">
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center text-lg ${isDone ? 'bg-green-100' : isCurrent ? '' : 'bg-gray-100'}`}
                      style={isCurrent ? { background: `${cor}25` } : {}}>
                      {icon}
                    </div>
                  </div>
                  <div className="flex-1 pb-3 border-b border-gray-100 last:border-b-0">
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <div className="flex items-center gap-2">
                        <h3 className="text-sm font-semibold text-gray-800">{f.nome}</h3>
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${isDone ? 'bg-green-100 text-green-700' : isCurrent ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-500'}`}>
                          {isDone ? 'Concluída' : isCurrent ? 'Em curso' : 'Pendente'}
                        </span>
                      </div>
                      <span className="text-xs font-mono text-gray-500">{f.perc_execucao || 0}%</span>
                    </div>
                    <div className="mt-1.5 flex items-center gap-3 text-[10px] text-gray-500">
                      <span>{DATE(f.data_inicio_prevista)} → {DATE(f.data_fim_prevista)}</span>
                      <span>{f.tarefas_concluidas}/{f.tarefas_total} tarefas</span>
                      {f.fotos_count > 0 && <span>📷 {f.fotos_count}</span>}
                    </div>
                    <div className="mt-1.5 w-full bg-gray-100 rounded-full h-1.5">
                      <div className="h-full rounded-full transition-all" style={{ width: `${f.perc_execucao || 0}%`, background: cor }} />
                    </div>
                    {isCurrent && f.tarefas && f.tarefas.length > 0 && (
                      <div className="mt-2 space-y-1">
                        {f.tarefas.slice(0, 5).map(t => (
                          <div key={t.id} className="flex items-center gap-1.5 text-[11px]">
                            {t.concluida
                              ? <CheckCircle2 className="w-3 h-3 text-green-600 flex-shrink-0" />
                              : <Circle className="w-3 h-3 text-gray-300 flex-shrink-0" />
                            }
                            <span className={t.concluida ? 'text-gray-400 line-through' : 'text-gray-600'}>{t.descricao}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </section>

        {/* Galeria de fotos */}
        {fotos.length > 0 && (
          <section className="bg-white rounded-2xl p-5 sm:p-6 shadow-sm border border-gray-200">
            <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-4">Registo Fotográfico</h2>
            {(() => {
              const grupos = {}
              for (const f of fotos) {
                const k = f.fase_ordem
                if (!grupos[k]) grupos[k] = { nome: f.fase_nome, key: f.fase_key, fotos: [] }
                grupos[k].fotos.push(f)
              }
              return Object.entries(grupos).map(([k, g]) => (
                <div key={k} className="mb-5 last:mb-0">
                  <h3 className="text-xs font-semibold text-gray-700 mb-2 flex items-center gap-1.5">
                    {FASE_ICON[g.key]} {g.nome} <span className="text-gray-300">({g.fotos.length})</span>
                  </h3>
                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
                    {g.fotos.map(foto => (
                      <div key={foto.id} className="aspect-square rounded-lg overflow-hidden bg-gray-100 border border-gray-200 relative">
                        <img src={foto.url} alt="" className="w-full h-full object-cover" />
                        <span className="absolute top-1 left-1 px-1.5 py-0.5 rounded text-[9px] font-medium uppercase tracking-wide text-white"
                          style={{ background: foto.tipo === 'antes' ? '#ef4444cc' : foto.tipo === 'depois' ? '#22c55ecc' : '#0d0d0dcc' }}>
                          {foto.tipo}
                        </span>
                        {foto.legenda && <p className="absolute bottom-0 inset-x-0 bg-black/60 text-white text-[10px] p-1 truncate">{foto.legenda}</p>}
                      </div>
                    ))}
                  </div>
                </div>
              ))
            })()}
          </section>
        )}

        {/* Footer institucional */}
        <footer className="text-center text-[10px] text-gray-400 py-6 border-t border-gray-200">
          <p>Documento confidencial · Somnium Properties · {new Date().toLocaleDateString('pt-PT')}</p>
          <p className="mt-1">Este link é exclusivo para investidores. Não partilhar.</p>
        </footer>
      </main>
    </div>
  )
}

function Kpi({ label, value }) {
  return (
    <div>
      <p className="text-[9px] uppercase tracking-wider text-gray-400">{label}</p>
      <p className="text-xl font-mono font-bold text-white mt-0.5">{value}</p>
    </div>
  )
}
