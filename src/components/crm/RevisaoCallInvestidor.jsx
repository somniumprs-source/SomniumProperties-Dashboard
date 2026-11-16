/**
 * Preenchimento automático da ficha do investidor (calls e reuniões).
 *
 * - RevisaoCallModal: ecrã "Rever call" (1 minuto): o que foi preenchido
 *   (verde, citação ao passar o rato), os conflitos (aceitar/rejeitar), o que
 *   continua por recolher e o botão "Confirmar registo".
 * - SugestoesIA: sugestões pendentes de um investidor (na ficha).
 * - MarcaIA: ponto verde "preenchido por IA" ao lado de um campo.
 * - useCamposIA: estado de IA do investidor (contador, preenchidos).
 * Backend: _shared/autopreenchimento.ts.
 */
import { useState, useEffect, useCallback } from 'react'
import { Check, X, Undo2, Loader2, Sparkles, AlertTriangle, HelpCircle, Quote } from 'lucide-react'
import { apiFetch } from '../../lib/api.js'
import { useToast } from '../ui/Toast.jsx'
import { Button } from '../ui/Button.jsx'
import { Modal } from '../ui/Modal.jsx'

const MOTIVO = {
  conflito: 'Diferente do que está na ficha',
  confianca_baixa: 'Pouco claro na conversa',
  editado_mao: 'Campo editado à mão',
  backfill: 'Dados antigos (backfill)',
  classificacao: 'Reclassificação sugerida',
}
const CRITERIOS = [['capacidade_financeira', 'Capacidade financeira'], ['experiencia', 'Experiência'], ['alinhamento', 'Alinhamento'], ['credibilidade', 'Credibilidade'], ['compromisso', 'Compromisso']]
const fmtData = (d) => (/^\d{4}-\d{2}-\d{2}/.test(d || '') ? `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}` : '')
const origemTxt = (l) => `${l.origem_tipo === 'reuniao' ? 'Reunião' : 'Call'}${l.origem_data ? ` de ${fmtData(l.origem_data)}` : ''}`

async function postJson(url) {
  const r = await apiFetch(url, { method: 'POST' })
  const j = await r.json().catch(() => ({}))
  if (!r.ok || j.error) throw new Error(j.error || 'Falhou')
  return j
}

export function useCamposIA(investidorId) {
  const [dados, setDados] = useState({ pendentes: [], contador: 0, preenchidos: {} })
  const carregar = useCallback(async () => {
    if (!investidorId) return
    try {
      const r = await apiFetch(`/api/crm/investidores/${investidorId}/campos-ia`)
      const j = await r.json()
      if (r.ok && !j.error) setDados(j)
    } catch { /* sem bloqueio da ficha */ }
  }, [investidorId])
  useEffect(() => { carregar() }, [carregar])
  return { ...dados, recarregar: carregar }
}

export function MarcaIA({ info }) {
  if (!info) return null
  const titulo = `Preenchido por IA · ${origemTxt(info)}${info.confianca ? ` · confiança ${info.confianca}` : ''}${info.evidencia ? `\n"${info.evidencia}"` : ''}`
  return <span title={titulo} className="inline-block w-1.5 h-1.5 rounded-full bg-success ml-1 align-middle cursor-help" />
}

function Classificacao({ valor }) {
  if (!valor) return null
  return (
    <div className="space-y-1">
      <div className="flex flex-wrap gap-1.5">
        {CRITERIOS.map(([k, l]) => valor[k] != null && <span key={k} className="text-[11px] px-2 py-0.5 rounded-full bg-surface-muted border border-line">{l}: <b>{valor[k]}</b>/5</span>)}
      </div>
      {valor.justificacao && <p className="text-xs text-ink-muted">{valor.justificacao}</p>}
      <p className="text-[11px] text-ink-muted">A classe final é validada pelos dois sócios no separador Avaliação (Scorecard).</p>
    </div>
  )
}

function LinhaSugestao({ l, onDecidir, busy }) {
  return (
    <li className="rounded-lg border border-warning/30 bg-warning/5 px-3 py-2">
      <div className="flex flex-wrap items-start gap-2">
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium text-ink">{l.label}</div>
          {l.campo === 'classificacao' ? <Classificacao valor={l.valor} /> : (
            <div className="text-sm text-ink">
              {l.anterior_txt && l.anterior_txt !== '—' && <><span className="text-ink-muted line-through">{l.anterior_txt}</span> <span className="text-ink-muted">→</span> </>}
              <b>{l.valor_txt}</b>
            </div>
          )}
          {l.evidencia && <p className="text-xs text-ink-muted italic mt-0.5"><Quote className="w-3 h-3 inline mr-1" />{l.evidencia}{l.minuto ? ` (${l.minuto})` : ''}</p>}
          <p className="text-[11px] text-ink-muted mt-0.5">{MOTIVO[l.motivo] || l.motivo} · {origemTxt(l)}{l.confianca ? ` · confiança ${l.confianca}` : ''}</p>
        </div>
        <div className="flex gap-1.5 shrink-0">
          {l.campo !== 'classificacao' && !String(l.campo).startsWith('scorecard_discovery.') && <Button size="sm" variant="secondary" icon={Check} loading={busy === `${l.id}:aceitar`} onClick={() => onDecidir(l, 'aceitar')}>Aceitar</Button>}
          <Button size="sm" variant="secondary" icon={X} loading={busy === `${l.id}:rejeitar`} onClick={() => onDecidir(l, 'rejeitar')}>{l.campo === 'classificacao' ? 'Dispensar' : 'Rejeitar'}</Button>
        </div>
      </div>
    </li>
  )
}

function useDecidir(onFeito) {
  const toast = useToast()
  const [busy, setBusy] = useState(null)
  const decidir = useCallback(async (l, acao) => {
    setBusy(`${l.id}:${acao}`)
    try {
      await postJson(`/api/crm/campos-ia/${l.id}/${acao}`)
      toast?.(acao === 'aceitar' ? `${l.label} atualizado na ficha` : acao === 'reverter' ? `${l.label} reposto` : 'Sugestão rejeitada', 'success')
      await onFeito?.()
    } catch (e) { toast?.(e.message, 'error') }
    setBusy(null)
  }, [onFeito, toast])
  return { busy, decidir }
}

// ── Sugestões pendentes (ficha do investidor) ─────────────────
export function SugestoesIA({ investidorId, pendentes, onAlterado }) {
  const { busy, decidir } = useDecidir(onAlterado)
  if (!pendentes?.length) return null
  return (
    <div className="rounded-xl border border-warning/30 bg-surface-raised p-4 space-y-2">
      <div className="flex items-center gap-2 text-sm font-medium text-ink">
        <Sparkles className="w-4 h-4 text-warning" /> {pendentes.length} sugest{pendentes.length === 1 ? 'ão' : 'ões'} da IA por decidir
      </div>
      <ul className="space-y-2">{pendentes.map(l => <LinhaSugestao key={l.id} l={l} busy={busy} onDecidir={decidir} />)}</ul>
    </div>
  )
}

// ── Ecrã "Rever call" ─────────────────────────────────────────
export function RevisaoCallModal({ gravacaoId, onClose, onAlterado }) {
  const toast = useToast()
  const [dados, setDados] = useState(null)
  const [erro, setErro] = useState(null)
  const [confirmando, setConfirmando] = useState(false)
  const carregar = useCallback(async () => {
    try {
      const r = await apiFetch(`/api/crm/chamadas-investidores/${gravacaoId}/revisao`)
      const j = await r.json()
      if (!r.ok || j.error) throw new Error(j.error || 'Falha ao carregar')
      setDados(j); setErro(null)
    } catch (e) { setErro(e.message) }
  }, [gravacaoId])
  useEffect(() => { carregar() }, [carregar])
  // A extração corre no Mac: recarrega até chegar.
  useEffect(() => {
    if (!dados?.extracao_pendente) return
    const t = setInterval(carregar, 15000)
    return () => clearInterval(t)
  }, [dados?.extracao_pendente, carregar])
  const aposDecidir = useCallback(async () => { await carregar(); onAlterado?.() }, [carregar, onAlterado])
  const { busy, decidir } = useDecidir(aposDecidir)

  async function confirmar() {
    setConfirmando(true)
    try {
      await postJson(`/api/crm/chamadas-investidores/${gravacaoId}/confirmar-registo`)
      toast?.('Registo da call confirmado', 'success')
      onAlterado?.(); onClose()
    } catch (e) { toast?.(e.message, 'error') }
    setConfirmando(false)
  }

  const g = dados?.gravacao
  return (
    <Modal open onClose={onClose} size="lg" title="Rever call"
      subtitle={g ? `${g.tipo_chamada === 'follow_up' ? 'Follow-up' : g.tipo_chamada === 'discovery' ? 'Discovery Call' : 'Cold Call'} de ${fmtData(g.data_chamada)}` : ''}
      footer={
        <Modal.Footer>
          <Button variant="secondary" onClick={onClose}>Fechar</Button>
          <Button icon={Check} loading={confirmando} onClick={confirmar} disabled={!g}>
            {g?.registo_confirmado_em ? 'Confirmar de novo' : 'Confirmar registo'}
          </Button>
        </Modal.Footer>
      }>
      {erro && <p className="text-sm text-danger">{erro}</p>}
      {!dados && !erro && <div className="flex items-center gap-2 text-sm text-ink-muted"><Loader2 className="w-4 h-4 animate-spin" />A carregar</div>}
      {dados && (
        <div className="space-y-5">
          {g.resumo && <p className="text-sm text-ink">{g.resumo}</p>}
          <div className="flex flex-wrap gap-2 text-xs">
            {[['Resultado', g.resultado], ['Próximo passo', g.proximo_passo], ['Temperatura', g.temperatura], ['Follow-up', fmtData(g.data_follow_up)]].map(([k, v]) => (
              <span key={k} className="px-2 py-1 rounded-md bg-surface-muted border border-line"><span className="text-ink-muted">{k}:</span> <b>{v ? String(v).replace(/_/g, ' ') : '—'}</b></span>
            ))}
            {g.registo_fonte === 'ia' && <span className="px-2 py-1 rounded-md bg-success/10 text-success border border-success/30">Registado pela IA</span>}
            {g.registo_confirmado_em && <span className="px-2 py-1 rounded-md bg-surface-muted border border-line">Confirmado a {new Date(g.registo_confirmado_em).toLocaleString('pt-PT')}</span>}
          </div>

          {dados.extracao_pendente && (
            <div className="flex items-center gap-2 text-xs text-ink-muted"><Loader2 className="w-3.5 h-3.5 animate-spin" />A extrair os dados da conversa no Mac (poucos minutos).</div>
          )}

          <section>
            <h4 className="text-xs font-semibold tracking-widest uppercase text-success mb-2">Preenchido automaticamente ({dados.preenchidos.length})</h4>
            {dados.preenchidos.length ? (
              <ul className="space-y-1.5">{dados.preenchidos.map(l => (
                <li key={l.id} className="flex items-start gap-2 rounded-lg bg-success/5 border border-success/20 px-3 py-1.5" title={l.evidencia ? `"${l.evidencia}"${l.minuto ? ` (${l.minuto})` : ''}` : ''}>
                  <Check className="w-4 h-4 text-success mt-0.5 shrink-0" />
                  <div className="flex-1 min-w-0 text-sm"><span className="text-ink-muted">{l.label}:</span> <b className="text-ink">{l.valor_txt}</b>
                    {l.evidencia && <span className="block text-xs text-ink-muted italic truncate">"{l.evidencia}"</span>}
                  </div>
                  <button type="button" className="text-xs text-ink-muted hover:text-danger inline-flex items-center gap-1 shrink-0" disabled={busy === `${l.id}:reverter`} onClick={() => decidir(l, 'reverter')}>
                    {busy === `${l.id}:reverter` ? <Loader2 className="w-3 h-3 animate-spin" /> : <Undo2 className="w-3 h-3" />} Reverter
                  </button>
                </li>
              ))}</ul>
            ) : <p className="text-sm text-ink-muted">{dados.extracao_pendente ? 'Ainda nada.' : 'Nada novo para escrever na ficha.'}</p>}
          </section>

          <section>
            <h4 className="text-xs font-semibold tracking-widest uppercase text-warning mb-2">Para decidir ({dados.conflitos.length})</h4>
            {dados.conflitos.length ? <ul className="space-y-2">{dados.conflitos.map(l => <LinhaSugestao key={l.id} l={l} busy={busy} onDecidir={decidir} />)}</ul>
              : <p className="text-sm text-ink-muted">Sem conflitos.</p>}
            {dados.contradicoes.length > 0 && (
              <div className="mt-3 rounded-lg border border-line px-3 py-2">
                <p className="text-xs font-medium text-ink flex items-center gap-1 mb-1"><AlertTriangle className="w-3.5 h-3.5 text-warning" />Contradições com a ficha ou os formulários</p>
                <ul className="text-xs text-ink-muted space-y-1">{dados.contradicoes.map((c, i) => (
                  <li key={i}><b className="text-ink">{c.campo}</b>: ficha/formulário "{c.ficha_ou_formulario}" · conversa "{c.conversa}"</li>
                ))}</ul>
              </div>
            )}
          </section>

          <section>
            <h4 className="text-xs font-semibold tracking-widest uppercase text-ink-muted mb-2 flex items-center gap-1"><HelpCircle className="w-3.5 h-3.5" />Continua por recolher ({dados.por_recolher.length})</h4>
            {dados.por_recolher.length ? (
              <div className="flex flex-wrap gap-1.5">{dados.por_recolher.map(c => <span key={c.campo} className="text-xs px-2 py-0.5 rounded-full bg-surface-muted border border-line text-ink">{c.label}</span>)}</div>
            ) : <p className="text-sm text-ink-muted">Ficha completa.</p>}
            <p className="text-[11px] text-ink-muted mt-1.5">Estas perguntas entram na preparação da próxima call.</p>
          </section>
        </div>
      )}
    </Modal>
  )
}
