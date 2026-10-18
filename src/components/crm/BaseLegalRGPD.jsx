/**
 * Proteção de dados (RGPD, auditoria D4): base legal com que a Somnium trata
 * os dados desta pessoa (investidor, consultor ou proprietário do imóvel).
 * Fonte única: tabela consentimentos (src/db/consentimentos.js).
 *   «Registar base legal» → consentimento, execução de contrato ou interesse
 *   legítimo, com a origem e a prova.
 *   «Retirar consentimento» → deixa de receber envios automáticos.
 * O investidor num projeto CAEP tem «execução de contrato» automaticamente.
 */
import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ShieldCheck, ChevronRight } from 'lucide-react'
import { apiFetch } from '../../lib/api.js'
import { useToast } from '../ui/Toast.jsx'
import { inputClass } from './passosUtil.js'

const BASES = {
  consentimento: 'Consentimento',
  contrato: 'Execução de contrato',
  interesse_legitimo: 'Interesse legítimo',
}
const ESTADO = {
  consentimento: { label: 'Consentimento', cor: 'bg-success/10 text-success' },
  contrato: { label: 'Execução de contrato', cor: 'bg-success/10 text-success' },
  interesse_legitimo: { label: 'Interesse legítimo', cor: 'bg-success/10 text-success' },
  retirado: { label: 'Consentimento retirado', cor: 'bg-danger/10 text-danger' },
  sem: { label: 'Sem base registada', cor: 'bg-warning/10 text-warning' },
}
const ROTA = { investidor: 'investidores', consultor: 'consultores', proprietario: 'imoveis' }
const fmt = d => (d ? new Date(d).toLocaleDateString('pt-PT') : '')

export function BaseLegalRGPD({ entidade, id, titulo = 'Proteção de dados' }) {
  const toast = useToast()
  const url = `/api/crm/${ROTA[entidade]}/${id}/base-legal`
  const q = useQuery({
    queryKey: ['base-legal', entidade, id],
    enabled: !!id,
    queryFn: async () => { const r = await apiFetch(url); if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json() },
  })
  const [modo, setModo] = useState(null) // 'registar' | 'retirar'
  const [form, setForm] = useState({ base_legal: 'consentimento', origem: '', prova: '' })
  const [motivo, setMotivo] = useState('')
  const [verHistorico, setVerHistorico] = useState(false)
  const [aGravar, setAGravar] = useState(false)

  async function enviar(caminho, body, ok) {
    setAGravar(true)
    const r = await apiFetch(caminho, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).catch(() => null)
    setAGravar(false)
    if (!r?.ok) {
      const err = await r?.json().catch(() => ({}))
      toast?.(err?.error || 'Erro ao guardar', 'error', 4000)
      return
    }
    toast?.(ok, 'success', 3000)
    setModo(null); setMotivo(''); setForm({ base_legal: 'consentimento', origem: '', prova: '' })
    q.refetch()
  }

  if (!id) return null
  const d = q.data
  const est = ESTADO[d?.estado || 'sem']
  const reg = d?.registo

  return (
    <div className="rounded-lg border border-line bg-surface-raised p-3 space-y-2">
      <div className="flex items-center gap-2">
        <ShieldCheck className="w-4 h-4 text-ink-muted" />
        <p className="text-xs text-ink-muted uppercase tracking-wide flex-1">{titulo}</p>
        {d && <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full ${est.cor}`}>{est.label}</span>}
      </div>

      {q.isLoading && <p className="text-xs text-ink-muted">A carregar…</p>}
      {d && (
        <div className="text-xs text-ink space-y-1">
          {d.estado === 'retirado' && reg && (
            <p>Retirado a {fmt(reg.retirado_em)}{reg.retirado_por ? ` por ${reg.retirado_por}` : ''}: {reg.motivo_retirada}. Não recebe envios automáticos.</p>
          )}
          {reg && d.estado !== 'retirado' && (
            <>
              <p>{reg.origem}{reg.registado_em ? ` · ${fmt(reg.registado_em)}` : ''}{reg.registado_por ? ` · ${reg.registado_por}` : ''}</p>
              {reg.finalidade && <p className="text-ink-muted">Finalidade: {reg.finalidade}</p>}
              {reg.prova && <p className="text-ink-muted">Prova: {reg.prova}</p>}
            </>
          )}
          {d.caep && <p className="text-ink-muted">Execução de contrato: investidor no projeto CAEP {d.caep}.</p>}
          {d.estado === 'sem' && <p className="text-ink-muted">Regista a base legal com que tratamos os dados desta pessoa.</p>}
        </div>
      )}

      {d && modo === null && (
        <div className="flex flex-wrap gap-3">
          <button type="button" onClick={() => setModo('registar')} className="text-[11px] text-brand-gold hover:underline">Registar base legal</button>
          {d.estado !== 'retirado' && (
            <button type="button" onClick={() => setModo('retirar')} className="text-[11px] text-ink-muted hover:text-danger">Retirar consentimento</button>
          )}
          {d.historico?.length > 0 && (
            <button type="button" onClick={() => setVerHistorico(v => !v)} className="inline-flex items-center gap-0.5 text-[11px] text-ink-muted hover:text-ink">
              Histórico ({d.historico.length})<ChevronRight className={`w-3 h-3 transition-transform ${verHistorico ? 'rotate-90' : ''}`} />
            </button>
          )}
        </div>
      )}

      {modo === 'registar' && (
        <div className="space-y-2">
          <select value={form.base_legal} onChange={e => setForm(f => ({ ...f, base_legal: e.target.value }))} className={inputClass}>
            {Object.entries(BASES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
          <input type="text" value={form.origem} onChange={e => setForm(f => ({ ...f, origem: e.target.value }))}
            placeholder="Origem (obrigatório): ex. Skool, referenciação, reunião" className={inputClass} />
          <textarea value={form.prova} onChange={e => setForm(f => ({ ...f, prova: e.target.value }))} rows={2}
            placeholder="Prova: ex. mensagem de 12/10 em que aceitou ser contactado" className={inputClass} />
          <div className="flex gap-3">
            <button type="button" disabled={aGravar || !form.origem.trim()} onClick={() => enviar(url, form, 'Base legal registada')}
              className="text-[11px] text-brand-gold disabled:text-ink-muted">Guardar</button>
            <button type="button" onClick={() => setModo(null)} className="text-[11px] text-ink-muted">Cancelar</button>
          </div>
        </div>
      )}

      {modo === 'retirar' && (
        <div className="space-y-2">
          <input type="text" autoFocus value={motivo} onChange={e => setMotivo(e.target.value)}
            placeholder="Motivo (obrigatório): ex. pedido do titular por email a 18/10" className={inputClass} />
          <div className="flex gap-3">
            <button type="button" disabled={aGravar || !motivo.trim()} onClick={() => enviar(`${url}/retirar`, { motivo }, 'Consentimento retirado')}
              className="text-[11px] text-danger disabled:text-ink-muted">Retirar</button>
            <button type="button" onClick={() => setModo(null)} className="text-[11px] text-ink-muted">Cancelar</button>
          </div>
        </div>
      )}

      {verHistorico && d?.historico?.length > 0 && (
        <ul className="border-t border-line pt-2 space-y-1">
          {d.historico.map(h => (
            <li key={h.id} className="text-[11px] text-ink-muted">
              {fmt(h.registado_em)} · {h.base_legal ? BASES[h.base_legal] : 'Oposição'} · {h.origem}
              {h.retirado_em && <span className="text-danger"> · retirado a {fmt(h.retirado_em)}</span>}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
