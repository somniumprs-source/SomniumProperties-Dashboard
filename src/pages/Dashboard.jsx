import { useState, useEffect, useCallback, useRef } from 'react'
import { BookOpen, Construction, Megaphone, Handshake, Wallet } from 'lucide-react'
import { Header } from '../components/layout/Header.jsx'
import { ErrorState } from '../components/ui/ErrorState.jsx'
import { ComercialDashboard } from '../components/dashboard/ComercialDashboard.jsx'
import { FinanceiroDashboard } from '../components/dashboard/FinanceiroDashboard.jsx'
import { ObrasDashboard } from '../components/dashboard/ObrasDashboard.jsx'
import { Glossario } from '../components/dashboard/Glossario.jsx'
import { FichaProvider } from '../components/dashboard/Indicador.jsx'
import { PeriodSelector } from '../components/dashboard/PeriodSelector.jsx'
import { useKPIs } from '../hooks/useKPIs.js'
import { KPISkeleton } from '../components/ui/Skeleton.jsx'
import { KpiCard } from '../components/ui/KpiCard.jsx'
import { apiFetch } from '../lib/api.js'
import { EUR } from '../constants.js'
import { CATALOGO } from '../lib/catalogoMetricas.js'
import { RegiaoToggle } from '../components/RegiaoBadge.jsx'

// As abas têm os mesmos nomes dos departamentos no menu (navConfig.js).
const DEPT_TABS = [
  { key: 'comercial',  label: 'Departamento Comercial',    icon: Handshake,    tone: 'gold' },
  { key: 'obras',      label: 'Departamento de Obras',     icon: Construction, tone: 'amber' },
  { key: 'financeiro', label: 'Departamento Financeiro',   icon: Wallet,       tone: 'green' },
  { key: 'marketing',  label: 'Departamento de Marketing', icon: Megaphone,    tone: 'gray' },
]

const REFRESH_INTERVAL_MS = 30_000

const REGIAO_STORAGE_KEY = 'somnium.regiao.dashboard'
function readRegiaoFromStorage() {
  try {
    const r = sessionStorage.getItem(REGIAO_STORAGE_KEY)
    return r === 'Coimbra' || r === 'AMP' ? r : null
  } catch { return null }
}

const hora = (t) => (t ? new Date(t).toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit' }) : null)

// Lê um bloco e guarda a resposta; `pedidos` impede uma resposta antiga de
// sobrepor um filtro mais recente. A hora só avança quando a leitura corre bem.
async function lerBloco(pedidos, chave, url, opcoes, setDados, setEstado) {
  const pedido = (pedidos.current[chave] = (pedidos.current[chave] || 0) + 1)
  try {
    const r = await apiFetch(url, opcoes)
    const j = r.ok ? await r.json() : null
    if (pedido !== pedidos.current[chave]) return
    if (!j || j.error) throw new Error(j?.error || `HTTP ${r.status}`)
    setDados(j)
    setEstado(e => ({ ...e, [chave]: { em: Date.now(), erro: false } }))
  } catch {
    if (pedido === pedidos.current[chave]) setEstado(e => ({ ...e, [chave]: { ...e[chave], erro: true } }))
  }
}

const NOMES_BLOCO = { dash: 'Comercial e Financeiro', analises: 'Análises de rentabilidade', pulse: 'alertas' }

export function Dashboard() {
  const [dept, setDept] = useState('comercial')
  const [periodo, setPeriodo] = useState('mes')
  const [dashData, setDashData] = useState(null)
  const [regiao, setRegiaoState] = useState(() => readRegiaoFromStorage())
  const setRegiao = (r) => {
    setRegiaoState(r)
    try {
      if (r) sessionStorage.setItem(REGIAO_STORAGE_KEY, r)
      else sessionStorage.removeItem(REGIAO_STORAGE_KEY)
    } catch {}
  }
  const { kpis, loading, error, refresh: refreshKpis } = useKPIs(regiao)
  const [pulse, setPulse] = useState(null)
  const [analises, setAnalises] = useState(null)
  const [blocos, setBlocos] = useState({})
  const inFlightRef = useRef(false)
  const pedidosRef = useRef({})

  const lerDash = useCallback((fresco) => lerBloco(pedidosRef, 'dash',
    `/api/comercial/dashboard?periodo=${periodo}${fresco ? `&_t=${Date.now()}` : ''}`, { regiao }, setDashData, setBlocos), [periodo, regiao])
  const lerSecundarios = useCallback(() => Promise.all([
    lerBloco(pedidosRef, 'pulse', '/api/weekly-pulse', { regiao }, setPulse, setBlocos),
    lerBloco(pedidosRef, 'analises', '/api/crm/analises-kpis', {}, setAnalises, setBlocos),
  ]), [regiao])

  const refreshAll = useCallback(async (fresco = false) => {
    if (inFlightRef.current) return
    inFlightRef.current = true
    try {
      await Promise.all([refreshKpis(), lerSecundarios(), lerDash(fresco)])
    } finally {
      inFlightRef.current = false
    }
  }, [refreshKpis, lerSecundarios, lerDash])

  // Clique manual no botão "Atualizar": re-sincroniza os campos derivados
  // (ROI, ROI anualizado, VVR, custo de obra) das análises activas para os
  // imóveis no servidor e só depois recarrega, sem usar a cache do servidor.
  // O polling/visibilidade continuam a usar refreshAll (sem sync) para não
  // escrever na BD a cada ciclo.
  const refreshManual = useCallback(async () => {
    try {
      await apiFetch('/api/crm/sync-derivados', { method: 'POST' })
    } catch { /* se o sync falhar, recarrega na mesma os dados */ }
    await refreshAll(true)
  }, [refreshAll])

  useEffect(() => { lerSecundarios() }, [lerSecundarios])
  useEffect(() => { lerDash() }, [lerDash])

  // Polling, visibilidade do tab e evento global de mutacao.
  // (Removido window.focus: duplicava visibilitychange e gerava spike ao voltar a tab.)
  useEffect(() => {
    const atualizar = () => refreshAll()
    const interval = setInterval(() => { if (!document.hidden) atualizar() }, REFRESH_INTERVAL_MS)
    const onVisible = () => { if (!document.hidden) atualizar() }
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('somnium:refresh', atualizar)
    return () => {
      clearInterval(interval)
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('somnium:refresh', atualizar)
    }
  }, [refreshAll])

  const finKpis = kpis?.financeiro
  const comKpis = kpis?.comercial
  const blocosComErro = Object.keys(NOMES_BLOCO).filter(k => blocos[k]?.erro)

  // A hora apresentada é a da leitura bem-sucedida mais antiga.
  const leituras = [kpis?.updatedAt && new Date(kpis.updatedAt).getTime(), blocos.dash?.em, blocos.pulse?.em, blocos.analises?.em].filter(Boolean)
  const updatedAt = leituras.length ? hora(Math.min(...leituras)) : null

  // Número de cabeçalho de cada card de departamento (valor grande + caption).
  const deptMeta = {
    comercial:  { value: dashData?.funil?.atividade?.adicionados?.valor ?? '—', sub: 'Imóveis adicionados' },
    obras:      { value: dashData?.obras?.negociosAtivos ?? '—', sub: 'Negócios ativos' },
    financeiro: { value: finKpis ? EUR(finKpis.lucroRealTotal) : '—', sub: 'Faturação real' },
    marketing:  { value: '—', sub: 'Em espera' },
  }

  return (
    <FichaProvider>
      <Header
        title="Dashboard"
        subtitle={updatedAt ? `Última leitura completa: ${updatedAt}` : 'A carregar dados...'}
        onRefresh={refreshManual}
        loading={loading}
        regiao={<RegiaoToggle value={regiao} onChange={setRegiao} />}
      />
      <div className="p-4 sm:p-6 flex flex-col gap-4 sm:gap-6">
        {error && (
          <ErrorState compact title="Não foi possível carregar os indicadores" error={error} onRetry={refreshManual} />
        )}
        {blocosComErro.length > 0 && (
          <p role="alert" className="rounded-lg border border-danger/40 bg-danger/10 px-4 py-2 text-sm text-ink">
            Sem leitura de {blocosComErro.map(k => NOMES_BLOCO[k]).join(', ')}. Os valores visíveis podem estar desatualizados.
          </p>
        )}

        {/* Skeleton inicial — só aparece no primeiro boot. Em refresh subsequente
            os números antigos ficam visíveis sem flash. */}
        {loading && !error && !dashData && !kpis && <KPISkeleton count={8} />}

        {/* Alertas transversais: contagens reais, sem pontuação nem metas por aprovar */}
        {pulse && (pulse.alertas.imoveisParados > 0 || pulse.alertas.investSemContacto > 0 || pulse.alertas.consFollowUpAtrasado > 0) && (
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-xl border border-line bg-surface-raised px-4 sm:px-5 py-3 shadow-xs text-caption">
            {pulse.alertas.imoveisParados > 0 && <span className="text-danger">{pulse.alertas.imoveisParados} imóveis parados</span>}
            {pulse.alertas.investSemContacto > 0 && <span className="text-warning">{pulse.alertas.investSemContacto} investidores sem contacto</span>}
            {pulse.alertas.consFollowUpAtrasado > 0 && <span className="text-warning">{pulse.alertas.consFollowUpAtrasado} follow-ups atrasados</span>}
          </div>
        )}

        {/* Seletor de departamento + seletor de período global */}
        <div className="flex flex-col gap-3">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {DEPT_TABS.map((t) => (
              <KpiCard
                key={t.key}
                icon={t.icon}
                label={t.label}
                value={deptMeta[t.key]?.value}
                sub={deptMeta[t.key]?.sub}
                tone={t.tone}
                size="md"
                active={dept === t.key}
                rotuloCompleto
                onClick={() => setDept(t.key)}
              />
            ))}
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <button
              type="button"
              aria-pressed={dept === 'glossario'}
              onClick={() => setDept('glossario')}
              className={`inline-flex items-center gap-2 rounded-lg border px-3 py-1.5 text-sm font-medium focus:outline-none focus-visible:ring-2 focus-visible:ring-accent ${dept === 'glossario' ? 'border-accent ring-1 ring-accent text-ink' : 'border-line text-ink-muted hover:text-ink'}`}>
              <BookOpen className="w-4 h-4" aria-hidden="true" />
              Glossário ({CATALOGO.length})
            </button>
            {(dept === 'comercial' || dept === 'financeiro') && (
              <div className="flex items-center gap-3">
                {dashData?.intervalo && (
                  <span className="text-[11px] text-ink-muted hidden sm:inline">{dashData.intervalo.de} a {dashData.intervalo.ate}</span>
                )}
                <PeriodSelector value={periodo} onChange={setPeriodo} />
              </div>
            )}
          </div>
        </div>

        {/* Conteúdo por departamento */}
        {dept === 'comercial' && <ComercialDashboard data={dashData} comKpis={comKpis} />}
        {dept === 'obras' && <ObrasDashboard data={dashData} />}
        {dept === 'financeiro' && <FinanceiroDashboard data={dashData} finKpis={finKpis} analises={analises} />}
        {dept === 'glossario' && <Glossario />}

        {dept === 'marketing' && (
          <div className="flex flex-col items-center justify-center text-center py-16 rounded-2xl border border-dashed border-line  bg-surface-raised ">
            <div className="w-12 h-12 rounded-2xl flex items-center justify-center mb-3 bg-surface-muted">
              <Megaphone className="w-6 h-6 text-ink-muted" />
            </div>
            <p className="text-sm font-semibold text-ink ">Departamento de Marketing em espera</p>
            <p className="text-xs text-ink-muted mt-1 max-w-sm">Por decisão de 3 de novembro, não há indicadores ativos. As origens dos contactos continuam a ser guardadas.</p>
          </div>
        )}
      </div>
    </FichaProvider>
  )
}
