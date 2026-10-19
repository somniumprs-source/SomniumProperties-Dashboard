import { useState, useEffect } from 'react'
import { Header } from '../components/layout/Header.jsx'
import { apiFetch, openDocument } from '../lib/api.js'
import { useToast } from '../components/ui/Toast.jsx'
import { friendlyError } from '../lib/friendlyError.js'
import { EUR, PCT } from '../constants.js'
import { Button } from '../components/ui/Button.jsx'
import { ErrorState } from '../components/ui/ErrorState.jsx'
import { KpiCard } from '../components/ui/KpiCard.jsx'
import { Card } from '../components/ui/Card.jsx'
import { ScrollableTable } from '../components/ui/ScrollableTable.jsx'
import { Bell, AlertTriangle, AlertCircle, Info, FileWarning, History, Database, Zap } from 'lucide-react'
import { useRefreshOnMutation } from '../hooks/useRefreshOnMutation.js'
import { confirmar } from '../components/ui/ConfirmDialog.jsx'

const SEV_STYLE = {
  critico: 'bg-danger/10 text-danger border-danger/25',
  aviso:   'bg-warning/10 text-warning border-warning/25',
  info:    'bg-surface-muted text-ink border-line',
}
const SEV_DOT = {
  critico: 'bg-danger',
  aviso:   'bg-warning',
  info:    'bg-ink-muted',
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
  conservacao_dados:             'RGPD: conservação de dados',
  tarefa_incompleta:             'Tarefa sem responsável ou prazo',
}

const HEALTH_COLOR = pct =>
  pct >= 80 ? 'text-success' : pct >= 50 ? 'text-warning' : 'text-danger'
const HEALTH_BAR = pct =>
  pct >= 80 ? 'bg-success' : pct >= 50 ? 'bg-warning' : 'bg-danger'

export function Alertas() {
  const toast = useToast()
  const [alertas, setAlertas]     = useState(null)
  const [health, setHealth]       = useState(null)
  const [loading, setLoading]     = useState(true)
  const [error, setError]         = useState(null)
  const [running, setRunning]     = useState(null)
  const [runResult, setRunResult] = useState(null)
  const [backups, setBackups]     = useState([])
  const [auditLog, setAuditLog]   = useState([])
  const [backupLoading, setBackupLoading] = useState(false)
  // Filtro por responsável: dono da região do imóvel, consultor ou projeto (D10).
  const [resp, setResp] = useState('todos')

  async function load() {
    setLoading(true); setError(null)
    try {
      const [ar, hr, bl, al] = await Promise.all([
        apiFetch('/api/alertas'),
        apiFetch('/api/data-health'),
        apiFetch('/api/crm/backup/list').then(r => r.json()).catch(() => []),
        apiFetch('/api/crm/audit?limit=30').then(r => r.json()).catch(() => []),
      ])
      if (!ar.ok || !hr.ok) throw Object.assign(new Error('Erro no servidor'), { status: ar.ok ? hr.status : ar.status })
      const [a, h] = await Promise.all([ar.json(), hr.json()])
      if (a.error) throw new Error(a.error)
      setAlertas(a); setHealth(h); setBackups(bl); setAuditLog(al)
    } catch (err) { setError(err) }
    finally { setLoading(false) }
  }

  async function createBackup() {
    setBackupLoading(true)
    try {
      const r = await apiFetch('/api/crm/backup/auto', { method: 'POST' })
      const d = await r.json().catch(() => ({}))
      if (!r.ok || d.error) throw new Error(d.error || 'Não foi possível criar o backup.')
      toast('Backup criado.', 'success')
      await load()
    } catch (e) { toast(friendlyError(e.message), 'error') }
    finally { setBackupLoading(false) }
  }

  async function restoreBackup(id) {
    if (!(await confirmar('Restaurar este backup? O estado atual será guardado antes da restauração.'))) return
    setBackupLoading(true)
    try {
      const r = await apiFetch(`/api/crm/backup/restore/${id}`, { method: 'POST' })
      const d = await r.json()
      if (d.error) throw new Error(d.error)
      toast(`Restaurado: ${d.restored} registos de ${d.fromBackup}`, 'success')
      await load()
    } catch (e) { toast(friendlyError(e.message), 'error') }
    finally { setBackupLoading(false) }
  }

  async function undoAction(auditId) {
    try {
      const r = await apiFetch(`/api/crm/undo/${auditId}`, { method: 'POST' })
      const d = await r.json()
      if (d.error) throw new Error(d.error)
      toast('Alteração desfeita.', 'success')
      await load()
    } catch (e) { toast(friendlyError(e.message), 'error') }
  }

  useEffect(() => { load() }, [])
  useRefreshOnMutation(load)

  async function runAutomation(name, label, path) {
    setRunning(name); setRunResult(null)
    try {
      const r = await apiFetch(path, { method: 'POST' })
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
      <Header title="Alertas" subtitle="Automações & Higiene de Dados" onRefresh={load} loading={loading} />
      <div className="p-4 sm:p-6 flex flex-col gap-4 sm:gap-6">
        {error && <ErrorState compact title="Não foi possível carregar os alertas" error={error} onRetry={load} />}


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
              { key: 'run-all',              label: 'Correr Todas',             desc: 'Reclassifica investidores e consultores automaticamente', path: '/api/crm/automation/run-all' },
              { key: 'score-investidores',   label: 'Scoring Investidores',     desc: 'Classifica A/B/C/D automaticamente', path: '/api/crm/automation/score-investidores' },
              { key: 'score-prioridade-consultores', label: 'Scoring Consultores',  desc: 'Classifica A/B/C/D (qualidade + volume + velocidade)', path: '/api/crm/automation/score-prioridade-consultores' },
              { key: 'pipeline-to-faturacao', label: 'Pipeline \u2192 Fatura\u00e7\u00e3o', desc: 'Cria neg\u00f3cios de im\u00f3veis avan\u00e7ados', path: '/api/automation/pipeline-to-faturacao' },
            ].map(auto => (
              <button
                key={auto.key}
                onClick={() => runAutomation(auto.key, auto.label, auto.path)}
                disabled={running !== null}
                className={`text-left p-4 rounded-xl border transition-[background-color,border-color,color,box-shadow,opacity,transform] ${
                  running === auto.key ? 'border-warning/30 bg-warning/10' : 'border-line hover:border-line hover:bg-surface'
                } ${running !== null && running !== auto.key ? 'opacity-50' : ''}`}
              >
                <p className="text-sm font-semibold text-ink">{auto.label}</p>
                <p className="text-xs text-ink-muted mt-0.5">{auto.desc}</p>
                {running === auto.key && <p className="text-xs text-warning mt-1 font-medium">A executar...</p>}
              </button>
            ))}
          </div>
          {runResult && (
            <div className={`mt-4 p-4 rounded-xl text-sm ${runResult.error ? 'bg-danger/10 text-danger' : 'bg-success/10 text-success'}`}>
              <p className="font-semibold">{runResult.name}: {runResult.error ? `Erro — ${friendlyError(runResult.error)}` : 'Conclu\u00eddo'}</p>
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
          {(() => {
            const nomes = [...new Set((alertas?.alertas ?? []).map(a => a.responsavel).filter(Boolean))].sort()
            if (!nomes.length) return null
            const chip = on => `px-3 py-1 text-xs font-medium rounded-lg border transition-colors duration-fast ${on ? 'border-ink/30 bg-surface-muted text-ink' : 'border-line text-ink-muted hover:bg-surface-muted'}`
            return (
              <div className="flex flex-wrap gap-2 mb-3">
                {['todos', ...nomes, 'sem'].map(n => (
                  <button key={n} type="button" onClick={() => setResp(n)} className={chip(resp === n)}>
                    {n === 'todos' ? 'Todos' : n === 'sem' ? 'Sem região (investidores, geral)' : n.split(' ')[0]}
                  </button>
                ))}
              </div>
            )
          })()}
          <div className="space-y-2 max-h-[500px] overflow-y-auto">
            {(alertas?.alertas ?? []).filter(a => resp === 'todos' || (resp === 'sem' ? !a.responsavel : a.responsavel === resp)).map((a, i) => (
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
                  {a.responsavel && <span className="text-xs opacity-60 shrink-0" title={`Responsável da região ${a.regiao}`}>· {a.responsavel.split(' ')[0]}</span>}
                </div>
              </div>
            ))}
            {alertas?.alertas?.length === 0 && (
              <p className="text-center text-ink-muted text-sm py-8">Sem alertas ativos</p>
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
                <h2 className="text-sm font-semibold text-ink ">
                  Investidores movidos para Inactivo (últimos 7 dias)
                </h2>
                <span className="text-xs num px-2 py-0.5 rounded-full bg-surface-muted text-ink-muted font-medium">{inactivos.length}</span>
              </div>
              <p className="text-caption text-ink-muted  mb-3">A cron diária passa Follow Ups parados &gt; 90 dias para Inactivo automaticamente. Revê e reativa se for caso.</p>
              <div className="space-y-1.5 max-h-[400px] overflow-y-auto">
                {inactivos.map((a, i) => (
                  <div key={i} className="flex items-center justify-between gap-3 px-3 py-2 rounded-lg border border-line hover:bg-surface">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-ink truncate">{a.entidade}</p>
                      <p className="text-xs text-ink-muted truncate">{a.mensagem}</p>
                    </div>
                    <a href={`/crm?tab=Investidores&detail=${a.id}`}
                      className="text-xs px-2.5 py-1 rounded-lg border border-line bg-surface-raised text-ink hover:bg-surface shrink-0">
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
            <ScrollableTable>
              <table className="min-w-[700px] w-full text-sm">
                <thead>
                  <tr className="border-b border-line text-ink-muted text-xs uppercase tracking-wide">
                    <th className="text-left py-2 px-3">Base de Dados</th>
                    <th className="text-left py-2 px-3">Registo</th>
                    <th className="text-left py-2 px-3">Campos em Falta</th>
                  </tr>
                </thead>
                <tbody>
                  {alertas.camposEmFalta.slice(0, 50).map((item, i) => (
                    <tr key={i} className="border-b border-line hover:bg-surface">
                      <td className="py-2 px-3">
                        <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-surface-muted text-ink-muted">{item.db}</span>
                      </td>
                      <td className="py-2 px-3 font-medium text-ink">{item.nome || '(sem nome)'}</td>
                      <td className="py-2 px-3">
                        <div className="flex flex-wrap gap-1">
                          {item.campos.map(c => (
                            <span key={c} className="px-2 py-0.5 rounded-full text-xs bg-warning/10 text-warning">{c}</span>
                          ))}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </ScrollableTable>
          </Card>
        )}

        {/* Data Health */}
        <Card padding="md">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Database className="w-4 h-4 text-ink-muted" strokeWidth={1.75} />
              <h2 className="text-sm font-semibold text-ink ">Higiene de Dados</h2>
            </div>
            {health?.scoreGlobal != null && (
              <span className={`text-lg num font-bold ${HEALTH_COLOR(health.scoreGlobal)}`}>
                {PCT(health.scoreGlobal)} global
              </span>
            )}
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6">
            {Object.entries(dbs).map(([dbName, db]) => (
              <div key={dbName}>
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-sm font-semibold text-ink capitalize">{dbName}</h3>
                  <span className="text-xs text-ink-muted">{db.total} registos</span>
                </div>
                <div className="space-y-1.5">
                  {Object.entries(db.campos).map(([campo, pct]) => (
                    <div key={campo} className="flex items-center gap-3">
                      <span className="text-xs text-ink-muted w-24 sm:w-40 shrink-0 truncate">{campo}</span>
                      <div className="flex-1 h-2 bg-surface-muted rounded-full overflow-hidden">
                        <div className={`h-full rounded-full transition-[background-color,border-color,color,box-shadow,opacity,transform] ${HEALTH_BAR(pct)}`} style={{ width: `${pct}%` }} />
                      </div>
                      <span className={`text-xs num w-12 text-right ${HEALTH_COLOR(pct)}`}>{pct}%</span>
                    </div>
                  ))}
                </div>
                {db.scoreMedio != null && (
                  <p className={`text-xs mt-2 font-semibold ${HEALTH_COLOR(db.scoreMedio)}`}>
                    Score médio: {PCT(db.scoreMedio)}
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
              <Database className="w-4 h-4 text-ink-muted" strokeWidth={1.75} />
              <h2 className="text-sm font-semibold text-ink ">Backups</h2>
            </div>
            <Button size="sm" onClick={createBackup} loading={backupLoading}>
              {backupLoading ? 'A guardar...' : 'Criar backup agora'}
            </Button>
          </div>
          <p className="text-xs text-ink-muted mb-3">Backup automático diário às 03:00. Últimos 30 guardados. Cada restauro guarda o estado atual primeiro.</p>
          {backups.length > 0 ? (
            <ScrollableTable>
              <table className="min-w-[600px] w-full text-xs">
                <thead><tr className="border-b border-line text-ink-muted uppercase">
                  <th className="text-left py-2 px-3">Data</th>
                  <th className="text-right py-2 px-3">Registos</th>
                  <th className="text-right py-2 px-3">Ações</th>
                </tr></thead>
                <tbody>
                  {backups.map(b => (
                    <tr key={b.id} className="border-b border-line hover:bg-surface">
                      <td className="py-2 px-3 text-ink num">{new Date(b.created_at).toLocaleString('pt-PT')}</td>
                      <td className="py-2 px-3 text-right num">{b.total_registos}</td>
                      <td className="py-2 px-3 text-right">
                        <div className="flex gap-2 justify-end">
                          <button type="button" onClick={() => openDocument(`/api/crm/backup/${b.id}/download`, { download: true }).catch(e => console.error('[backup download]', e.message))}
                            className="text-xs text-ink hover:underline">Descarregar</button>
                          <button onClick={() => restoreBackup(b.id)} className="text-xs text-ink font-medium hover:underline">Restaurar</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </ScrollableTable>
          ) : <p className="text-xs text-ink-muted text-center py-4">Sem backups — clica em "Criar backup agora"</p>}
        </Card>

        {/* ── Histórico de Alterações ─────────── */}
        <Card padding="md">
          <Card.Header title="Histórico de Alterações (últimas 30)" subtitle="Auditoria & desfazer" icon={History} />
          {auditLog.length > 0 ? (
            <ScrollableTable>
              <table className="min-w-[600px] w-full text-xs">
                <thead><tr className="border-b border-line text-ink-muted uppercase">
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
                      <tr key={a.id} className="border-b border-line hover:bg-surface">
                        <td className="py-2 px-3 text-ink-muted num">{new Date(a.created_at).toLocaleString('pt-PT', { day:'2-digit', month:'2-digit', hour:'2-digit', minute:'2-digit' })}</td>
                        <td className="py-2 px-3"><span className="px-1.5 py-0.5 bg-surface-muted rounded text-ink-muted">{a.tabela}</span></td>
                        <td className="py-2 px-3">
                          <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${
                            a.acao === 'INSERT' ? 'bg-success/15 text-success' :
                            a.acao === 'UPDATE' ? 'bg-surface-muted text-ink' :
                            a.acao === 'DELETE' ? 'bg-danger/15 text-danger' :
                            'bg-surface-muted text-ink-muted'
                          }`}>{a.acao}</span>
                        </td>
                        <td className="py-2 px-3 text-ink-muted max-w-[200px] truncate">{nome}</td>
                        <td className="py-2 px-3 text-right">
                          {canUndo && (
                            <button onClick={() => undoAction(a.id)} className="text-xs text-ink font-medium hover:underline">Desfazer</button>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </ScrollableTable>
          ) : <p className="text-xs text-ink-muted text-center py-4">Sem alterações registadas</p>}
        </Card>
      </div>
    </>
  )
}

