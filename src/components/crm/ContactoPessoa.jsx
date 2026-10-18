/**
 * Próximos passos da pessoa (consultor, investidor ou parceiro): o contacto único.
 * Cada contacto tem um tipo (Cold Call, Discovery Call ou Follow-up), que dá a
 * categoria e o título da tarefa na agenda; sugere-se o da fase da pessoa.
 *
 * A lead é a pessoa, o imóvel é o assunto. Cada pessoa tem, no máximo, um
 * próximo contacto por fazer — a mesma tarefa que aparece na agenda e no Google
 * Calendar — com os imóveis a tratar como assuntos. Daqui agenda-se, dá-se
 * como feito ou regista-se "sem sucesso"; o que não ficou tratado segue para o
 * contacto seguinte. O histórico junta os contactos novos e os registos antigos.
 *
 * No contacto feito com um consultor regista-se também, sem sair daqui, o que
 * ele enviou a seguir à chamada: cada oportunidade cria o imóvel em
 * «Pré-aprovação», já ligado a ele como referência, e fica como assunto do
 * contacto. A gravação da conversa, se houver, anexa-se no mesmo passo.
 */
import { useState, useRef } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Phone, RefreshCw, Check, X, ChevronDown, ChevronUp, Mic, Upload, Plus, Pencil } from 'lucide-react'
import { apiFetch } from '../../lib/api.js'
import { useRefreshOnMutation } from '../../hooks/useRefreshOnMutation.js'
import { inputClass, fmtQuando, fmtDia, emDias, agoraLocal, comHora } from './passosUtil.js'

const ROTA = { consultor: 'consultores', investidor: 'investidores', parceiro: 'parceiros' }
// Espelho de TIPOS_CONTACTO em src/db/contactoPessoa.js.
const TIPOS = { cold_call: 'Cold Call', discovery_call: 'Discovery Call', follow_up: 'Follow-up' }
const CANAIS = ['Chamada', 'WhatsApp', 'Email', 'Reunião']
const btn = 'text-xs font-medium px-2 py-1 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50'
const nomeAssunto = a => a.imovel_nome || a.texto || 'Imóvel'
const PREFIXO = /^\[[^\]]+\]\s*/ // etiqueta automática, ex.: «[REACTIVAÇÃO EMAIL]»
const limpaNota = n => String(n || '').replace(PREFIXO, '')
// Dia e, quando a houver, a hora do contacto.
const fmtContacto = v => {
  if (!/T\d{2}:\d{2}/.test(String(v || ''))) return fmtDia(v)
  const d = new Date(v)
  return isNaN(d) ? fmtDia(v) : d.toLocaleString('pt-PT', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

// Uma linha do histórico. A nota corrige-se no sítio: o campo só aparece ao
// clicar no lápis (ou em «+ nota», se o contacto ficou sem nota).
function HistoricoItem({ h, rota, pessoaId, onSaved }) {
  const [editar, setEditar] = useState(false)
  const [texto, setTexto] = useState('')
  const [saving, setSaving] = useState(false)
  const [erro, setErro] = useState('')
  const prefixo = String(h.notas || '').match(PREFIXO)?.[0] || ''

  function abrir() { setTexto(limpaNota(h.notas)); setErro(''); setEditar(true) }
  async function guardar() {
    setSaving(true); setErro('')
    try {
      const corpo = texto.trim() ? `${prefixo}${texto.trim()}` : ''
      const r = await apiFetch(`/api/crm/${rota}/${pessoaId}/contacto/historico/${encodeURIComponent(h.id)}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ notas: corpo }),
      })
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || 'Erro ao guardar')
      setEditar(false)
      onSaved?.()
    } catch (err) {
      setErro(err.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <li className="group text-xs">
      <div className="flex flex-wrap items-baseline gap-x-2">
        <span className="font-medium tabular-nums text-gray-700">{fmtContacto(h.quando)}</span>
        {h.resultado
          ? <span className={h.resultado === 'Feito' ? 'text-green-700' : 'text-orange-700'}>{h.resultado}</span>
          : <span className="text-gray-500">Registo</span>}
        {h.canal && <span className="text-gray-500">{h.canal}</span>}
        {h.assuntos?.length > 0 && <span className="text-gray-700">{h.assuntos.map(nomeAssunto).join(', ')}</span>}
        {!editar && h.notas && <span className="text-gray-600 min-w-0 break-words whitespace-pre-line">{limpaNota(h.notas)}</span>}
        {h.proxima_data && <span className="text-gray-400">seguinte a {fmtDia(h.proxima_data)}</span>}
        {!editar && (h.notas ? (
          <button type="button" onClick={abrir} aria-label="Editar nota" title="Editar nota"
            className="self-center text-gray-300 hover:text-yellow-700 sm:opacity-0 sm:group-hover:opacity-100 focus:opacity-100">
            <Pencil className="w-3 h-3" />
          </button>
        ) : (
          <button type="button" onClick={abrir} className="text-[11px] text-gray-400 hover:text-yellow-700">+ nota</button>
        ))}
      </div>
      {editar && (
        <div className="mt-1 grid gap-1">
          <textarea rows={2} value={texto} onChange={e => setTexto(e.target.value)} autoFocus aria-label="Nota do contacto"
            onKeyDown={e => {
              if (e.key === 'Escape') setEditar(false)
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); guardar() }
            }}
            placeholder="Nota do contacto" className={inputClass} />
          {erro && <p className="text-red-600">{erro}</p>}
          <div className="flex justify-end gap-1.5">
            <button type="button" onClick={() => setEditar(false)} disabled={saving} className={btn}>Cancelar</button>
            <button type="button" onClick={guardar} disabled={saving}
              className="text-xs font-semibold px-2 py-1 rounded-lg disabled:opacity-50" style={{ backgroundColor: '#1A1A1A', color: '#C9A84C' }}>
              {saving ? 'A guardar…' : 'Guardar nota'}
            </button>
          </div>
        </div>
      )}
    </li>
  )
}

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

const OPORTUNIDADE_VAZIA = { nome: '', link: '', preco: '', tipologia: '', tipo: 'Market' }

// Oportunidades que o consultor enviou a seguir à chamada: o mínimo para o
// imóvel entrar em «Pré-aprovação»; o resto da ficha completa-se depois.
function OportunidadesEditor({ itens, setItens }) {
  const set = (i, k, v) => setItens(itens.map((o, j) => (j === i ? { ...o, [k]: v } : o)))
  return (
    <div className="rounded-lg border border-dashed border-yellow-300 bg-white/60 p-2 grid gap-1.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[11px] font-semibold text-gray-700">Oportunidades enviadas nesta chamada</p>
        <span className="text-[10px] font-semibold uppercase tracking-wide rounded px-1.5 py-0.5 bg-blue-50 text-blue-700">entram em Pré-aprovação</span>
      </div>
      {itens.map((o, i) => (
        <div key={i} className="grid grid-cols-2 sm:grid-cols-[1.4fr_1.2fr_6.5rem_5rem_7.5rem_auto] gap-1.5 items-center">
          <input type="text" value={o.nome} onChange={e => set(i, 'nome', e.target.value)} placeholder="Nome ou morada *" className={inputClass} aria-label={`Oportunidade ${i + 1}: nome ou morada`} />
          <input type="url" value={o.link} onChange={e => set(i, 'link', e.target.value)} placeholder="Link (se houver)" className={inputClass} aria-label={`Oportunidade ${i + 1}: link`} />
          <input type="number" min="0" step="any" value={o.preco} onChange={e => set(i, 'preco', e.target.value)} onWheel={e => e.target.blur()} placeholder="Preço €" className={inputClass} aria-label={`Oportunidade ${i + 1}: preço`} />
          <input type="text" value={o.tipologia} onChange={e => set(i, 'tipologia', e.target.value)} placeholder="T2…" className={inputClass} aria-label={`Oportunidade ${i + 1}: tipologia`} />
          <select value={o.tipo} onChange={e => set(i, 'tipo', e.target.value)} className={inputClass} aria-label={`Oportunidade ${i + 1}: tipo`}>
            <option value="Market">Anunciado</option>
            <option value="Off-Market">Off-market</option>
          </select>
          <button type="button" onClick={() => setItens(itens.filter((_, j) => j !== i))} aria-label={`Retirar oportunidade ${i + 1}`} className="justify-self-start text-gray-400 hover:text-red-600">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      ))}
      <button type="button" onClick={() => setItens([...itens, { ...OPORTUNIDADE_VAZIA }])}
        className="justify-self-start inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full border border-gray-200 bg-white text-gray-600 hover:bg-gray-50">
        <Plus className="w-3 h-3" /> {itens.length ? 'outra oportunidade' : 'registar oportunidade'}
      </button>
    </div>
  )
}

// modo: 'agendar' (marcar ou mudar o contacto), 'feito' ou 'sem_sucesso'.
// pessoa: { nome, regiao } — para ligar ao consultor as oportunidades registadas.
function ContactoForm({ tipo, pessoaId, pessoa, modo, proximo, rotulo, tipoSugerido, opcoes, onCancel, onDone }) {
  const marcados = proximo?.assuntos || []
  const dataMarcada = String(proximo?.quando || '').slice(0, 10)
  const [data, setData] = useState(modo === 'agendar' && dataMarcada ? dataMarcada : modo === 'feito' ? '' : emDias(1))
  const [hora, setHora] = useState('')
  const [assuntos, setAssuntos] = useState(marcados)
  const [quando, setQuando] = useState(agoraLocal())
  const [canal, setCanal] = useState('Chamada')
  const [finalidade, setFinalidade] = useState(proximo?.tipo === 'discovery_call' ? 'discovery' : 'follow_up')
  // Tipo do contacto a marcar (no agendar, ou o seguinte ao registar).
  const [tipoContacto, setTipoContacto] = useState(modo === 'agendar' ? (proximo?.tipo || tipoSugerido || 'follow_up') : modo === 'sem_sucesso' ? (proximo?.tipo || tipoSugerido || 'follow_up') : 'follow_up')
  const [tratados, setTratados] = useState(marcados.map(a => a.id))
  const [novos, setNovos] = useState([])
  const [notas, setNotas] = useState('')
  const [oportunidades, setOportunidades] = useState([])
  const criadas = useRef({}) // índice → id do imóvel já criado (se o resto falhar, não se cria outra vez)
  const [audio, setAudio] = useState(null)
  const [saving, setSaving] = useState(false)
  const [erro, setErro] = useState('')
  const comExtras = modo === 'feito' && tipo === 'consultor'

  // Cria em «Pré-aprovação» os imóveis das oportunidades e devolve-os como assuntos.
  async function criarOportunidades() {
    const assuntos = []
    for (const [i, o] of oportunidades.entries()) {
      if (!criadas.current[i]) {
        const r = await apiFetch('/api/crm/imoveis', {
          method: 'POST', regiao: pessoa?.regiao || undefined, headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            nome: o.nome.trim(), link: o.link.trim() || null, ask_price: o.preco === '' ? null : Number(o.preco),
            tipologia: o.tipologia.trim() || null, tipo_oportunidade: o.tipo, estado: 'Pré-aprovação',
            origem: 'Referência por consultores', nome_consultor: pessoa?.nome || null,
            regiao: pessoa?.regiao || null, data_adicionado: emDias(0),
          }),
        })
        const j = await r.json().catch(() => ({}))
        if (!r.ok || !j.id) throw new Error(`Oportunidade «${o.nome.trim()}»: ${j.error || 'não foi possível criar o imóvel'}`)
        criadas.current[i] = j.id
      }
      assuntos.push({ imovel_id: criadas.current[i] })
    }
    return assuntos
  }

  async function guardar(e) {
    e.preventDefault()
    if (modo !== 'feito' && !data) return setErro('Indica a data.')
    if (modo === 'sem_sucesso' && !notas.trim()) return setErro('Indica o motivo.')
    if (oportunidades.some(o => !o.nome.trim())) return setErro('Indica o nome ou a morada de cada oportunidade (ou retira a linha vazia).')
    if (oportunidades.length && !pessoa?.regiao) return setErro('O consultor não tem região (Coimbra ou AMP): preenche-a na ficha antes de registar oportunidades.')
    setErro(''); setSaving(true)
    const limpos = lista => lista.map(a => (a.imovel_id ? { imovel_id: a.imovel_id } : { texto: a.texto }))
    const prox = data ? { data, quando: comHora(data, hora), tipo: tipoContacto } : null
    let novosImoveis = []
    if (comExtras && oportunidades.length) {
      try { novosImoveis = await criarOportunidades() } catch (err) { setErro(err.message); setSaving(false); return }
    }
    const [caminho, corpo] = modo === 'agendar'
      ? ['agendar', { data, quando: comHora(data, hora), assuntos: limpos(assuntos), tipo_contacto: tipoContacto }]
      : modo === 'sem_sucesso'
        ? ['registar', { resultado: 'Sem sucesso', notas, proximo: prox }]
        : ['registar', { resultado: 'Feito', quando: quando ? new Date(quando).toISOString() : null, canal, finalidade, notas, tratados, novos: [...limpos(novos), ...novosImoveis], proximo: prox }]
    try {
      const r = await apiFetch(`/api/crm/${ROTA[tipo]}/${pessoaId}/contacto/${caminho}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corpo),
      })
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || 'Erro ao guardar')
      // Gravação da conversa: fica nas gravações do consultor, transcrita e analisada.
      if (comExtras && audio) {
        const fd = new FormData()
        fd.append('audio', audio)
        fd.append('titulo', notas.trim().slice(0, 80) || `Contacto ${fmtDia(String(quando || '').slice(0, 10) || emDias(0))}`)
        fd.append('data_chamada', String(quando || '').slice(0, 10) || emDias(0))
        const ru = await apiFetch(`/api/crm/consultores/${pessoaId}/gravacoes`, { method: 'POST', body: fd }).catch(() => null)
        if (!ru?.ok) alert(`O contacto ficou registado, mas a gravação não foi carregada: ${(await ru?.json().catch(() => ({})))?.error || 'erro no envio'}`)
      }
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
          {comExtras && <OportunidadesEditor itens={oportunidades} setItens={setOportunidades} />}
        </>
      )}

      {comExtras && (
        <div>
          <input type="file" id={`audio-contacto-${pessoaId}`} className="hidden"
            accept="audio/*,.mp3,.m4a,.wav,.aac,.ogg,.opus,.flac,.mp4,.webm"
            onChange={e => setAudio(e.target.files?.[0] || null)} />
          {audio ? (
            <div className="flex items-center gap-2 px-2 py-1.5 rounded-lg border border-yellow-200 bg-yellow-50 text-xs text-yellow-800">
              <Mic className="w-3.5 h-3.5 shrink-0" />
              <span className="truncate flex-1">{audio.name}</span>
              <button type="button" onClick={() => setAudio(null)} className="text-yellow-700 hover:text-red-600 shrink-0" aria-label="Retirar gravação">
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          ) : (
            <label htmlFor={`audio-contacto-${pessoaId}`}
              className="inline-flex items-center gap-1.5 px-2 py-1 rounded-lg border border-dashed border-gray-300 text-xs text-gray-500 cursor-pointer hover:border-yellow-300 hover:text-yellow-700">
              <Upload className="w-3.5 h-3.5" /> Anexar gravação da conversa (opcional)
            </label>
          )}
        </div>
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
        {(modo !== 'feito' || data) && (
          <div className="flex flex-wrap items-center gap-1.5 mt-1.5" role="radiogroup" aria-label="Tipo de contacto">
            <span className="text-[11px] text-gray-500">Tipo</span>
            {Object.entries(TIPOS).map(([k, r]) => (
              <button key={k} type="button" role="radio" aria-checked={tipoContacto === k} onClick={() => setTipoContacto(k)}
                className={`px-2 py-0.5 text-[11px] rounded-full border ${tipoContacto === k ? 'border-yellow-400 bg-yellow-100 text-yellow-800' : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50'}`}>
                {r}
              </button>
            ))}
          </div>
        )}
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

// Registo simples de um contacto com o consultor: data e motivo. Vai directo
// ao histórico, sem mexer no próximo contacto marcado nem nos seus assuntos.
// Com reunião: marca-a como o próximo contacto da pessoa (tarefa na agenda),
// com a reunião como assunto, mantendo os assuntos que já lá estavam.
function NovoContactoForm({ pessoaId, proximo, onCancel, onDone }) {
  const [data, setData] = useState(emDias(0))
  const [motivo, setMotivo] = useState('')
  const [comReuniao, setComReuniao] = useState(false)
  const [dataReuniao, setDataReuniao] = useState('')
  const [horaReuniao, setHoraReuniao] = useState('')
  const [assuntoReuniao, setAssuntoReuniao] = useState('Reunião de parceria')
  const [saving, setSaving] = useState(false)
  const [erro, setErro] = useState('')

  async function guardar(e) {
    e.preventDefault()
    if (!data) return setErro('Indica a data.')
    if (!motivo.trim()) return setErro('Indica o motivo do contacto.')
    if (comReuniao && !dataReuniao) return setErro('Indica a data da reunião.')
    if (comReuniao && dataReuniao < emDias(0)) return setErro('A reunião tem de ser numa data futura.')
    setErro(''); setSaving(true)
    try {
      const r = await apiFetch('/api/crm/consultor-interacoes', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          consultor_id: pessoaId, canal: 'Chamada', direcao: 'Enviado', resultado: 'Feito', notas: motivo.trim(),
          proxima_data: comReuniao ? dataReuniao : null,
          data_hora: data === emDias(0) ? new Date().toISOString() : new Date(`${data}T12:00:00`).toISOString(),
        }),
      })
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || 'Erro ao guardar')
      if (comReuniao) {
        const texto = `${assuntoReuniao.trim() || 'Reunião'}${horaReuniao ? ` (${horaReuniao})` : ''}`
        const atuais = (proximo?.assuntos || []).map(a => (a.imovel_id ? { imovel_id: a.imovel_id } : { texto: a.texto }))
        const ra = await apiFetch(`/api/crm/consultores/${pessoaId}/contacto/agendar`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ data: dataReuniao, quando: comHora(dataReuniao, horaReuniao), assuntos: [...atuais, { texto }] }),
        }).catch(() => null)
        if (!ra?.ok) alert(`O contacto ficou registado, mas a reunião não foi agendada: ${(await ra?.json().catch(() => ({})))?.error || 'erro no envio'}`)
      }
      onDone?.()
    } catch (err) {
      setErro(err.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={guardar} className="mt-2 rounded-lg border border-yellow-200 bg-yellow-50/50 p-2.5 grid gap-2">
      <p className="text-xs text-gray-600">Fica no histórico de contactos deste consultor.</p>
      <label className="text-[11px] text-gray-500">Data do contacto
        <input type="date" value={data} max={emDias(0)} onChange={e => setData(e.target.value)} className={`${inputClass} sm:w-40`} />
      </label>
      <textarea rows={2} value={motivo} onChange={e => setMotivo(e.target.value)} autoFocus
        placeholder="Motivo do contacto e o que foi falado" className={inputClass} aria-label="Motivo do contacto" />
      <label className="inline-flex items-center gap-1.5 text-xs text-gray-700">
        <input type="checkbox" checked={comReuniao} onChange={e => setComReuniao(e.target.checked)} />
        Agendar reunião (fica como tarefa na agenda)
      </label>
      {comReuniao && (
        <div className="grid gap-1.5">
          <div className="flex flex-wrap items-center gap-1.5">
            <input type="date" value={dataReuniao} min={emDias(0)} onChange={e => setDataReuniao(e.target.value)} className={`${inputClass} sm:w-40`} aria-label="Data da reunião" />
            <input type="time" value={horaReuniao} onChange={e => setHoraReuniao(e.target.value)} className={`${inputClass} sm:w-28`} aria-label="Hora da reunião (opcional)" title="Hora (opcional)" />
            <input type="text" value={assuntoReuniao} onChange={e => setAssuntoReuniao(e.target.value)} placeholder="Assunto da reunião" className={`${inputClass} sm:flex-1 sm:w-auto`} aria-label="Assunto da reunião" />
          </div>
          {proximo?.quando && (
            <p className="text-[11px] text-orange-700">Já há um contacto marcado para {fmtQuando(proximo.quando)}: passa para a data da reunião, com os mesmos assuntos.</p>
          )}
        </div>
      )}
      {erro && <p className="text-xs text-red-600">{erro}</p>}
      <div className="flex justify-end gap-1.5">
        <button type="button" onClick={onCancel} disabled={saving} className={btn}>Cancelar</button>
        <button type="submit" disabled={saving}
          className="text-xs font-medium px-3 py-1 rounded-lg bg-yellow-600 text-white hover:bg-yellow-700 disabled:opacity-50">
          {saving ? 'A guardar…' : 'Guardar contacto'}
        </button>
      </div>
    </form>
  )
}

// imoveis: imóveis já ligados à pessoa (para escolher como assunto). Sem eles,
// usa a lista de todos os imóveis.
// notaAntiga: texto do antigo campo "Próxima ação" do investidor. Mostra-se até
// haver contacto marcado e entra como assunto ao agendar (o campo é então limpo).
// regiao: região da pessoa (consultor), para os imóveis das oportunidades registadas.
export function ContactoPessoa({ tipo, pessoaId, imoveis, regiao, notaAntiga, onNavigate, onUpdate }) {
  const [modo, setModo] = useState(null) // 'agendar' | 'feito' | 'sem_sucesso' | 'novo' (registo simples, só consultor)
  const [verHistorico, setVerHistorico] = useState(tipo === 'consultor')
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
  const { proximo, rotulo, tipo_sugerido: tipoSugerido } = d
  const etiqueta = proximo?.assuntos?.some(a => a.imovel_id) ? 'Follow-up' : TIPOS[proximo?.tipo] || rotulo
  const historico = Array.isArray(d.historico) ? d.historico : []
  const opcoes = (imoveis?.length > 0 ? imoveis : Array.isArray(todos.data) ? todos.data : []).map(i => ({ id: i.id, nome: i.nome }))
  const atrasado = proximo?.quando && new Date(proximo.quando).getTime() < Date.now() - 86400000
  const Icon = etiqueta === 'Follow-up' ? RefreshCw : Phone

  const nota = !proximo ? (notaAntiga || '').trim() : ''
  async function guardado() {
    if (nota && modo === 'agendar') {
      await apiFetch(`/api/crm/${ROTA[tipo]}/${pessoaId}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ proxima_acao: null }),
      }).catch(() => {})
    }
    setModo(null)
    query.refetch()
    onUpdate?.()
  }

  return (
    <div className="border-b border-gray-200 dark:border-neutral-800 px-4 sm:px-6 py-2.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-sm font-semibold text-gray-800 dark:text-neutral-100">Próximos passos</span>
        <span className="flex flex-wrap gap-1.5">
          {tipo === 'consultor' && (
            <button type="button" onClick={() => setModo('novo')}
              className="inline-flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-lg bg-yellow-600 text-white hover:bg-yellow-700">
              <Plus className="w-3 h-3" /> Novo contacto
            </button>
          )}
          {!proximo && <button type="button" onClick={() => setModo('agendar')} className={btn}>Agendar contacto</button>}
          {!proximo && <button type="button" onClick={() => setModo('feito')} className={btn}>Registar contacto feito</button>}
        </span>
      </div>

      {!proximo ? (
        <p className="text-xs text-gray-400 mt-1.5">
          Sem contacto marcado.
          {nota && <span className="text-gray-600"> Próxima ação anotada antes: «{nota}». Ao agendar, entra como assunto.</span>}
        </p>
      ) : (
        <div className="mt-2 grid gap-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-sm">
            <span className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide rounded px-1.5 py-0.5 bg-yellow-50 text-yellow-700">
              <Icon className="w-3 h-3" /> {etiqueta}
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

      {modo === 'novo' && <NovoContactoForm pessoaId={pessoaId} proximo={proximo} onCancel={() => setModo(null)} onDone={guardado} />}
      {modo && modo !== 'novo' && (
        <ContactoForm key={modo} tipo={tipo} pessoaId={pessoaId} pessoa={{ nome: d.pessoa?.nome, regiao }} modo={modo} rotulo={rotulo} tipoSugerido={tipoSugerido} opcoes={opcoes}
          proximo={proximo || (nota && modo === 'agendar' ? { assuntos: [{ texto: nota }] } : null)}
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
              {historico.map(h => <HistoricoItem key={h.id} h={h} rota={ROTA[tipo]} pessoaId={pessoaId} onSaved={() => query.refetch()} />)}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}
