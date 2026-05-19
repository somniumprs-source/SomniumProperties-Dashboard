import { useState, useEffect } from 'react'
import { Header } from '../components/layout/Header.jsx'
import { apiFetch } from '../lib/api.js'
import { EUR, PCT } from '../constants.js'
import { Button } from '../components/ui/Button.jsx'
import { KpiCard } from '../components/ui/KpiCard.jsx'
import { Card } from '../components/ui/Card.jsx'
import { Bell, AlertTriangle, AlertCircle, Info, FileWarning, ShieldAlert, History, Database, Zap } from 'lucide-react'
import { useRegiaoGate } from '../contexts/RegiaoContext.jsx'
import { RegiaoModal } from '../components/RegiaoModal.jsx'
import { RegiaoBadge } from '../components/RegiaoBadge.jsx'

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
  inatividade_investidor:        'Investidor inativo',
  investidor_inactivo_recente:   'Investidor → Inactivo (auto)',
  pendente_aprovacao:            'Lead pendente',
  followup_consultor:            'Follow-up atrasado',
  imovel_parado:                 'Imóvel parado',
  consultor_sem_contacto_48h:    'Consultor sem 1º contacto',
  consultor_inativo_15d:         'Consultor inativo',
  stress_prejuizo:               'Risco de prejuízo',
  ra_baixo:                      'Retorno baixo',
  vpt_superior:                  'VPT superior',
  imt_caducidade:                'Isenção IMT a caducar',
  relatorio_reuniao_disponivel:  'Relatório de reunião',
}

const HEALTH_COLOR = pct =>
  pct >= 80 ? 'text-green-600' : pct >= 50 ? 'text-yellow-600' : 'text-red-600'
const HEALTH_BAR = pct =>
  pct >= 80 ? 'bg-green-500' : pct >= 50 ? 'bg-yellow-500' : 'bg-red-500'

export function Alertas() {
  const gate = useRegiaoGate('alertas')
  const regiao = gate.regiao
  const [alertas, setAlertas]     = useState(null)
  const [health, setHealth]       = useState(null)
  const [loading, setLoading]     = useState(true)
  const [error, setError]         = useState(null)
  const [running, setRunning]     = useState(null)
  const [runResult, setRunResult] = useState(null)
  const [backups, setBackups]     = useState([])
  const [auditLog, setAuditLog]   = useState([])
  const [backupLoading, setBackupLoading] = useState(false)

  async function load() {
    setLoading(true); setError(null)
    if (!regiao) { setLoading(false); return }
    try {
      const [ar, hr, bl, al] = await Promise.all([
        apiFetch('/api/alertas', { regiao }),
        apiFetch('/api/data-health', { regiao }),
        apiFetch('/api/crm/backup/list', { regiao }).then(r => r.json()).catch(() => []),
        apiFetch('/api/crm/audit?limit=30', { regiao }).then(r => r.json()).catch(() => []),
      ])
      if (!ar.ok || !hr.ok) throw new Error('Erro no servidor')
      const [a, h] = await Promise.all([ar.json(), hr.json()])
      if (a.error) throw new Error(a.error)
      setAlertas(a); setHealth(h); setBackups(bl); setAuditLog(al)
    } catch (err) { setError(err.message) }
    finally { setLoading(false) }
  }

  async function createBackup() {
    setBackupLoading(true)
    try {
      await apiFetch('/api/crm/backup/auto', { method: 'POST' })
      await load()
    } catch (e) { setError(e.message) }
    finally { setBackupLoading(false) }
  }

  async function restoreBackup(id) {
    if (!confirm('Restaurar este backup? O estado actual será guardado antes da restauração.')) return
    setBackupLoading(true)
    try {
      const r = await apiFetch(`/api/crm/backup/restore/${id}`, { method: 'POST' })
      const d = await r.json()
      if (d.error) throw new Error(d.error)
      alert(`Restaurado: ${d.restored} registos de ${d.fromBackup}`)
      await load()
    } catch (e) { setError(e.message) }
    finally { setBackupLoading(false) }
  }

  async function undoAction(auditId) {
    try {
      const r = await apiFetch(`/api/crm/undo/${auditId}`, { method: 'POST' })
      const d = await r.json()
      if (d.error) throw new Error(d.error)
      await load()
    } catch (e) { setError(e.message) }
  }

  useEffect(() => { load() }, [regiao])

  async function runAutomation(name, label) {
    setRunning(name); setRunResult(null)
    try {
      const r = await apiFetch(`/api/automation/${name}`, { method: 'POST' })
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
      <RegiaoModal gate={gate} contexto="O Centro de Alertas" />
      <Header title="Centro de Alertas" subtitle="Automações & Higiene de Dados" onRefresh={load} loading={loading} />
      <div className="p-4 sm:p-6 flex flex-col gap-4 sm:gap-6">
        {regiao && (
          <div className="flex justify-end">
            <RegiaoBadge regiao={regiao} onTrocar={gate.abrirModal} />
          </div>
        )}
        {error && <div className="p-4 bg-red-50 border border-red-200 text-red-700 rounded-xl text-sm">Erro: {error}</div>}

        {/* Hero banner — Centro de Alertas */}
        <div className="relative overflow-hidden rounded-2xl p-5 sm:p-6 text-white shadow-lg bg-gradient-to-br from-brand-dark via-brand-dark-light to-brand-dark-700">
          <div className="absolute top-0 right-0 w-64 h-64 bg-brand-gold/10 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2 pointer-events-none" />
          <div className="absolute top-0 left-0 right-0 h-0.5 bg-gradient-to-r from-transparent via-brand-gold to-transparent" />
          <div className="relative flex items-center justify-between mb-5">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-brand-gold/15 border border-brand-gold/30 flex items-center justify-center">
                <ShieldAlert className="w-4 h-4 text-brand-gold" strokeWidth={1.75} />
              </div>
              <div>
                <h2 className="text-overline uppercase tracking-widest font-semibold text-brand-gold">Centro de Alertas</h2>
                <p className="text-sm font-semibold text-white">Eventos críticos · A monitorizar · Resolvidos</p>
              </div>
            </div>
          </div>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <HeroKpi label="Críticos" value={resumo.criticos ?? '—'} sub="acção imediata" red />
            <HeroKpi label="Avisos" value={resumo.avisos ?? '—'} sub="a monitorizar" accent />
            <HeroKpi label="Info" value={resumo.info ?? '—'} sub="contextual" green />
            <HeroKpi label="Total alertas" value={resumo.total ?? '—'} sub={`${resumo.camposIncompletos ?? 0} campos incompletos`} />
          </div>
        </div>

        {/* Resumo */}
        <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-5 gap-3 sm:gap-4">
          <KpiCard icon={Bell}          label="Total Alertas"      value={resumo.total ?? '—'}             tone="gray" />
          <KpiCard icon={AlertTriangle} label="Críticos"           value={resumo.criticos ?? '—'}          tone="red" />
          <KpiCard icon={AlertCircle}   label="Avisos"             value={resumo.avisos ?? '—'}            tone="amber" />
          <KpiCard icon={Info}          label="Info"               value={resumo.info ?? '—'}              tone="blue" />
          <KpiCard icon={FileWarning}   label="Campos Incompletos" value={resumo.camposIncompletos ?? '—'} tone="amber" />
        </div>

        {/* Automações */}
        <Card padding="md">
          <Card.Header title="Automações" subtitle="Workflows operacionais" icon={Zap} />
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
            {[
              { key: 'run-all',              label: 'Correr Todas',             desc: 'Executa todas as automações de uma vez' },
              { key: 'score-investidores',   label: 'Scoring Investidores',     desc: 'Classifica A/B/C/D automaticamente' },
              { key: 'score-consultores',    label: 'Scoring Consultores',      desc: 'Classifica A/B/C/D automaticamente' },
              { key: 'score-prioridade-consultores', label: 'Score Prioridade',  desc: 'Calcula score 0-100 (qualidade + volume + velocidade)' },
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
        </Card>

        {/* Alertas */}
        <Card padding="md">
          <Card.Header title={`Alertas Ativos (${alertas?.alertas?.length ?? 0})`} subtitle="Eventos por severidade" icon={Bell} />
          <div className="space-y-2 max-h-[500px] overflow-y-auto">
            {(alertas?.alertas ?? []).map((a, i) => (
              <div key={i} className={`flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3 px-3 sm:px-4 py-3 rounded-lg border ${SEV_STYLE[a.severidade] ?? ''}`}>
                <div className="flex items-center gap-2 flex-1 min-w-0">
                  <span className={`w-2 h-2 rounded-full shrink-0 ${SEV_DOT[a.severidade] ?? ''}`} />
                  <div className="flex-1 min-w-0">
                    <span className="text-xs font-medium uppercase tracking-wide opacity-60">
                      {TIPO_LABEL[a.tipo] ?? a.tipo}
                    </span>
                    <p className="font-semibold text-sm truncate">{a.entidade}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2 pl-4 sm:pl-0">
                  <p className="text-xs">{a.mensagem}</p>
                  {a.status && <span className="text-xs opacity-60 shrink-0">{a.status}</span>}
                </div>
              </div>
            ))}
            {alertas?.alertas?.length === 0 && (
              <p className="text-center text-gray-400 text-sm py-8">Sem alertas ativos</p>
            )}
          </div>
        </Card>

        {/* Investidores Inactivos (auto) */}
        {(() => {
          const inactivos = (alertas?.alertas ?? []).filter(a => a.tipo === 'investidor_inactivo_recente')
          if (inactivos.length === 0) return null
          return (
            <Card padding="md">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-sm font-semibold text-gray-700 dark:text-neutral-100">
                  Investidores movidos para Inactivo (últimos 7 dias)
                </h2>
                <span className="text-xs font-mono px-2 py-0.5 rounded-full bg-gray-100 text-gray-600 font-medium">{inactivos.length}</span>
              </div>
              <p className="text-caption text-gray-500 dark:text-neutral-400 mb-3">A cron diária passa Follow Ups parados &gt; 90 dias para Inactivo automaticamente. Revê e reactiva se for caso.</p>
              <div className="space-y-1.5 max-h-[400px] overflow-y-auto">
                {inactivos.map((a, i) => (
                  <div key={i} className="flex items-center justify-between gap-3 px-3 py-2 rounded-lg border border-gray-100 hover:bg-gray-50">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-800 truncate">{a.entidade}</p>
                      <p className="text-xs text-gray-500 truncate">{a.mensagem}</p>
                    </div>
                    <a href={`/crm?tab=Investidores&detail=${a.id}`}
                      className="text-xs px-2.5 py-1 rounded-lg border border-gray-200 bg-white text-gray-700 hover:bg-gray-50 shrink-0">
                      Abrir ficha
                    </a>
                  </div>
                ))}
              </div>
            </Card>
          )
        })()}

        {/* Campos em Falta */}
        {alertas?.camposEmFalta?.length > 0 && (
          <Card padding="md">
            <Card.Header title={`Campos Obrigatórios em Falta (${alertas.camposEmFalta.length})`} subtitle="Higiene de dados" icon={FileWarning} />
            <div className="overflow-x-auto">
              <table className="min-w-[700px] w-full text-sm">
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
          </Card>
        )}

        {/* Data Health */}
        <Card padding="md">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Database className="w-4 h-4 text-brand-gold" strokeWidth={1.75} />
              <h2 className="text-sm font-semibold text-gray-700 dark:text-neutral-100">Higiene de Dados</h2>
            </div>
            {health?.scoreGlobal != null && (
              <span className={`text-lg font-mono font-bold ${HEALTH_COLOR(health.scoreGlobal)}`}>
                {PCT(health.scoreGlobal)} global
              </span>
            )}
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6">
            {Object.entries(dbs).map(([dbName, db]) => (
              <div key={dbName}>
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-sm font-semibold text-gray-700 capitalize">{dbName}</h3>
                  <span className="text-xs text-gray-400">{db.total} registos</span>
                </div>
                <div className="space-y-1.5">
                  {Object.entries(db.campos).map(([campo, pct]) => (
                    <div key={campo} className="flex items-center gap-3">
                      <span className="text-xs text-gray-500 w-24 sm:w-40 shrink-0 truncate">{campo}</span>
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
        </Card>

        {/* ── Backups ────────────────────────── */}
        <Card padding="md">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Database className="w-4 h-4 text-brand-gold" strokeWidth={1.75} />
              <h2 className="text-sm font-semibold text-gray-700 dark:text-neutral-100">Backups</h2>
            </div>
            <button onClick={createBackup} disabled={backupLoading}
              className="px-3 py-1.5 text-xs font-medium rounded-lg text-white disabled:opacity-50"
              style={{ backgroundColor: '#C9A84C' }}>
              {backupLoading ? 'A guardar...' : 'Criar Backup Agora'}
            </button>
          </div>
          <p className="text-xs text-gray-400 mb-3">Backup automático diário às 03:00. Últimos 30 guardados. Cada restauro guarda o estado actual primeiro.</p>
          {backups.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="min-w-[600px] w-full text-xs">
                <thead><tr className="border-b border-gray-100 text-gray-400 uppercase">
                  <th className="text-left py-2 px-3">Data</th>
                  <th className="text-right py-2 px-3">Registos</th>
                  <th className="text-right py-2 px-3">Ações</th>
                </tr></thead>
                <tbody>
                  {backups.map(b => (
                    <tr key={b.id} className="border-b border-gray-50 hover:bg-gray-50">
                      <td className="py-2 px-3 text-gray-700 font-mono">{new Date(b.created_at).toLocaleString('pt-PT')}</td>
                      <td className="py-2 px-3 text-right font-mono">{b.total_registos}</td>
                      <td className="py-2 px-3 text-right">
                        <div className="flex gap-2 justify-end">
                          <a href={`/api/crm/backup/${b.id}/download`} target="_blank" rel="noreferrer"
                            className="text-xs text-indigo-600 hover:underline">Descarregar</a>
                          <button onClick={() => restoreBackup(b.id)} className="text-xs text-orange-600 hover:underline">Restaurar</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : <p className="text-xs text-gray-400 text-center py-4">Sem backups — clica em "Criar Backup Agora"</p>}
        </Card>

        {/* ── Histórico de Alterações ─────────── */}
        <Card padding="md">
          <Card.Header title="Histórico de Alterações (últimas 30)" subtitle="Auditoria & desfazer" icon={History} />
          {auditLog.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="min-w-[600px] w-full text-xs">
                <thead><tr className="border-b border-gray-100 text-gray-400 uppercase">
                  <th className="text-left py-2 px-3">Data</th>
                  <th className="text-left py-2 px-3">Tabela</th>
                  <th className="text-left py-2 px-3">Ação</th>
                  <th className="text-left py-2 px-3">Detalhe</th>
                  <th className="text-right py-2 px-3">Desfazer</th>
                </tr></thead>
                <tbody>
                  {auditLog.map(a => {
                    const prev = a.dados_anteriores ? JSON.parse(a.dados_anteriores) : null
                    const next = a.dados_novos ? JSON.parse(a.dados_novos) : null
                    const nome = prev?.nome || prev?.movimento || prev?.tarefa || next?.nome || next?.movimento || next?.tarefa || '—'
                    const canUndo = ['UPDATE', 'DELETE', 'INSERT'].includes(a.acao)
                    return (
                      <tr key={a.id} className="border-b border-gray-50 hover:bg-gray-50">
                        <td className="py-2 px-3 text-gray-400 font-mono">{new Date(a.created_at).toLocaleString('pt-PT', { day:'2-digit', month:'2-digit', hour:'2-digit', minute:'2-digit' })}</td>
                        <td className="py-2 px-3"><span className="px-1.5 py-0.5 bg-gray-100 rounded text-gray-600">{a.tabela}</span></td>
                        <td className="py-2 px-3">
                          <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${
                            a.acao === 'INSERT' ? 'bg-green-100 text-green-700' :
                            a.acao === 'UPDATE' ? 'bg-blue-100 text-blue-700' :
                            a.acao === 'DELETE' ? 'bg-red-100 text-red-700' :
                            'bg-gray-100 text-gray-600'
                          }`}>{a.acao}</span>
                        </td>
                        <td className="py-2 px-3 text-gray-600 max-w-[200px] truncate">{nome}</td>
                        <td className="py-2 px-3 text-right">
                          {canUndo && (
                            <button onClick={() => undoAction(a.id)} className="text-xs text-orange-600 hover:underline">Desfazer</button>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          ) : <p className="text-xs text-gray-400 text-center py-4">Sem alterações registadas</p>}
        </Card>
      </div>
    </>
  )
}

function HeroKpi({ label, value, sub, accent, green, red }) {
  return (
    <div className="min-w-0">
      <p className="text-overline uppercase tracking-widest text-gray-400 font-semibold">{label}</p>
      <p className={`text-2xl font-mono font-bold mt-1 truncate ${accent ? 'text-brand-gold' : green ? 'text-green-400' : red ? 'text-red-400' : 'text-white'}`}>{value}</p>
      {sub && <p className="text-caption text-gray-500 mt-0.5 truncate">{sub}</p>}
    </div>
  )
}
