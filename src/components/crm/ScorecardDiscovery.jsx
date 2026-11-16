/**
 * Scorecard da discovery call (SOP 23 v2.1, secções 4.10 e 4.11) na ficha do
 * investidor. 6 critérios de 0 a 2: a app preenche-os automaticamente a partir
 * da análise da discovery gravada (com a evidência) e o campo manual existe
 * sempre. Total de 0 a 12 e classe pela função única
 * (supabase/functions/_shared/classeInvestidor.js). A classe proposta põe o
 * investidor em Pendente de Aprovação; fica definitiva quando o outro CEO
 * (nunca quem propôs) a valida, em 24 horas.
 */
import { useState, useEffect, useCallback, useMemo } from 'react'
import { Sparkles, ShieldCheck, AlertTriangle, Clock } from 'lucide-react'
import { apiFetch } from '../../lib/api.js'
import { useToast } from '../ui/Toast.jsx'
import { useAuth } from '../../contexts/AuthContext.jsx'
import {
  CRITERIOS_DISCOVERY, CLASSES, DIAS_FOLLOW_UP_C, STATUS_APOS_VALIDACAO, AVISO_LEGADO, PONTUACAO_MAX_DISCOVERY, calcularClasseDiscovery,
} from '../../../supabase/functions/_shared/classeInvestidor.js'

const fmtData = (v) => (v ? new Date(v).toLocaleString('pt-PT', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—')
const CLASSE_COR = { A: 'bg-success/15 text-success', B: 'bg-accent/15 text-accent-ink', C: 'bg-warning/15 text-warning', D: 'bg-danger/15 text-danger' }

export function AvisoLegado({ origem }) {
  if (origem !== 'legado') return null
  return (
    <div className="flex items-start gap-2 rounded-lg border border-warning/40 bg-warning/10 px-3 py-2 text-xs text-ink">
      <AlertTriangle className="w-4 h-4 text-warning shrink-0 mt-px" />
      <span>{AVISO_LEGADO}</span>
    </div>
  )
}

function ClassePill({ classe }) {
  if (!classe) return <span className="text-xs text-ink-muted">Sem classe</span>
  return <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${CLASSE_COR[classe]}`}>{classe} · {CLASSES[classe].label}</span>
}

export function ScorecardDiscovery({ investidorId, onUpdate }) {
  const toast = useToast()
  const { profile } = useAuth() || {}
  const [d, setD] = useState(null)
  const [notas, setNotas] = useState({})
  const [observacoes, setObservacoes] = useState('')
  const [busy, setBusy] = useState(false)
  const [val, setVal] = useState({ classe: '', motivo: '', follow_up_dias: '', motivo_inactivo: '' })
  const [alerta, setAlerta] = useState(null)

  const carregar = useCallback(async () => {
    const r = await apiFetch(`/api/crm/investidores/${investidorId}/classificacao`)
    const j = await r.json().catch(() => ({}))
    if (!r.ok) { toast(j.error || 'Não foi possível carregar a classificação', 'error'); return }
    setD(j)
    setNotas(Object.fromEntries(CRITERIOS_DISCOVERY.map(c => [c.chave, j.scorecard?.[c.chave]?.nota ?? null])))
    setObservacoes(j.scorecard?.observacoes || '')
    setVal({ classe: j.proposta || '', motivo: '', follow_up_dias: '', motivo_inactivo: '' })
  }, [investidorId, toast])
  useEffect(() => { carregar() }, [carregar])

  const calc = useMemo(() => { try { return calcularClasseDiscovery(notas) } catch { return null } }, [notas])

  if (!d) return <div className="text-sm text-ink-muted">A carregar…</div>

  const emValidacao = d.classificacao_estado === 'proposta'
  const souCEO = !!profile?.nome && d.ceos.includes(profile.nome) && (!profile.role || profile.role === 'admin')
  const souProponente = !!profile?.nome && profile.nome === d.proposta_por
  const outroCEO = d.ceos.filter(n => n !== d.proposta_por)
  const classeVal = val.classe || d.proposta
  const altera = emValidacao && classeVal !== d.proposta

  async function guardar() {
    setBusy(true)
    const r = await apiFetch(`/api/crm/investidores/${investidorId}/scorecard-discovery`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ notas, observacoes }),
    })
    const j = await r.json().catch(() => ({}))
    setBusy(false)
    if (!r.ok) return toast(j.error || 'Erro ao guardar', 'error')
    toast(j.completo ? `Classe ${j.classe_proposta} proposta (${j.total}/12). Investidor em Pendente de Aprovação.` : `Scorecard guardado. Faltam ${j.em_falta.length} critério(s) para haver classe.`, 'success')
    await carregar(); onUpdate?.()
  }

  async function validar() {
    setBusy(true)
    const r = await apiFetch(`/api/crm/investidores/${investidorId}/validar-classificacao`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ classe: classeVal, motivo: val.motivo, follow_up_dias: val.follow_up_dias ? Number(val.follow_up_dias) : null, motivo_inactivo: val.motivo_inactivo }),
    })
    const j = await r.json().catch(() => ({}))
    setBusy(false)
    if (!r.ok) return toast(j.error || 'Erro ao validar', 'error')
    toast(`Classe ${j.classe} definitiva. Status: ${j.status}.`, 'success')
    setAlerta(j.alerta_apresentacao || null)
    await carregar(); onUpdate?.()
  }

  return (
    <div className="space-y-5">
      {!d.migracao_aplicada && (
        <div className="rounded-lg border border-danger/40 bg-danger/10 px-3 py-2 text-xs text-ink">
          A migração 0104 (classificação SOP 23) ainda não foi aplicada na base de dados. O scorecard fica disponível depois de aplicada.
        </div>
      )}
      <AvisoLegado origem={d.classificacao_origem} />

      {(alerta || d.desmarcar_apresentacao) && (
        <div className="flex items-start gap-2 rounded-lg border border-danger/40 bg-danger/10 px-3 py-2 text-xs text-ink">
          <AlertTriangle className="w-4 h-4 text-danger shrink-0 mt-px" />
          <div>
            <p className="font-semibold">Desmarcar a apresentação (SOP 23, 4.11)</p>
            <p>
              Classe {d.classificacao}: este investidor não pode ser apresentado. {d.proposta_por || 'Quem conduziu a discovery'} tem de desmarcar
              {d.data_apresentacao_negocio ? ` a apresentação de ${d.data_apresentacao_negocio}` : ' a apresentação'}
              {d.tarefas_apresentacao?.length ? ` e fechar a tarefa "${d.tarefas_apresentacao[0].tarefa}"` : ''}.
            </p>
          </div>
        </div>
      )}

      {/* Estado actual */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="rounded-lg border border-line bg-surface-raised p-3">
          <p className="text-[11px] text-ink-muted">Classe definitiva</p>
          <div className="mt-1"><ClassePill classe={d.classificacao} /></div>
          <p className="text-[11px] text-ink-muted mt-1">
            {d.classificacao_origem === 'discovery' ? `Validada por ${d.validada_por || '—'} em ${fmtData(d.validada_em)}`
              : d.classificacao_origem === 'legado' ? `Legado (pontuação antiga ${d.pontuacao_antiga ?? 0}/100)` : '—'}
          </p>
        </div>
        <div className={`rounded-lg border p-3 ${d.atrasada ? 'border-danger/50 bg-danger/5' : 'border-line bg-surface-raised'}`}>
          <p className="text-[11px] text-ink-muted">Classe proposta</p>
          <div className="mt-1">{emValidacao ? <ClassePill classe={d.proposta} /> : <span className="text-xs text-ink-muted">Nenhuma por validar</span>}</div>
          {emValidacao && (
            <p className={`text-[11px] mt-1 ${d.atrasada ? 'text-danger font-semibold' : 'text-ink-muted'}`}>
              {d.atrasada && <Clock className="w-3 h-3 inline-block mr-1 align-[-1px]" />}
              {d.pontuacao_discovery}/12 · {d.proposta_origem === 'ia' ? 'pela análise da call' : 'à mão'} · proposta por {d.proposta_por || 'IA'} em {fmtData(d.proposta_em)}
              {d.atrasada ? ` · por validar há mais de ${d.prazo_horas} h` : ''}
            </p>
          )}
        </div>
        <div className="rounded-lg border border-line bg-surface-raised p-3">
          <p className="text-[11px] text-ink-muted">Status</p>
          <p className="text-sm font-medium text-ink mt-1">{d.status}</p>
          {d.apresentacao_marcada && <p className="text-[11px] text-ink-muted mt-1">Apresentação de negócio marcada</p>}
        </div>
      </div>

      {/* Validação pelo outro CEO */}
      {emValidacao && (
        <div className={`rounded-xl border p-4 space-y-3 ${d.atrasada ? 'border-danger/50' : 'border-line'} bg-surface-raised`}>
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-accent-ink" />
            <h3 className="text-sm font-bold text-ink">Validação pelo outro CEO</h3>
          </div>
          <p className="text-xs text-ink-muted">
            Proposta por <strong className="text-ink">{d.proposta_por || 'IA'}</strong>. Valida: {outroCEO.join(' ou ') || '—'}, em {d.prazo_horas} horas.
          </p>
          {!souCEO ? (
            <p className="text-[11px] text-ink-muted">Só {d.ceos.join(' ou ')} podem validar.</p>
          ) : souProponente ? (
            <p className="text-[11px] text-ink-muted">Foste tu que propuseste esta classe: a validação tem de ser feita por {outroCEO.join(' ou ')}.</p>
          ) : (
            <div className="space-y-2">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs text-ink-muted">Classe:</span>
                {Object.keys(CLASSES).map(k => (
                  <button key={k} type="button" onClick={() => setVal(v => ({ ...v, classe: k }))}
                    className={`px-2.5 py-1 rounded-md text-xs font-semibold border ${classeVal === k ? 'bg-accent text-accent-foreground border-accent' : 'bg-surface border-line text-ink-muted'}`}>{k}</button>
                ))}
                <span className="text-[11px] text-ink-muted">Depois: {STATUS_APOS_VALIDACAO[classeVal]}</span>
              </div>
              {altera && (
                <input value={val.motivo} onChange={e => setVal(v => ({ ...v, motivo: e.target.value }))} placeholder="Motivo da alteração (obrigatório)"
                  className="w-full rounded-lg border border-line bg-surface px-3 py-1.5 text-sm text-ink" />
              )}
              {classeVal === 'C' && (
                <div className="flex items-center gap-2 text-xs text-ink-muted">Follow-up a
                  {DIAS_FOLLOW_UP_C.map(n => (
                    <button key={n} type="button" onClick={() => setVal(v => ({ ...v, follow_up_dias: String(n) }))}
                      className={`px-2 py-1 rounded-md border ${val.follow_up_dias === String(n) ? 'bg-accent text-accent-foreground border-accent' : 'bg-surface border-line'}`}>{n} dias</button>
                  ))}
                </div>
              )}
              {classeVal === 'D' && (
                <input value={val.motivo_inactivo} onChange={e => setVal(v => ({ ...v, motivo_inactivo: e.target.value }))} placeholder="Motivo para Inactivo (obrigatório)"
                  className="w-full rounded-lg border border-line bg-surface px-3 py-1.5 text-sm text-ink" />
              )}
              {['C', 'D'].includes(classeVal) && d.apresentacao_marcada && (
                <p className="text-[11px] text-danger">Há uma apresentação de negócio marcada: ao validar, fica o alerta para a desmarcar.</p>
              )}
              <button type="button" onClick={validar} disabled={busy}
                className="px-3 py-1.5 rounded-lg text-xs font-medium bg-brand-dark text-white disabled:opacity-50">
                {altera ? `Alterar para ${classeVal} e validar` : `Validar classe ${classeVal}`}
              </button>
            </div>
          )}
        </div>
      )}

      {/* Scorecard */}
      <div className="rounded-xl border border-line bg-surface-raised p-4 space-y-3">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <h3 className="text-sm font-bold text-ink">Scorecard da discovery call</h3>
            <p className="text-xs text-ink-muted">
              SOP 23, 4.10: 6 critérios de 0 a 2. {d.scorecard?.origem === 'ia' ? 'Preenchido pela análise da discovery gravada; podes corrigir qualquer nota.' : 'Preenchido pela análise da discovery gravada ou à mão.'}
            </p>
          </div>
          <div className="text-right">
            <p className="text-2xl font-semibold num text-ink">{calc?.total ?? '—'}<span className="text-sm text-ink-muted">/{PONTUACAO_MAX_DISCOVERY}</span></p>
            <p className="text-[11px] text-ink-muted">{calc?.classe ? <>Classe: <ClassePill classe={calc.classe} /></> : `Faltam ${calc?.em_falta.length ?? 6} critério(s)`}</p>
          </div>
        </div>

        <div className="space-y-2">
          {CRITERIOS_DISCOVERY.map(c => {
            const s = d.sugestoes_ia?.[c.chave]
            const gravado = d.scorecard?.[c.chave]
            const evid = gravado?.origem && gravado.origem !== 'manual' && gravado.evidencia ? gravado : null
            return (
              <div key={c.chave} className="rounded-lg border border-line p-3">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <p className="text-sm font-medium text-ink">{c.label}</p>
                  <div className="flex gap-1" role="radiogroup" aria-label={c.label}>
                    {[0, 1, 2].map(n => (
                      <button key={n} type="button" role="radio" aria-checked={notas[c.chave] === n} title={c.niveis[n]}
                        onClick={() => setNotas(x => ({ ...x, [c.chave]: x[c.chave] === n ? null : n }))}
                        className={`w-9 h-8 rounded-md text-sm font-semibold border transition ${notas[c.chave] === n ? 'bg-accent text-accent-foreground border-accent' : 'bg-surface border-line text-ink-muted hover:text-ink'}`}>
                        {n}
                      </button>
                    ))}
                  </div>
                </div>
                <p className="text-[11px] text-ink-muted mt-1">
                  {notas[c.chave] != null ? `${notas[c.chave]}: ${c.niveis[notas[c.chave]]}` : c.niveis.map((t, i) => `${i} = ${t}`).join(' · ')}
                </p>
                {evid && notas[c.chave] === gravado.nota && (
                  <p className="mt-1 text-[11px] text-ink-muted">
                    <Sparkles className="w-3 h-3 inline-block mr-1 text-accent-ink align-[-1px]" />
                    Da call: "{evid.evidencia}"{evid.minuto ? ` (min. ${evid.minuto})` : ''}
                  </p>
                )}
                {s && (
                  <div className="mt-2 flex items-start justify-between gap-2 rounded-md bg-accent/5 border border-accent/20 px-2 py-1.5">
                    <p className="text-[11px] text-ink">
                      <Sparkles className="w-3 h-3 inline-block mr-1 text-accent-ink align-[-1px]" />
                      IA sugere <strong>{s.nota}</strong>
                      {s.evidencia && <span className="text-ink-muted"> · "{s.evidencia}"{s.minuto ? ` (min. ${s.minuto})` : ''}</span>}
                    </p>
                    {notas[c.chave] !== s.nota && (
                      <button type="button" onClick={() => setNotas(x => ({ ...x, [c.chave]: s.nota }))}
                        className="text-[11px] font-medium text-accent-ink hover:underline shrink-0">Usar</button>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>

        <label className="block text-xs text-ink-muted">Observações
          <textarea value={observacoes} onChange={e => setObservacoes(e.target.value)} rows={2}
            className="mt-1 w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink" />
        </label>
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <p className="text-[11px] text-ink-muted">
            {calc?.classe ? `Ao guardar, a classe ${calc.classe} fica proposta por ti e o investidor passa a Pendente de Aprovação.` : 'Sem os 6 critérios não há classe.'}
          </p>
          <button type="button" onClick={guardar} disabled={busy || !d.migracao_aplicada}
            className="px-3 py-1.5 rounded-lg text-xs font-medium bg-accent text-accent-foreground hover:brightness-[1.04] disabled:opacity-50">
            Guardar scorecard
          </button>
        </div>
      </div>
    </div>
  )
}
