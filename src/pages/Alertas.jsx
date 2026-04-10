import { useState, useEffect } from 'react'
import { Header } from '../components/layout/Header.jsx'

const EUR = v => new Intl.NumberFormat('pt-PT', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(v ?? 0)
const PCT = v => `${(v ?? 0).toFixed(1)}%`

const SEV_STYLE = {
  critico: 'bg-red-100 text-red-700 border-red-200',
  aviso:   'bg-yellow-100 text-yellow-700 border-yellow-200',
  info:    'bg-blue-100 text-blue-700 border-blue-200',
}
const SEV_DOT = {
  critico: 'bg-red-500',
  aviso:   'bg-yellow-500',
  info:    'bg-blue-400',
}
const TIPO_LABEL = {
  inatividade_investidor: 'Investidor inativo',
  followup_consultor:     'Follow-up atrasado',
  imovel_parado:          'Imóvel parado',
}

const HEALTH_COLOR = pct =>
  pct >= 80 ? 'text-green-600' : pct >= 50 ? 'text-yellow-600' : 'text-red-600'
const HEALTH_BAR = pct =>
  pct >= 80 ? 'bg-green-500' : pct >= 50 ? 'bg-yellow-500' : 'bg-red-500'

export function Alertas() {
  const [alertas, setAlertas]     = useState(null)
  const [health, setHealth]       = useState(null)
  const [loading, setLoading]     = useState(true)
  const [error, setError]         = useState(null)
  const [running, setRunning]     = useState(null)
  const [runResult, setRunResult] = useState(null)

  async function load() {
    setLoading(true); setError(null)
    try {
      const [ar, hr] = await Promise.all([
        fetch('/api/alertas'),
        fetch('/api/data-health'),
      ])
      if (!ar.ok || !hr.ok) throw new Error('Erro no servidor')
      const [a, h] = await Promise.all([ar.json(), hr.json()])
      if (a.error) throw new Error(a.error)
      setAlertas(a); setHealth(h)
    } catch (err) { setError(err.message) }
    finally { setLoading(false) }
  }

  useEffect(() => { load() }, [])

  async function runAutomation(name, label) {
    setRunning(name); setRunResult(null)
    try {
      const r = await fetch(`/api/automation/${name}`, { method: 'POST' })
      const data = await r.json()
      setRunResult({ name: label, ...data })
      load() // Refresh data
    } catch (err) { setRunResult({ name: label, error: err.message }) }
    finally { setRunning(null) }
  }

  const resumo = alertas?.resumo ?? {}
  const dbs = health?.databases ?? {}

  return (
    <>
      <Header title="Centro de Alertas" subtitle="Automações & Higiene de Dados" onRefresh={load} loading={loading} />
      <div className="p-6 flex flex-col gap-6">
        {error && <div className="p-4 bg-red-50 border border-red-200 text-red-700 rounded-xl text-sm">Erro: {error}</div>}

        {/* Resumo */}
        <div className="grid grid-cols-2 xl:grid-cols-5 gap-4">
          {[
            { label: 'Total Alertas', value: resumo.total ?? '—', color: 'text-gray-900' },
            { label: 'Cr\u00edticos', value: resumo.criticos ?? '—', color: 'text-red-600' },
            { label: 'Avisos', value: resumo.avisos ?? '—', color: 'text-yellow-600' },
            { label: 'Info', value: resumo.info ?? '—', color: 'text-blue-500' },
            { label: 'Campos Incompletos', value: resumo.camposIncompletos ?? '—', color: 'text-orange-500' },
          ].map(item => (
            <div key={item.label} className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
              <p className="text-xs text-gray-400 uppercase tracking-wide">{item.label}</p>
              <p className={`text-2xl font-bold mt-1 ${item.color}`}>{item.value}</p>
            </div>
          ))}
        </div>

        {/* Automações */}
        <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
          <h2 className="text-sm font-semibold text-gray-700 mb-4">Automações</h2>
          <div className="grid grid-cols-2 xl:grid-cols-3 gap-3">
            {[
              { key: 'run-all',              label: 'Correr Todas',             desc: 'Executa todas as automações de uma vez' },
              { key: 'score-investidores',   label: 'Scoring Investidores',     desc: 'Classifica A/B/C/D automaticamente' },
              { key: 'score-consultores',    label: 'Scoring Consultores',      desc: 'Classifica A/B/C/D automaticamente' },
              { key: 'calc-roi',             label: 'Calcular ROI',             desc: 'Atualiza ROI nos im\u00f3veis' },
              { key: 'auto-dates',           label: 'Auto-Datas',              desc: 'Preenche datas em falta' },
              { key: 'pipeline-to-faturacao', label: 'Pipeline \u2192 Fatura\u00e7\u00e3o', desc: 'Cria neg\u00f3cios de im\u00f3veis avan\u00e7ados' },
            ].map(auto => (
              <button
                key={auto.key}
                onClick={() => runAutomation(auto.key, auto.label)}
                disabled={running !== null}
                className={`text-left p-4 rounded-xl border transition-all ${
                  running === auto.key ? 'border-yellow-300 bg-yellow-50' : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                } ${running !== null && running !== auto.key ? 'opacity-50' : ''}`}
              >
                <p className="text-sm font-semibold text-gray-800">{auto.label}</p>
                <p className="text-xs text-gray-400 mt-0.5">{auto.desc}</p>
                {running === auto.key && <p className="text-xs text-yellow-600 mt-1 font-medium">A executar...</p>}
              </button>
            ))}
          </div>
          {runResult && (
            <div className={`mt-4 p-4 rounded-xl text-sm ${runResult.error ? 'bg-red-50 text-red-700' : 'bg-green-50 text-green-700'}`}>
              <p className="font-semibold">{runResult.name}: {runResult.error ? `Erro — ${runResult.error}` : 'Conclu\u00eddo'}</p>
              {runResult.atualizados != null && <p className="mt-1">{runResult.atualizados} registos atualizados</p>}
              {runResult.criados != null && <p className="mt-1">{runResult.criados} registos criados</p>}
              {runResult.results && (
                <div className="mt-2 space-y-1">
                  {Object.entries(runResult.results).map(([k, v]) => (
                    <p key={k} className="text-xs">
                      {k}: {v.error ? `Erro` : `${v.atualizados ?? v.criados ?? 0} alterados`}
                    </p>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Alertas */}
        <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
          <h2 className="text-sm font-semibold text-gray-700 mb-4">
            Alertas Ativos ({alertas?.alertas?.length ?? 0})
          </h2>
          <div className="space-y-2 max-h-[500px] overflow-y-auto">
            {(alertas?.alertas ?? []).map((a, i) => (
              <div key={i} className={`flex items-center gap-3 px-4 py-3 rounded-lg border ${SEV_STYLE[a.severidade] ?? ''}`}>
                <span className={`w-2 h-2 rounded-full shrink-0 ${SEV_DOT[a.severidade] ?? ''}`} />
                <div className="flex-1 min-w-0">
                  <span className="text-xs font-medium uppercase tracking-wide opacity-60">
                    {TIPO_LABEL[a.tipo] ?? a.tipo}
                  </span>
                  <p className="font-semibold text-sm truncate">{a.entidade}</p>
                </div>
                <p className="text-xs shrink-0">{a.mensagem}</p>
                {a.status && <span className="text-xs opacity-60 shrink-0">{a.status}</span>}
              </div>
            ))}
            {alertas?.alertas?.length === 0 && (
              <p className="text-center text-gray-400 text-sm py-8">Sem alertas ativos</p>
            )}
          </div>
        </div>

        {/* Campos em Falta */}
        {alertas?.camposEmFalta?.length > 0 && (
          <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
            <h2 className="text-sm font-semibold text-gray-700 mb-4">
              Campos Obrigatórios em Falta ({alertas.camposEmFalta.length})
            </h2>
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 text-gray-400 text-xs uppercase tracking-wide">
                    <th className="text-left py-2 px-3">Base de Dados</th>
                    <th className="text-left py-2 px-3">Registo</th>
                    <th className="text-left py-2 px-3">Campos em Falta</th>
                  </tr>
                </thead>
                <tbody>
                  {alertas.camposEmFalta.slice(0, 50).map((item, i) => (
                    <tr key={i} className="border-b border-gray-50 hover:bg-gray-50">
                      <td className="py-2 px-3">
                        <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-600">{item.db}</span>
                      </td>
                      <td className="py-2 px-3 font-medium text-gray-800">{item.nome || '(sem nome)'}</td>
                      <td className="py-2 px-3">
                        <div className="flex flex-wrap gap-1">
                          {item.campos.map(c => (
                            <span key={c} className="px-2 py-0.5 rounded-full text-xs bg-orange-100 text-orange-700">{c}</span>
                          ))}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Data Health */}
        <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-gray-700">Higiene de Dados</h2>
            {health?.scoreGlobal != null && (
              <span className={`text-lg font-bold ${HEALTH_COLOR(health.scoreGlobal)}`}>
                {PCT(health.scoreGlobal)} global
              </span>
            )}
          </div>
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
            {Object.entries(dbs).map(([dbName, db]) => (
              <div key={dbName}>
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-sm font-semibold text-gray-700 capitalize">{dbName}</h3>
                  <span className="text-xs text-gray-400">{db.total} registos</span>
                </div>
                <div className="space-y-1.5">
                  {Object.entries(db.campos).map(([campo, pct]) => (
                    <div key={campo} className="flex items-center gap-3">
                      <span className="text-xs text-gray-500 w-40 shrink-0 truncate">{campo}</span>
                      <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
                        <div className={`h-full rounded-full transition-all ${HEALTH_BAR(pct)}`} style={{ width: `${pct}%` }} />
                      </div>
                      <span className={`text-xs font-mono w-12 text-right ${HEALTH_COLOR(pct)}`}>{pct}%</span>
                    </div>
                  ))}
                </div>
                {db.scoreMedio != null && (
                  <p className={`text-xs mt-2 font-semibold ${HEALTH_COLOR(db.scoreMedio)}`}>
                    Score m\u00e9dio: {PCT(db.scoreMedio)}
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </>
  )
}
