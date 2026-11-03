/**
 * Aba "Avaliação" do consultor — o mesmo desenho da do investidor (subabas
 * Scorecard e Histórico). Scorecard: classe validada, validação, estado da
 * relação, pontuação e cobertura, avaliações por rever, critérios C1–C5 com a
 * nota ou "Por verificar" e as evidências aceites, métricas automáticas (com
 * o n.º de casos) e compromissos. Histórico: linha cronológica em árvore.
 * A classe só muda pela revisão pós-chamada (RevisaoAvaliacao).
 */
import { useState, useEffect, useCallback } from 'react'
import { motion } from 'framer-motion'
import { Gauge, History, ClipboardCheck, Quote, Check, X, Trash2, Loader2 } from 'lucide-react'
import { apiFetch } from '../../lib/api.js'
import { useToast } from '../ui/Toast.jsx'
import { friendlyError } from '../../lib/friendlyError.js'
import { confirmar } from '../ui/ConfirmDialog.jsx'
import { tabIndicatorTransition } from '../../lib/motion.js'
import { CRITERIOS, TIPOS_EVIDENCIA, ETAPAS, CAUSAS_PERDA } from '../../db/classificacaoConsultorCalc.js'
import { corBarra } from '../../lib/chamadasInvestidor.js'
import { RevisaoAvaliacao, ClasseBadge } from './RevisaoAvaliacao.jsx'

const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']
const fmtDia = (v) => { const s = String(v || ''); const [y, m, d] = s.slice(0, 10).split('-'); return y && m && d ? `${+d} ${MESES[+m - 1]} ${y}` : '—' }
const DESCR = {
  A: 'Contacto a cada 14 dias e reunião mensal; oportunidades analisadas em 48 h',
  B: 'Contacto mensal; oportunidades analisadas em 3 dias úteis',
  C: 'Contacto trimestral; oportunidades depois de A e B, salvo bom encaixe',
  D: 'Sem contacto proativo; oportunidades só se passarem a triagem',
  Pendente: 'Faltam critérios: completar no próximo contacto (14 dias)',
}

function Taxa({ t, sufixo = '%' }) {
  if (!t || t.valor == null) return <span className="text-ink-muted">sem casos</span>
  return t.insuficiente
    ? <span className="text-ink-muted">amostra insuficiente (n={t.n})</span>
    : <span className="text-ink font-semibold">{t.valor}{sufixo} <span className="text-ink-muted font-normal">(n={t.n})</span></span>
}

function Scorecard({ d, onRever, onReload }) {
  const toast = useToast()
  const [abertos, setAbertos] = useState({})
  const [falhando, setFalhando] = useState(null)
  const c = d.consultor
  const finais = d.ultima?.notas_finais || {}
  const classe = c.classificacao || (c.cobertura != null ? 'Pendente' : null)
  const m = d.metricas

  // Falhado pede a causa: só a causa "consultor" pesa contra ele.
  async function marcarCompromisso(id, estado, causa = null) {
    setFalhando(null)
    const r = await apiFetch(`/api/crm/compromissos/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ estado, causa }) })
    if (!r.ok) return toast('Não foi possível atualizar', 'error')
    onReload()
  }

  async function apagarDados() {
    if (!(await confirmar('Apagar, a pedido do consultor, o áudio, as transcrições e as citações de todas as gravações dele? A classe e o histórico mantêm-se. Não se pode desfazer.'))) return
    const r = await apiFetch(`/api/crm/consultores/${c.id}/apagar-dados-gravacao`, { method: 'POST' })
    if (!r.ok) return toast('Não foi possível apagar', 'error')
    toast('Dados de gravação apagados', 'success')
    onReload()
  }

  return (
    <div className="space-y-5">
      <div className="rounded-xl border border-line bg-surface-raised p-5">
        <div className="flex items-center gap-4 flex-wrap">
          <ClasseBadge classe={classe} size="lg" />
          <div className="min-w-0 flex-1">
            <p className="text-[10px] uppercase text-ink-muted tracking-wide">Classe atual</p>
            <p className="text-sm font-semibold text-ink">
              {c.pontuacao != null ? `${c.pontuacao}/100` : 'Sem pontuação'}{c.cobertura != null ? ` · cobertura ${c.cobertura}%` : ''}
            </p>
            <p className="text-xs text-ink-muted">{classe ? DESCR[classe] : 'Sem classificação: classificar na próxima discovery'}</p>
          </div>
          <div className="grid gap-1 text-xs text-right">
            <span><span className="text-ink-muted">Validação</span> <span className="font-semibold text-ink">{c.validacao || 'Por validar'}</span></span>
            <span><span className="text-ink-muted">Relação</span> <span className="font-semibold text-ink">{c.estado_avaliacao || '—'}</span></span>
            <span><span className="text-ink-muted">Estatuto</span> <span className="font-semibold text-ink">{c.estatuto || '—'}</span></span>
          </div>
        </div>
      </div>

      {d.propostas.length > 0 && (
        <div className="rounded-xl border border-warning/40 bg-warning/10 p-3 space-y-2">
          <p className="text-xs font-semibold text-ink">Avaliações por rever ({d.propostas.length})</p>
          {d.propostas.map(p => (
            <div key={p.id} className="flex items-center gap-2 text-xs">
              <ClasseBadge classe={p.classe_calculada} />
              <span className="flex-1 text-ink">{ETAPAS[p.motivo] || p.motivo} · {fmtDia(p.data_chamada || p.created_at)}</span>
              <button type="button" onClick={() => onRever(p.id)}
                className="flex items-center gap-1.5 px-2.5 py-1 font-semibold rounded-lg bg-ink text-surface hover:opacity-90">
                <ClipboardCheck className="w-3.5 h-3.5" /> Rever
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="space-y-2">
        <h4 className="text-sm font-semibold text-ink">Critérios</h4>
        {CRITERIOS.map(cr => {
          const nota = finais[cr.chave]?.nota ?? null
          const peso = d.parametros?.valores?.pesos?.[cr.chave]
          const ev = d.evidencias.filter(e => e.criterio === cr.chave)
          const pct = nota != null ? (nota - 1) / 4 * 100 : null
          return (
            <div key={cr.chave} className="rounded-xl border border-line bg-surface-raised p-3">
              <button type="button" onClick={() => setAbertos(a => ({ ...a, [cr.chave]: !a[cr.chave] }))} className="w-full text-left">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm text-ink"><span className="text-ink-muted font-semibold mr-1.5">{cr.chave}</span>{cr.label} <span className="text-[11px] text-ink-muted">· {peso}%</span></p>
                  {nota != null ? <span className="text-sm font-black text-ink num">{nota}/5</span> : <span className="text-xs font-semibold text-warning">Por verificar</span>}
                </div>
                <div className="h-1.5 rounded-full bg-line overflow-hidden mt-2"><div className={`h-full ${corBarra(pct)}`} style={{ width: `${pct ?? 0}%` }} /></div>
                <p className="text-[11px] text-ink-muted mt-1">{ev.length} evidência(s) aceite(s){finais[cr.chave]?.motivo ? ` · ajuste: ${finais[cr.chave].motivo}` : ''}</p>
              </button>
              {abertos[cr.chave] && (
                <div className="mt-2 space-y-1.5">
                  <p className="text-[11px] text-ink-muted"><span className="font-semibold">Mede:</span> {cr.mede} <span className="font-semibold">Não mede:</span> {cr.naoMede}</p>
                  {ev.map(e => (
                    <p key={e.id} className="text-xs text-ink-muted flex gap-1.5"><Quote className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                      <span>“{e.citacao}” <span className="text-[10px] font-semibold">· {TIPOS_EVIDENCIA[e.tipo]}</span></span></p>
                  ))}
                </div>
              )}
            </div>
          )
        })}
      </div>

      <div className="rounded-xl border border-line bg-surface-raised p-4">
        <h4 className="text-sm font-semibold text-ink mb-2">Métricas da plataforma</h4>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1.5 text-xs">
          <p className="flex justify-between gap-2"><span className="text-ink-muted">Oportunidades enviadas</span><span className="font-semibold text-ink num">{m.oportunidades_enviadas}</span></p>
          <p className="flex justify-between gap-2"><span className="text-ink-muted">Qualificadas (90 dias / 12 meses)</span><span className="font-semibold text-ink num">{m.qualificadas_90d} / {m.qualificadas_12m}</span></p>
          <p className="flex justify-between gap-2"><span className="text-ink-muted">Adequação</span><Taxa t={m.adequacao} /></p>
          <p className="flex justify-between gap-2"><span className="text-ink-muted">Cumprimento de compromissos</span><Taxa t={m.compromissos.cumprimento} /></p>
          <p className="flex justify-between gap-2"><span className="text-ink-muted">Progressão (análise → visita → proposta → negócio)</span>
            <span className="font-semibold text-ink num">{m.progressao.analise} → {m.progressao.visita} → {m.progressao.proposta} → {m.progressao.negocio}</span></p>
          <p className="flex justify-between gap-2"><span className="text-ink-muted">Negócios e lucro</span><span className="font-semibold text-ink num">{m.negocios.n} · {Math.round(m.negocios.lucro).toLocaleString('pt-PT')} €</span></p>
        </div>
      </div>

      {d.compromissos.length > 0 && (
        <div className="rounded-xl border border-line bg-surface-raised p-4 space-y-1.5">
          <h4 className="text-sm font-semibold text-ink">Compromissos</h4>
          {d.compromissos.map(cp => (
            <div key={cp.id} className="flex items-center gap-2 text-xs">
              <span className="text-ink-muted w-20 shrink-0">{cp.quem === 'somnium' ? 'Somnium' : 'Consultor'}</span>
              <span className="flex-1 text-ink">{cp.descricao}</span>
              <span className="text-ink-muted num">{cp.data_limite ? fmtDia(cp.data_limite) : 'sem data'}</span>
              {cp.estado === 'pendente' ? (
                falhando === cp.id ? (
                  <select autoFocus defaultValue="" aria-label="Causa da falha" onChange={e => e.target.value && marcarCompromisso(cp.id, 'falhado', e.target.value)}
                    onBlur={() => setFalhando(null)} className="text-xs rounded-lg border border-line bg-surface px-1.5 py-1">
                    <option value="" disabled>Causa da falha…</option>
                    {Object.entries(CAUSAS_PERDA).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                ) : (
                  <span className="flex gap-1">
                    <button type="button" title="Cumprido" onClick={() => marcarCompromisso(cp.id, 'cumprido')} className="p-1 rounded text-success hover:bg-success/10"><Check className="w-3.5 h-3.5" /></button>
                    <button type="button" title="Falhado" onClick={() => setFalhando(cp.id)} className="p-1 rounded text-danger hover:bg-danger/10"><X className="w-3.5 h-3.5" /></button>
                  </span>
                )
              ) : <span className={cp.estado === 'cumprido' ? 'text-success' : 'text-danger'}>{cp.estado}{cp.causa && cp.causa !== 'consultor' ? ` (${CAUSAS_PERDA[cp.causa]})` : ''}</span>}
            </div>
          ))}
        </div>
      )}

      <div className="text-right">
        <button type="button" onClick={apagarDados} className="inline-flex items-center gap-1.5 text-xs text-ink-muted hover:text-danger">
          <Trash2 className="w-3.5 h-3.5" /> Apagar dados de gravação a pedido do consultor
        </button>
      </div>
    </div>
  )
}

function Historico({ historico }) {
  if (!historico.length) return <p className="text-sm text-ink-muted text-center py-8">Sem histórico de classificação</p>
  return (
    // Linha cronológica em árvore: eixo ao centro (à esquerda no telemóvel), mais recente em cima.
    <ol className="relative grid gap-2.5 py-1 before:absolute before:top-0 before:bottom-0 before:w-0.5 before:rounded before:bg-line before:left-[17px] sm:before:left-1/2 sm:before:-translate-x-1/2">
      {historico.map((h, i) => <RegistoHistorico key={h.id} h={h} dir={i % 2 === 0} />)}
    </ol>
  )
}

function RegistoHistorico({ h, dir }) {
  const [aberto, setAberto] = useState(false)
  return (
    <li className="relative grid grid-cols-[36px_1fr] sm:grid-cols-[1fr_44px_1fr] gap-x-3 sm:gap-x-0 items-start">
      <span className="col-start-1 row-start-1 row-span-2 sm:row-span-1 sm:col-start-2 justify-self-center z-10 w-9 h-9 rounded-full border-2 border-line bg-surface-raised grid place-items-center text-xs font-black text-ink">
        {h.classificacao_nova === 'Pendente' ? '·' : h.classificacao_nova}
      </span>
      <div className={`col-start-2 row-start-1 pt-0.5 sm:pt-1.5 tabular-nums leading-tight ${dir ? 'sm:col-start-1 sm:text-right sm:pr-3' : 'sm:col-start-3 sm:pl-3'}`}>
        <span className="text-sm font-bold text-ink">{fmtDia(h.created_at)}</span>
      </div>
      <div className={`col-start-2 row-start-2 sm:row-start-1 min-w-0 pb-1 ${dir ? 'sm:col-start-3 sm:pl-3' : 'sm:col-start-1 sm:pr-3'}`}>
        <button type="button" onClick={() => setAberto(v => !v)} aria-expanded={aberto}
          className={`w-full rounded-lg border border-line bg-surface-raised px-3 py-2 hover:shadow-sm text-left ${dir ? '' : 'sm:text-right'}`}>
          <span className="block text-sm font-semibold text-ink">
            {h.classificacao_anterior ? `${h.classificacao_anterior} → ${h.classificacao_nova}` : `Classe ${h.classificacao_nova}`}
          </span>
        </button>
        {aberto && (
          <div className="rounded-lg bg-surface px-3 py-2 text-xs text-ink-muted mt-1 text-left space-y-0.5">
            <p>{h.motivo}</p>
            {h.pontuacao_nova != null && <p>Pontuação {h.pontuacao_anterior ?? 0} → {h.pontuacao_nova}</p>}
            {h.autor && <p>{h.autor}</p>}
          </div>
        )}
      </div>
    </li>
  )
}

export function AvaliacaoConsultor({ consultorId, onUpdate }) {
  const [sub, setSub] = useState('scorecard')
  const [d, setD] = useState(null)
  const [erro, setErro] = useState('')
  const [rever, setRever] = useState(null)

  const load = useCallback(async () => {
    try {
      const r = await apiFetch(`/api/crm/consultores/${consultorId}/avaliacao`)
      const j = await r.json()
      if (!r.ok) throw new Error(j.error || 'Erro ao carregar')
      setD(j); setErro('')
    } catch (e) { setErro(friendlyError(e.message)) }
  }, [consultorId])
  useEffect(() => { load() }, [load])

  return (
    <div>
      <div className="flex border-b border-line px-4 sm:px-6 pt-3 bg-surface" role="tablist">
        {[
          { key: 'scorecard', label: 'Scorecard', icon: Gauge },
          { key: 'historico', label: 'Histórico', icon: History },
        ].map(s => (
          <button key={s.key} onClick={() => setSub(s.key)}
            role="tab" aria-selected={sub === s.key}
            className={`relative px-4 py-2 text-ui font-medium transition-colors duration-fast whitespace-nowrap ${sub === s.key ? 'text-ink' : 'text-ink-muted hover:text-ink'}`}>
            <s.icon className="w-4 h-4 mr-1.5 inline-block align-[-3px]" />{s.label}
            {sub === s.key && <motion.span layoutId="avaliacao-consultor-sub" transition={tabIndicatorTransition} className="absolute bottom-0 left-0 right-0 h-0.5 bg-accent" />}
          </button>
        ))}
      </div>
      <div className="p-4 sm:p-6">
        {erro && <p className="text-sm text-danger">{erro}</p>}
        {!d && !erro && <div className="text-center text-ink-muted py-8"><Loader2 className="w-5 h-5 animate-spin inline" /></div>}
        {d && (sub === 'scorecard'
          ? <Scorecard d={d} onRever={setRever} onReload={() => { load(); onUpdate?.() }} />
          : <Historico historico={d.historico} />)}
      </div>
      {rever && <RevisaoAvaliacao avaliacaoId={rever} onClose={() => setRever(null)} onDone={() => { load(); onUpdate?.() }} />}
    </div>
  )
}
