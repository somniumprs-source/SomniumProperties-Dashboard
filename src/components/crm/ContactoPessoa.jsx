/**
 * Próximos passos da pessoa (consultor ou investidor): o contacto único.
 *
 * A lead é a pessoa, o imóvel é o assunto. Cada pessoa tem, no máximo, um
 * próximo contacto por fazer — a mesma tarefa que aparece na agenda e no Google
 * Calendar — com os imóveis a tratar como assuntos. Daqui agenda-se, dá-se
 * como feito ou regista-se "sem sucesso"; o que não ficou tratado segue para o
 * contacto seguinte. O histórico junta os contactos novos e os registos antigos.
 */
import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Phone, RefreshCw, Check, X, ChevronDown, ChevronUp } from 'lucide-react'
import { apiFetch } from '../../lib/api.js'
import { useRefreshOnMutation } from '../../hooks/useRefreshOnMutation.js'
import { inputClass, fmtQuando, fmtDia, emDias, agoraLocal, comHora } from './passosUtil.js'

const ROTA = { consultor: 'consultores', investidor: 'investidores' }
const CANAIS = ['Chamada', 'WhatsApp', 'Email', 'Reunião']
const btn = 'text-xs font-medium px-2 py-1 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50'
const nomeAssunto = a => a.imovel_nome || a.texto || 'Imóvel'
const limpaNota = n => String(n || '').replace(/^\[[^\]]+\]\s*/, '')

// Lista de assuntos em edição: imóveis (escolhidos da lista) e notas livres.
function AssuntosEditor({ itens, setItens, opcoes }) {
  const [texto, setTexto] = useState('')
  const usados = new Set(itens.map(a => a.imovel_id).filter(Boolean))
  const livres = (opcoes || []).filter(o => !usados.has(o.id))
  const juntarTexto = () => { if (texto.trim()) { setItens([...itens, { texto: texto.trim() }]); setTexto('') } }
  return (
    <div>
      {itens.length > 0 && (
        <div className="flex flex-wrap gap-1 mb-1.5">
          {itens.map((a, i) => (
            <span key={a.id || `${a.imovel_id || a.texto}-${i}`} className="inline-flex items-center gap-1 text-[11px] rounded-full border border-gray-200 bg-white px-2 py-0.5 text-gray-700">
              {nomeAssunto(a)}
              <button type="button" onClick={() => setItens(itens.filter((_, j) => j !== i))} aria-label={`Retirar ${nomeAssunto(a)}`} className="text-gray-400 hover:text-red-600">
                <X className="w-3 h-3" />
              </button>
            </span>
          ))}
        </div>
      )}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
        <select value="" className={inputClass} aria-label="Juntar imóvel como assunto"
          onChange={e => { const o = livres.find(x => x.id === e.target.value); if (o) setItens([...itens, { imovel_id: o.id, imovel_nome: o.nome }]) }}>
          <option value="">+ imóvel…</option>
          {livres.map(o => <option key={o.id} value={o.id}>{o.nome}</option>)}
        </select>
        <input type="text" value={texto} onChange={e => setTexto(e.target.value)} onBlur={juntarTexto}
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); juntarTexto() } }}
          placeholder="+ outro assunto (Enter)" className={inputClass} aria-label="Juntar outro assunto" />
      </div>
    </div>
  )
}

// modo: 'agendar' (marcar ou mudar o contacto), 'feito' ou 'sem_sucesso'.
function ContactoForm({ tipo, pessoaId, modo, proximo, rotulo, opcoes, onCancel, onDone }) {
  const marcados = proximo?.assuntos || []
  const dataMarcada = String(proximo?.quando || '').slice(0, 10)
  const [data, setData] = useState(modo === 'agendar' && dataMarcada ? dataMarcada : modo === 'feito' ? '' : emDias(1))
  const [hora, setHora] = useState('')
  const [assuntos, setAssuntos] = useState(marcados)
  const [quando, setQuando] = useState(agoraLocal())
  const [canal, setCanal] = useState('Chamada')
  const [finalidade, setFinalidade] = useState('follow_up')
  const [tratados, setTratados] = useState(marcados.map(a => a.id))
  const [novos, setNovos] = useState([])
  const [notas, setNotas] = useState('')
  const [saving, setSaving] = useState(false)
  const [erro, setErro] = useState('')

  async function guardar(e) {
    e.preventDefault()
    if (modo !== 'feito' && !data) return setErro('Indica a data.')
    if (modo === 'sem_sucesso' && !notas.trim()) return setErro('Indica o motivo.')
    setErro(''); setSaving(true)
    const limpos = lista => lista.map(a => (a.imovel_id ? { imovel_id: a.imovel_id } : { texto: a.texto }))
    const prox = data ? { data, quando: comHora(data, hora) } : null
    const [caminho, corpo] = modo === 'agendar'
      ? ['agendar', { data, quando: comHora(data, hora), assuntos: limpos(assuntos) }]
      : modo === 'sem_sucesso'
        ? ['registar', { resultado: 'Sem sucesso', notas, proximo: prox }]
        : ['registar', { resultado: 'Feito', quando: quando ? new Date(quando).toISOString() : null, canal, finalidade, notas, tratados, novos: limpos(novos), proximo: prox }]
    try {
      const r = await apiFetch(`/api/crm/${ROTA[tipo]}/${pessoaId}/contacto/${caminho}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corpo),
      })
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || 'Erro ao guardar')
      onDone?.()
    } catch (err) {
      setErro(err.message)
    } finally {
      setSaving(false)
    }
  }

  const rotuloMin = rotulo.toLowerCase()
  return (
    <form onSubmit={guardar} className="mt-2 rounded-lg border border-yellow-200 bg-yellow-50/50 p-2.5 grid gap-2">
      <p className="text-xs text-gray-600">
        {modo === 'agendar' ? `Fica como tarefa na agenda. Só há um ${rotuloMin} por pessoa: os imóveis a tratar entram como assuntos.`
          : modo === 'sem_sucesso' ? `Fica registado como tentado hoje (${fmtDia(emDias(0))}) sem sucesso. Os assuntos seguem para a nova data.`
          : 'Fica no histórico. O que não foi tratado segue para o contacto seguinte.'}
      </p>

      {modo === 'feito' && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            <label className="text-[11px] text-gray-500">Quando
              <input type="datetime-local" value={quando} onChange={e => setQuando(e.target.value)} className={inputClass} />
            </label>
            <label className="text-[11px] text-gray-500">Canal
              <select value={canal} onChange={e => setCanal(e.target.value)} className={inputClass}>
                {CANAIS.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </label>
            {tipo === 'investidor' && (
              <label className="text-[11px] text-gray-500">Finalidade
                <select value={finalidade} onChange={e => setFinalidade(e.target.value)} className={inputClass}>
                  <option value="discovery">Discovery</option>
                  <option value="follow_up">Follow Up</option>
                </select>
              </label>
            )}
          </div>
          {marcados.length > 0 && (
            <div>
              <p className="text-[11px] text-gray-500 mb-1">Assuntos tratados</p>
              <div className="flex flex-wrap gap-x-3 gap-y-1">
                {marcados.map(a => (
                  <label key={a.id} className="inline-flex items-center gap-1.5 text-xs text-gray-700">
                    <input type="checkbox" checked={tratados.includes(a.id)}
                      onChange={e => setTratados(e.target.checked ? [...tratados, a.id] : tratados.filter(x => x !== a.id))} />
                    {nomeAssunto(a)}
                  </label>
                ))}
              </div>
            </div>
          )}
          <div>
            <p className="text-[11px] text-gray-500 mb-1">Outros assuntos que surgiram</p>
            <AssuntosEditor itens={novos} setItens={setNovos} opcoes={opcoes} />
          </div>
        </>
      )}

      {modo !== 'agendar' && (
        <textarea rows={2} value={notas} onChange={e => setNotas(e.target.value)} autoFocus
          placeholder={modo === 'sem_sucesso' ? 'Motivo (ex.: não atendeu)' : 'Notas da conversa'} className={inputClass} aria-label="Notas" />
      )}

      <div>
        <p className="text-[11px] text-gray-500 mb-1">
          {modo === 'agendar' ? 'Data do contacto' : modo === 'sem_sucesso' ? 'Nova data' : 'Próximo contacto (opcional)'}
        </p>
        <div className="flex flex-wrap items-center gap-1.5">
          <input type="date" value={data} onChange={e => setData(e.target.value)} className={`${inputClass} sm:w-40`} aria-label="Data" />
          <input type="time" value={hora} onChange={e => setHora(e.target.value)} className={`${inputClass} sm:w-28`} aria-label="Hora (opcional)" title="Hora (opcional)" />
          {[[1, 'Amanhã'], [3, '3 dias'], [7, '1 semana'], [14, '2 semanas']].map(([n, r]) => (
            <button key={n} type="button" onClick={() => setData(emDias(n))}
              className={`px-2 py-0.5 text-[11px] rounded-full border ${data === emDias(n) ? 'border-yellow-400 bg-yellow-100 text-yellow-800' : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50'}`}>
              {r}
            </button>
          ))}
        </div>
      </div>

      {modo === 'agendar' && (
        <div>
          <p className="text-[11px] text-gray-500 mb-1">Assuntos a tratar</p>
          <AssuntosEditor itens={assuntos} setItens={setAssuntos} opcoes={opcoes} />
        </div>
      )}

      {erro && <p className="text-xs text-red-600">{erro}</p>}
      <div className="flex justify-end gap-1.5">
        <button type="button" onClick={onCancel} disabled={saving}
          className="px-3 py-1.5 text-xs font-medium rounded-lg border border-gray-200 bg-white text-gray-600 hover:bg-gray-50 disabled:opacity-50">
          Cancelar
        </button>
        <button type="submit" disabled={saving}
          className="px-3 py-1.5 text-xs font-semibold rounded-lg disabled:opacity-50" style={{ backgroundColor: '#1A1A1A', color: '#C9A84C' }}>
          {saving ? 'A guardar…' : 'Guardar'}
        </button>
      </div>
    </form>
  )
}

// imoveis: imóveis já ligados à pessoa (para escolher como assunto). Sem eles,
// usa a lista de todos os imóveis.
export function ContactoPessoa({ tipo, pessoaId, imoveis, onNavigate, onUpdate }) {
  const [modo, setModo] = useState(null) // 'agendar' | 'feito' | 'sem_sucesso'
  const [verHistorico, setVerHistorico] = useState(false)
  const query = useQuery({
    queryKey: ['contacto-pessoa', tipo, pessoaId],
    queryFn: async () => {
      const r = await apiFetch(`/api/crm/${ROTA[tipo]}/${pessoaId}/contacto`)
      return r.ok ? r.json() : null
    },
  })
  const todos = useQuery({
    queryKey: ['lookup-imoveis'],
    enabled: !!modo && !(imoveis?.length > 0),
    queryFn: async () => {
      const r = await apiFetch('/api/crm/lookup/imoveis')
      return r.ok ? r.json() : []
    },
  })
  useRefreshOnMutation(() => query.refetch())
  const d = query.data
  if (!d) return null
  const { proximo, rotulo } = d
  const historico = Array.isArray(d.historico) ? d.historico : []
  const opcoes = (imoveis?.length > 0 ? imoveis : Array.isArray(todos.data) ? todos.data : []).map(i => ({ id: i.id, nome: i.nome }))
  const atrasado = proximo?.quando && new Date(proximo.quando).getTime() < Date.now() - 86400000
  const Icon = rotulo === 'Follow-up' ? RefreshCw : Phone

  function guardado() {
    setModo(null)
    query.refetch()
    onUpdate?.()
  }

  return (
    <div className="border-b border-gray-200 dark:border-neutral-800 px-4 sm:px-6 py-2.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-sm font-semibold text-gray-800 dark:text-neutral-100">Próximos passos</span>
        <span className="flex flex-wrap gap-1.5">
          {!proximo && <button type="button" onClick={() => setModo('agendar')} className={btn}>Agendar {rotulo.toLowerCase()}</button>}
          {!proximo && <button type="button" onClick={() => setModo('feito')} className={btn}>Registar contacto feito</button>}
        </span>
      </div>

      {!proximo ? (
        <p className="text-xs text-gray-400 mt-1.5">Sem contacto marcado.</p>
      ) : (
        <div className="mt-2 grid gap-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-sm">
            <span className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide rounded px-1.5 py-0.5 bg-yellow-50 text-yellow-700">
              <Icon className="w-3 h-3" /> {rotulo}
            </span>
            <span className={`font-medium tabular-nums ${atrasado ? 'text-orange-700' : 'text-gray-800 dark:text-neutral-100'}`}>{fmtQuando(proximo.quando)}</span>
            {atrasado && <span className="text-xs text-orange-700">em atraso</span>}
            {proximo.funcionario && <span className="text-xs text-gray-400">{proximo.funcionario}</span>}
            <span className="ml-auto inline-flex flex-wrap gap-1.5">
              <button type="button" onClick={() => setModo('feito')}
                className="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-lg bg-green-50 text-green-700 hover:bg-green-100 border border-green-200">
                <Check className="w-3 h-3" /> Feito
              </button>
              <button type="button" onClick={() => setModo('sem_sucesso')}
                className="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-lg bg-orange-50 text-orange-700 hover:bg-orange-100 border border-orange-200">
                <X className="w-3 h-3" /> Sem sucesso
              </button>
              <button type="button" onClick={() => setModo('agendar')} className="text-xs font-medium px-2 py-0.5 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50">
                Mudar data ou assuntos
              </button>
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-1 text-xs text-gray-500">
            <span>Assuntos:</span>
            {proximo.assuntos.length === 0 && <span className="text-gray-400">nenhum indicado</span>}
            {proximo.assuntos.map(a => a.imovel_id ? (
              <button key={a.id} type="button" onClick={() => onNavigate?.('Imóveis', a.imovel_id)}
                className="rounded-full border border-gray-200 bg-white px-2 py-0.5 text-[11px] text-gray-700 hover:border-yellow-300">
                {a.imovel_nome}{a.imovel_estado ? ` · ${String(a.imovel_estado).replace(/^\d+-\s*/, '')}` : ''}
              </button>
            ) : (
              <span key={a.id} className="rounded-full border border-gray-200 bg-white px-2 py-0.5 text-[11px] text-gray-700">{a.texto}</span>
            ))}
          </div>
        </div>
      )}

      {modo && (
        <ContactoForm key={modo} tipo={tipo} pessoaId={pessoaId} modo={modo} proximo={proximo} rotulo={rotulo} opcoes={opcoes}
          onCancel={() => setModo(null)} onDone={guardado} />
      )}

      {historico.length > 0 && (
        <div className="mt-2">
          <button type="button" onClick={() => setVerHistorico(v => !v)} className="inline-flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700">
            {verHistorico ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
            Histórico de contactos ({historico.length})
          </button>
          {verHistorico && (
            <ul className="mt-1.5 grid gap-1 max-h-72 overflow-y-auto">
              {historico.map(h => (
                <li key={h.id} className="flex flex-wrap items-baseline gap-x-2 text-xs">
                  <span className="font-medium tabular-nums text-gray-700">{fmtDia(h.quando)}</span>
                  {h.resultado
                    ? <span className={h.resultado === 'Feito' ? 'text-green-700' : 'text-orange-700'}>{h.resultado}</span>
                    : <span className="text-gray-500">Registo</span>}
                  {h.canal && <span className="text-gray-500">{h.canal}</span>}
                  {h.assuntos?.length > 0 && <span className="text-gray-700">{h.assuntos.map(nomeAssunto).join(', ')}</span>}
                  {h.notas && <span className="text-gray-600 min-w-0 break-words">{limpaNota(h.notas)}</span>}
                  {h.proxima_data && <span className="text-gray-400">seguinte a {fmtDia(h.proxima_data)}</span>}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}
