/**
 * Revisão pós-chamada da classificação do consultor. Transcrição (com quem
 * fala e o tempo) e áudio à esquerda; à direita, um cartão por critério com a
 * nota proposta pela IA, a confiança e as citações (clicáveis: saltam para o
 * ponto do áudio e da transcrição). O associado aceita, ajusta (motivo
 * obrigatório) ou rejeita cada nota; a classe resultante é calculada em tempo
 * real com o mesmo cálculo do servidor. Nada vai para a ficha sem "Validar".
 */
import { useState, useEffect, useMemo, useRef } from 'react'
import { Loader2, AlertTriangle, Check, X, Pencil, Quote, Play, ShieldAlert } from 'lucide-react'
import { Modal } from '../ui/Modal.jsx'
import { apiFetch } from '../../lib/api.js'
import { useToast } from '../ui/Toast.jsx'
import { friendlyError } from '../../lib/friendlyError.js'
import { confirmar } from '../ui/ConfirmDialog.jsx'
import { inputClass } from './RegistoManualFieldset.jsx'
import { CRITERIOS, CHAVES, TIPOS_EVIDENCIA, ETAPAS, ESTATUTOS, calcularClasse } from '../../db/classificacaoConsultorCalc.js'
import { corBarra } from '../../lib/chamadasInvestidor.js'

const mmss = (s) => (s == null ? '' : `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(Math.floor(s % 60)).padStart(2, '0')}`)
const QUEM = { associado: 'Associado', consultor: 'Consultor', outro: 'Outro' }
const CLASSE_COR = { A: 'bg-success/15 text-success', B: 'bg-surface-muted text-ink', C: 'bg-warning/15 text-warning', D: 'bg-danger/15 text-danger', Pendente: 'bg-surface-muted text-ink-muted' }
const EV_COR = { declaracao: 'bg-surface-muted text-ink-muted', exemplo: 'bg-accent/10 text-ink', observada: 'bg-success/15 text-success' }

export function ClasseBadge({ classe, size = 'md' }) {
  const cls = CLASSE_COR[classe] || CLASSE_COR.Pendente
  const dim = size === 'lg' ? 'text-2xl w-14 h-14' : 'text-sm px-2.5 py-1'
  return <span className={`inline-flex items-center justify-center rounded-lg font-black ${dim} ${cls}`}>{classe || '—'}</span>
}

function CartaoCriterio({ crit, ia, base, decisao, setDecisao, evidencias, rejeitadas, toggleEvidencia, onCitacao }) {
  const d = decisao || { decisao: 'aceite' }
  const notaFinal = d.decisao === 'ajustada' ? (d.nota === '' ? null : Number(d.nota)) : d.decisao === 'rejeitada' ? null : ia?.nota ?? null
  const pct = notaFinal != null ? (notaFinal - 1) / 4 * 100 : null
  return (
    <div className="rounded-xl border border-line bg-surface-raised p-3 space-y-2">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-ink-muted">{crit.chave}</p>
          <p className="text-sm font-semibold text-ink">{crit.label}</p>
        </div>
        <div className="text-right shrink-0">
          {ia?.nota != null
            ? <span className="text-lg font-black text-ink num">{ia.nota}<span className="text-xs text-ink-muted font-medium">/5</span></span>
            : <span className="text-xs font-semibold text-warning">Por verificar</span>}
          {ia?.confianca && <p className="text-[10px] text-ink-muted">confiança {ia.confianca}</p>}
        </div>
      </div>
      <div className="h-1.5 rounded-full bg-line overflow-hidden">
        <div className={`h-full ${corBarra(pct)}`} style={{ width: `${pct ?? 0}%` }} />
      </div>
      {ia?.nota_ia_original != null && ia.nota != null && ia.nota_ia_original > ia.nota && (
        <p className="text-[11px] text-ink-muted">A IA propôs {ia.nota_ia_original}; o teto pelo tipo de evidência é {ia.nota}.</p>
      )}
      {base != null && <p className="text-[11px] text-ink-muted">Nota validada antes: {base}{ia?.nota == null ? ' (mantém-se)' : ''}</p>}
      {ia?.justificacao && <p className="text-xs text-ink-muted">{ia.justificacao}</p>}
      {ia?.pergunta_sugerida && (
        <p className="text-xs text-ink"><span className="font-semibold">Perguntar no próximo contacto:</span> {ia.pergunta_sugerida}</p>
      )}
      {evidencias.length > 0 && (
        <ul className="space-y-1.5">
          {evidencias.map(e => {
            const fora = rejeitadas.has(e.id)
            return (
              <li key={e.id} className={`rounded-lg border border-line p-2 text-xs ${fora ? 'opacity-50' : ''}`}>
                <button type="button" onClick={() => onCitacao(e)} className="text-left w-full hover:text-ink text-ink-muted flex gap-1.5">
                  <Quote className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                  <span className={fora ? 'line-through' : ''}>“{e.citacao}”</span>
                </button>
                <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                  <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${EV_COR[e.tipo] || ''}`}>{TIPOS_EVIDENCIA[e.tipo] || e.tipo}</span>
                  {e.inicio_seg != null && <span className="text-[10px] text-ink-muted num">{mmss(e.inicio_seg)}</span>}
                  <button type="button" onClick={() => toggleEvidencia(e.id)} className="ml-auto text-[11px] text-ink-muted hover:text-ink">
                    {fora ? 'Repor citação' : 'Não é evidência'}
                  </button>
                </div>
              </li>
            )
          })}
        </ul>
      )}
      <div className="flex items-center gap-1.5 flex-wrap pt-1">
        {[['aceite', 'Aceitar', Check], ['ajustada', 'Ajustar', Pencil], ['rejeitada', 'Rejeitar', X]].map(([k, l, Ic]) => (
          <button key={k} type="button" onClick={() => setDecisao({ ...d, decisao: k, nota: k === 'ajustada' ? (d.nota ?? ia?.nota ?? '') : d.nota })}
            aria-pressed={d.decisao === k}
            className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium border ${d.decisao === k ? 'bg-ink text-surface border-ink' : 'border-line text-ink-muted hover:text-ink'}`}>
            <Ic className="w-3.5 h-3.5" />{l}
          </button>
        ))}
      </div>
      {d.decisao === 'ajustada' && (
        <div className="grid grid-cols-[96px_1fr] gap-2">
          <label className="text-[11px] text-ink-muted">Nota
            <select value={d.nota ?? ''} onChange={e => setDecisao({ ...d, nota: e.target.value })} className={`mt-1 ${inputClass}`}>
              <option value="">Por verificar</option>
              {[1, 2, 3, 4, 5].map(n => <option key={n} value={n}>{n}</option>)}
            </select>
          </label>
          <label className="text-[11px] text-ink-muted">Motivo (obrigatório)
            <input value={d.motivo || ''} onChange={e => setDecisao({ ...d, motivo: e.target.value })} className={`mt-1 ${inputClass}`} />
          </label>
        </div>
      )}
      {d.decisao === 'rejeitada' && (
        <label className="block text-[11px] text-ink-muted">Motivo (obrigatório)
          <input value={d.motivo || ''} onChange={e => setDecisao({ ...d, motivo: e.target.value })} className={`mt-1 ${inputClass}`} />
        </label>
      )}
    </div>
  )
}

export function RevisaoAvaliacao({ avaliacaoId, onClose, onDone }) {
  const toast = useToast()
  const [d, setD] = useState(null)
  const [erro, setErro] = useState('')
  const [audioUrl, setAudioUrl] = useState(null)
  const [decisoes, setDecisoes] = useState({})
  const [rejeitadas, setRejeitadas] = useState(new Set())
  const [bloqueios, setBloqueios] = useState([])
  const [compromissos, setCompromissos] = useState([])
  const [validacao, setValidacao] = useState('Em teste')
  const [estatuto, setEstatuto] = useState('')
  const [quem, setQuem] = useState({})
  const [saving, setSaving] = useState(false)
  const [ativo, setAtivo] = useState(null)
  const audioRef = useRef(null)
  const segRefs = useRef({})

  useEffect(() => {
    let vivo = true
    apiFetch(`/api/crm/avaliacoes/${avaliacaoId}`).then(r => r.json().then(j => ({ ok: r.ok, j }))).then(({ ok, j }) => {
      if (!vivo) return
      if (!ok) { setErro(j.error || 'Não foi possível abrir a avaliação'); return }
      setD(j)
      const ext = j.gravacao?.analise_consultor?.extracao || {}
      setCompromissos((ext.compromissos || []).map(c => ({ ...c, incluir: true })))
      setEstatuto(ext.sugestao_estatuto || '')
      setQuem(Object.fromEntries((ext.interlocutores || []).map(x => [x.segmento, x.quem])))
      if (j.gravacao?.id) {
        apiFetch(`/api/crm/gravacoes/${j.gravacao.id}/audio`).then(r => r.json()).then(a => vivo && setAudioUrl(a.url || null)).catch(() => {})
      }
    }).catch(e => vivo && setErro(e.message))
    return () => { vivo = false }
  }, [avaliacaoId])

  const notasIa = d?.avaliacao?.notas_ia || {}
  const params = d?.parametros?.valores
  const alertas = d?.gravacao?.analise_consultor?.extracao?.alertas || []

  // Classe em tempo real: base validada + decisões desta revisão.
  const calc = useMemo(() => {
    if (!d) return null
    const merged = { ...(d.base || {}) }
    for (const k of CHAVES) {
      const dec = decisoes[k] || { decisao: 'aceite' }
      const n = dec.decisao === 'ajustada' ? (dec.nota === '' || dec.nota == null ? null : Number(dec.nota))
        : dec.decisao === 'rejeitada' ? null : notasIa[k]?.nota ?? null
      if (n != null) merged[k] = n
    }
    return calcularClasse(merged, params, bloqueios)
  }, [d, decisoes, notasIa, params, bloqueios])

  function irPara(e) {
    const seg = d?.gravacao?.segmentos?.find(s => s.ini != null && e.inicio_seg != null && Math.abs(s.ini - e.inicio_seg) < 0.5)
      || d?.gravacao?.segmentos?.find(s => e.citacao && s.texto.includes(String(e.citacao).slice(0, 25)))
    if (seg) {
      setAtivo(seg.i)
      segRefs.current[seg.i]?.scrollIntoView({ block: 'center', behavior: 'smooth' })
    }
    if (audioRef.current && e.inicio_seg != null) {
      audioRef.current.currentTime = e.inicio_seg
      audioRef.current.play().catch(() => {})
    }
  }

  async function validar() {
    for (const k of CHAVES) {
      const dec = decisoes[k]
      if (dec && dec.decisao !== 'aceite' && !String(dec.motivo || '').trim()) {
        toast(`${k}: indica o motivo para ${dec.decisao === 'ajustada' ? 'ajustar' : 'rejeitar'}.`, 'error'); return
      }
    }
    setSaving(true)
    try {
      const r = await apiFetch(`/api/crm/avaliacoes/${avaliacaoId}/validar`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          decisoes, evidencias_rejeitadas: [...rejeitadas], bloqueios, validacao,
          compromissos: compromissos.filter(c => c.incluir && c.descricao), estatuto: estatuto || undefined, interlocutores: quem,
        }),
      })
      const j = await r.json()
      if (!r.ok) throw new Error(j.error || 'Falha ao validar')
      toast(`Avaliação validada: classe ${j.classe}${j.validacao ? ` · ${j.validacao}` : ''}`, 'success')
      onDone?.()
      onClose()
    } catch (e) { toast(friendlyError(e.message), 'error') }
    setSaving(false)
  }

  async function descartar() {
    if (!(await confirmar('Descartar esta proposta? Nenhuma nota passa para a ficha.'))) return
    const r = await apiFetch(`/api/crm/avaliacoes/${avaliacaoId}/descartar`, { method: 'POST' })
    if (r.ok) { onDone?.(); onClose() } else toast('Não foi possível descartar', 'error')
  }

  const g = d?.gravacao
  const footer = d && (
    <div className="flex items-center justify-between gap-3 flex-wrap w-full">
      <div className="flex items-center gap-3">
        <ClasseBadge classe={calc?.classe} />
        <div className="text-xs text-ink-muted leading-tight">
          <p className="text-ink font-semibold">Pontuação {calc?.pontuacao ?? '—'} · cobertura {calc?.cobertura ?? 0}%</p>
          <p>{calc?.regras?.join(' · ') || 'Classe resultante, com as notas já validadas antes'}</p>
        </div>
      </div>
      <div className="flex items-center gap-2 flex-wrap">
        <label className="text-xs text-ink-muted flex items-center gap-1.5">Validação
          <select value={validacao} onChange={e => setValidacao(e.target.value)} className={inputClass}>
            <option value="Em teste">Em teste</option>
            <option value="Validado">Validado (exige evidência observada em C1 e C3)</option>
          </select>
        </label>
        <button type="button" onClick={descartar} className="px-3 py-1.5 text-xs font-medium rounded-lg bg-surface-muted text-ink-muted hover:bg-line">Descartar</button>
        <button type="button" onClick={validar} disabled={saving}
          className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-ink text-surface hover:opacity-90 disabled:opacity-50 flex items-center gap-1.5">
          {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />} Validar avaliação
        </button>
      </div>
    </div>
  )

  return (
    <Modal open onClose={onClose} size="full" title={d ? `Rever avaliação — ${d.consultor?.nome || ''}` : 'Rever avaliação'}
      subtitle={g ? `${ETAPAS[g.etapa_consultor] || ''} · ${String(g.data_chamada || '').slice(0, 10)}${g.realizada_por ? ` · ${g.realizada_por}` : ''}` : undefined}
      footer={footer}>
      {erro && <p className="text-sm text-danger">{erro}</p>}
      {!d && !erro && <div className="py-10 text-center text-ink-muted"><Loader2 className="w-5 h-5 animate-spin inline" /></div>}
      {d && (
        <div className="space-y-3">
          {alertas.length > 0 && (
            <div className="rounded-xl border border-warning/40 bg-warning/10 p-3 space-y-1.5">
              <p className="text-xs font-semibold text-ink flex items-center gap-1.5"><AlertTriangle className="w-4 h-4 text-warning" /> Alertas</p>
              {alertas.map((a, i) => {
                const txt = `${a.tipo}: ${a.descricao}`
                return (
                  <div key={i} className="flex items-start gap-2 text-xs text-ink">
                    <span className="flex-1">{a.descricao} <span className="text-ink-muted">({a.tipo})</span></span>
                    {a.bloqueante && (
                      <label className="flex items-center gap-1 shrink-0 text-ink-muted">
                        <input type="checkbox" checked={bloqueios.includes(txt)}
                          onChange={e => setBloqueios(b => e.target.checked ? [...b, txt] : b.filter(x => x !== txt))} />
                        <ShieldAlert className="w-3.5 h-3.5" /> Confirmar bloqueio (classe máx. D)
                      </label>
                    )}
                  </div>
                )
              })}
            </div>
          )}
          <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-4">
            <section className="min-w-0 space-y-2">
              {audioUrl
                ? <audio ref={audioRef} src={audioUrl} controls className="w-full" preload="metadata" />
                : <p className="text-xs text-ink-muted">{g?.audio_apagado_em ? 'Áudio já apagado (prazo de conservação).' : 'Sem áudio disponível.'}</p>}
              <p className="text-[11px] text-ink-muted">Interlocutores atribuídos pela IA: corrige se estiverem trocados.</p>
              <ol className="max-h-[60vh] overflow-y-auto rounded-xl border border-line bg-surface p-2 space-y-1">
                {(g?.segmentos || []).map(s => {
                  const q = quem[s.i] || 'outro'
                  return (
                    <li key={s.i} ref={el => { segRefs.current[s.i] = el }}
                      className={`grid grid-cols-[52px_84px_1fr] gap-2 text-xs rounded-lg px-1.5 py-1 ${ativo === s.i ? 'bg-accent/15' : ''}`}>
                      <button type="button" disabled={s.ini == null} onClick={() => { if (audioRef.current && s.ini != null) { audioRef.current.currentTime = s.ini; audioRef.current.play().catch(() => {}) } }}
                        className="text-ink-muted num flex items-center gap-1 hover:text-ink disabled:hover:text-ink-muted">
                        {s.ini != null && <Play className="w-3 h-3" />}{mmss(s.ini)}
                      </button>
                      <select value={q} onChange={e => setQuem(m => ({ ...m, [s.i]: e.target.value }))} aria-label="Quem fala"
                        className={`text-[11px] bg-transparent border-0 p-0 font-semibold ${q === 'consultor' ? 'text-ink' : 'text-ink-muted'}`}>
                        {Object.entries(QUEM).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                      </select>
                      <span className={q === 'consultor' ? 'text-ink' : 'text-ink-muted'}>{s.texto}</span>
                    </li>
                  )
                })}
              </ol>
            </section>
            <section className="min-w-0 space-y-2">
              {CRITERIOS.map(c => (
                <CartaoCriterio key={c.chave} crit={c} ia={notasIa[c.chave]} base={d.base?.[c.chave]}
                  decisao={decisoes[c.chave]} setDecisao={v => setDecisoes(m => ({ ...m, [c.chave]: v }))}
                  evidencias={d.evidencias.filter(e => e.criterio === c.chave)} rejeitadas={rejeitadas}
                  toggleEvidencia={id => setRejeitadas(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n })}
                  onCitacao={irPara} />
              ))}
              {compromissos.length > 0 && (
                <div className="rounded-xl border border-line bg-surface-raised p-3 space-y-1.5">
                  <p className="text-xs font-semibold text-ink">Compromissos detetados</p>
                  {compromissos.map((c, i) => (
                    <label key={i} className="flex items-start gap-2 text-xs text-ink">
                      <input type="checkbox" checked={c.incluir} onChange={e => setCompromissos(l => l.map((x, j) => j === i ? { ...x, incluir: e.target.checked } : x))} />
                      <span className="flex-1">{c.quem === 'somnium' ? 'Somnium' : 'Consultor'}: {c.descricao}</span>
                      <input type="date" value={c.data_limite || ''} onChange={e => setCompromissos(l => l.map((x, j) => j === i ? { ...x, data_limite: e.target.value } : x))}
                        className={`${inputClass} w-36`} />
                    </label>
                  ))}
                </div>
              )}
              <label className="block text-xs text-ink-muted">Estatuto depois desta chamada
                <select value={estatuto} onChange={e => setEstatuto(e.target.value)} className={`mt-1 ${inputClass}`}>
                  <option value="">Manter ({d.consultor?.estatuto || '—'})</option>
                  {ESTATUTOS.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </label>
            </section>
          </div>
        </div>
      )}
    </Modal>
  )
}
