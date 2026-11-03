/**
 * Rede de consultores (Administração > Chamadas): painel da classificação de
 * consultores — consultores por classe, oportunidades enviadas e qualificadas
 * por mês, progressão até negócio, contribuição para o objetivo anual e a
 * lista "a rever" (sugestões da plataforma, que o associado decide). Também
 * os parâmetros do modelo (versionados: cada gravação cria uma versão nova).
 */
import { useState, useEffect } from 'react'
import { Loader2, Save, AlertCircle } from 'lucide-react'
import { apiFetch } from '../lib/api.js'
import { useToast } from '../components/ui/Toast.jsx'
import { friendlyError } from '../lib/friendlyError.js'
import { KpiCard } from '../components/ui/KpiCard.jsx'
import { inputClass } from '../components/crm/RegistoManualFieldset.jsx'
import { CRITERIOS, comPadrao } from '../db/classificacaoConsultorCalc.js'

const ORDEM_CLASSES = ['A', 'B', 'C', 'D', 'Pendente', 'Sem avaliação']
const TIPO_SUGESTAO = {
  inativo: 'Inativo', baixa_qualidade: 'Baixa qualidade', incumprimento: 'Incumprimento',
  sem_oportunidades: 'Sem oportunidades', revisao_trimestral: 'Revisão trimestral',
}

function Painel({ p }) {
  const total = p.por_classe.reduce((s, r) => s + r.n, 0)
  const max = Math.max(1, ...p.oportunidades_por_mes.map(m => m.enviadas))
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiCard label={`Fix and Flip ${p.objetivo.ano}`} value={`${p.objetivo.fix_flip.feitos} / ${p.objetivo.fix_flip.meta}`} sub={`${p.objetivo.fix_flip.da_rede} vindos da rede`} />
        <KpiCard label={`Wholesaling ${p.objetivo.ano}`} value={`${p.objetivo.wholesaling.feitos} / ${p.objetivo.wholesaling.meta}`} sub={`${p.objetivo.wholesaling.da_rede} vindos da rede`} />
        <KpiCard label="Oportunidades da rede" value={p.progressao.enviadas} sub={`${p.progressao.proposta} chegaram a proposta`} />
        <KpiCard label="Consultores a rever" value={p.a_rever.length} sub="sugestões por decidir" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="rounded-xl border border-line bg-surface-raised p-4">
          <h4 className="text-sm font-semibold text-ink mb-3">Consultores por classe (ativos)</h4>
          <div className="space-y-2">
            {ORDEM_CLASSES.map(c => {
              const n = p.por_classe.find(r => r.classe === c)?.n || 0
              return (
                <div key={c} className="grid grid-cols-[110px_1fr_32px] items-center gap-2 text-xs">
                  <span className="text-ink-muted">{c === 'Pendente' || c === 'Sem avaliação' ? c : `Classe ${c}`}</span>
                  <div className="h-2 rounded-full bg-line overflow-hidden"><div className="h-full bg-accent" style={{ width: `${total ? n / total * 100 : 0}%` }} /></div>
                  <span className="text-right num text-ink font-semibold">{n}</span>
                </div>
              )
            })}
          </div>
        </div>
        <div className="rounded-xl border border-line bg-surface-raised p-4">
          <h4 className="text-sm font-semibold text-ink mb-1">Oportunidades enviadas e qualificadas, por mês</h4>
          <p className="text-[11px] text-ink-muted mb-3">Qualificada = dentro das zonas, tipologia e preço, com informação mínima. Não quer dizer viável.</p>
          <div className="flex items-end gap-1 h-28">
            {p.oportunidades_por_mes.map(m => (
              <div key={m.mes} className="flex-1 flex flex-col items-center gap-1" title={`${m.mes}: ${m.enviadas} enviadas, ${m.qualificadas} qualificadas`}>
                <div className="w-full flex flex-col justify-end h-24 relative">
                  <div className="w-full bg-line rounded-t" style={{ height: `${m.enviadas / max * 100}%` }} />
                  <div className="w-full bg-accent rounded-t absolute bottom-0" style={{ height: `${m.qualificadas / max * 100}%` }} />
                </div>
                <span className="text-[9px] text-ink-muted num">{m.mes.slice(5)}</span>
              </div>
            ))}
          </div>
          <p className="text-[11px] text-ink-muted mt-2"><span className="inline-block w-2 h-2 bg-line rounded-sm mr-1" />enviadas <span className="inline-block w-2 h-2 bg-accent rounded-sm ml-3 mr-1" />qualificadas</p>
        </div>
      </div>

      <div className="rounded-xl border border-line bg-surface-raised p-4">
        <h4 className="text-sm font-semibold text-ink mb-2">Progressão das oportunidades da rede</h4>
        <p className="text-sm text-ink num">{p.progressao.enviadas} enviadas → {p.progressao.analise} em análise → {p.progressao.visita} com visita → {p.progressao.proposta} com proposta</p>
        <p className="text-[11px] text-ink-muted mt-1">Com poucos casos não se tiram taxas de conversão: os números são contagens.</p>
      </div>

      <div className="rounded-xl border border-line bg-surface-raised p-4">
        <h4 className="text-sm font-semibold text-ink mb-2">A rever</h4>
        {p.a_rever.length === 0
          ? <p className="text-xs text-ink-muted">Nada a rever.</p>
          : (
            <ul className="divide-y divide-line">
              {p.a_rever.map((s, i) => (
                <li key={i} className="py-1.5 flex items-center gap-2 text-xs">
                  <span className="px-1.5 py-0.5 rounded bg-surface-muted text-ink-muted shrink-0">{TIPO_SUGESTAO[s.tipo] || s.tipo}</span>
                  <span className="font-semibold text-ink shrink-0">{s.nome}</span>
                  <span className="text-ink-muted">{s.texto}</span>
                </li>
              ))}
            </ul>
          )}
        <p className="text-[11px] text-ink-muted mt-2">A plataforma sugere; quem decide é o associado. As sugestões também entram na Agenda como "Por aprovar".</p>
      </div>
    </div>
  )
}

function Parametros({ inicial, versao, onSaved }) {
  const toast = useToast()
  const [v, setV] = useState(() => comPadrao(inicial))
  const [saving, setSaving] = useState(false)
  const set = (grupo, k, val) => setV(x => ({ ...x, [grupo]: { ...x[grupo], [k]: val } }))
  const soma = CRITERIOS.reduce((s, c) => s + (Number(v.pesos[c.chave]) || 0), 0)
  const lista = (txt) => txt.split(/\n|,/).map(s => s.trim()).filter(Boolean)

  async function guardar() {
    setSaving(true)
    try {
      const r = await apiFetch('/api/crm/parametros-classificacao', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ valores: v }),
      })
      const j = await r.json()
      if (!r.ok) throw new Error(j.error || 'Falha ao guardar')
      toast(`Parâmetros guardados (versão ${j.versao})`, 'success')
      onSaved?.()
    } catch (e) { toast(friendlyError(e.message), 'error') }
    setSaving(false)
  }

  const num = (grupo, k, props = {}) => (
    <input type="number" value={v[grupo][k] ?? ''} onChange={e => set(grupo, k, e.target.value === '' ? null : Number(e.target.value))} className={inputClass} {...props} />
  )

  return (
    <div className="space-y-4">
      <p className="text-xs text-ink-muted">Versão em uso: {versao || 'padrão (ainda não guardada)'}. São parâmetros iniciais do piloto, não padrões do setor. Mudar um valor não altera avaliações já feitas: cada uma guarda a versão com que foi calculada.</p>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="rounded-xl border border-line bg-surface-raised p-4 space-y-2">
          <h4 className="text-sm font-semibold text-ink">Pesos dos critérios <span className={`text-xs ${soma === 100 ? 'text-success' : 'text-danger'}`}>(soma {soma}%)</span></h4>
          {CRITERIOS.map(c => (
            <label key={c.chave} className="grid grid-cols-[1fr_80px] items-center gap-2 text-xs text-ink-muted">{c.chave} · {c.label}{num('pesos', c.chave)}</label>
          ))}
        </div>
        <div className="rounded-xl border border-line bg-surface-raised p-4 space-y-2">
          <h4 className="text-sm font-semibold text-ink">Cortes e regras</h4>
          {['A', 'B', 'C'].map(k => <label key={k} className="grid grid-cols-[1fr_80px] items-center gap-2 text-xs text-ink-muted">Classe {k} a partir de{num('cortes', k)}</label>)}
          <label className="grid grid-cols-[1fr_80px] items-center gap-2 text-xs text-ink-muted">Cobertura mínima (%)
            <input type="number" value={v.cobertura_minima} onChange={e => setV(x => ({ ...x, cobertura_minima: Number(e.target.value) }))} className={inputClass} /></label>
          <label className="grid grid-cols-[1fr_80px] items-center gap-2 text-xs text-ink-muted">A exige C1 ≥{num('regras', 'A', { value: v.regras.A?.C1 ?? '', onChange: e => setV(x => ({ ...x, regras: { ...x.regras, A: { ...x.regras.A, C1: Number(e.target.value) } } })) })}</label>
          <label className="grid grid-cols-[1fr_80px] items-center gap-2 text-xs text-ink-muted">A exige C3 ≥<input type="number" value={v.regras.A?.C3 ?? ''} onChange={e => setV(x => ({ ...x, regras: { ...x.regras, A: { ...x.regras.A, C3: Number(e.target.value) } } }))} className={inputClass} /></label>
          <label className="grid grid-cols-[1fr_80px] items-center gap-2 text-xs text-ink-muted">B exige C1 ≥<input type="number" value={v.regras.B?.C1 ?? ''} onChange={e => setV(x => ({ ...x, regras: { ...x.regras, B: { ...x.regras.B, C1: Number(e.target.value) } } }))} className={inputClass} /></label>
          {['declaracao', 'exemplo', 'observada'].map(k => <label key={k} className="grid grid-cols-[1fr_80px] items-center gap-2 text-xs text-ink-muted">Nota máxima com {k === 'declaracao' ? 'declaração' : k === 'exemplo' ? 'exemplo concreto' : 'evidência observada'}{num('tetos', k)}</label>)}
        </div>
        <div className="rounded-xl border border-line bg-surface-raised p-4 space-y-2">
          <h4 className="text-sm font-semibold text-ink">Cadências e prazos</h4>
          {['A', 'B', 'C', 'Pendente'].map(k => <label key={k} className="grid grid-cols-[1fr_80px] items-center gap-2 text-xs text-ink-muted">Contacto proativo {k === 'Pendente' ? 'Pendente' : `classe ${k}`} (dias){num('cadencias', k)}</label>)}
          <label className="grid grid-cols-[1fr_80px] items-center gap-2 text-xs text-ink-muted">Sugerir Inativo após (dias)
            <input type="number" value={v.inativo_dias} onChange={e => setV(x => ({ ...x, inativo_dias: Number(e.target.value) }))} className={inputClass} /></label>
          <label className="grid grid-cols-[1fr_80px] items-center gap-2 text-xs text-ink-muted">Áudio apagado após validação (dias){num('conservacao', 'audio_dias')}</label>
          <label className="grid grid-cols-[1fr_80px] items-center gap-2 text-xs text-ink-muted">Preço máximo de aquisição (€){num('limiares', 'preco_max')}</label>
        </div>
        <div className="rounded-xl border border-line bg-surface-raised p-4 space-y-2">
          <h4 className="text-sm font-semibold text-ink">Zonas</h4>
          <label className="block text-xs text-ink-muted">Concelhos-alvo (um por linha)
            <textarea rows={6} value={v.concelhos_alvo.join('\n')} onChange={e => setV(x => ({ ...x, concelhos_alvo: lista(e.target.value) }))} className={`mt-1 ${inputClass}`} /></label>
          <label className="block text-xs text-ink-muted">Concelhos com licenciamento lento (um por linha; começa vazio)
            <textarea rows={3} value={v.concelhos_lentos.join('\n')} onChange={e => setV(x => ({ ...x, concelhos_lentos: lista(e.target.value) }))} className={`mt-1 ${inputClass}`} /></label>
        </div>
      </div>
      <button type="button" onClick={guardar} disabled={saving || soma !== 100}
        className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-ink text-surface hover:opacity-90 disabled:opacity-50 flex items-center gap-1.5">
        {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />} Guardar nova versão
      </button>
    </div>
  )
}

export function AdministracaoRedeConsultores() {
  const [vista, setVista] = useState('painel')
  const [painel, setPainel] = useState(null)
  const [params, setParams] = useState(null)
  const [erro, setErro] = useState('')

  async function carregar() {
    try {
      const [rp, rq] = await Promise.all([apiFetch('/api/crm/rede-consultores'), apiFetch('/api/crm/parametros-classificacao')])
      const [jp, jq] = await Promise.all([rp.json(), rq.json()])
      if (!rp.ok) throw new Error(jp.error || 'Erro ao carregar')
      setPainel(jp); setParams(rq.ok ? jq : null); setErro('')
    } catch (e) { setErro(friendlyError(e.message)) }
  }
  useEffect(() => { carregar() }, [])

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        {[['painel', 'Painel da rede'], ['parametros', 'Parâmetros']].map(([k, l]) => (
          <button key={k} type="button" onClick={() => setVista(k)}
            className={`px-3 py-1.5 text-xs font-medium rounded-lg border ${vista === k ? 'bg-surface-raised border-ink text-ink' : 'border-line text-ink-muted hover:text-ink'}`}>{l}</button>
        ))}
      </div>
      {erro && <p className="text-sm text-danger flex items-center gap-1.5"><AlertCircle className="w-4 h-4" />{erro}</p>}
      {!painel && !erro && <div className="py-10 text-center text-ink-muted"><Loader2 className="w-5 h-5 animate-spin inline" /></div>}
      {painel && vista === 'painel' && <Painel p={painel} />}
      {params && vista === 'parametros' && <Parametros inicial={params.valores} versao={params.versao} onSaved={carregar} />}
    </div>
  )
}
