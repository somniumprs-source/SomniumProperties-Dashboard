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
import { Phone, RefreshCw, Check, X, Mic, Upload, Plus, Pencil, MessageCircle, Mail, Users, StickyNote } from 'lucide-react'
import { apiFetch } from '../../lib/api.js'
import { useRefreshOnMutation } from '../../hooks/useRefreshOnMutation.js'
import { inputClass, fmtQuando, fmtDia, emDias, agoraLocal, comHora } from './passosUtil.js'

const ROTA = { consultor: 'consultores', investidor: 'investidores', parceiro: 'parceiros' }
// Espelho de TIPOS_CONTACTO em src/db/contactoPessoa.js.
const TIPOS = { cold_call: 'Cold Call', discovery_call: 'Discovery Call', follow_up: 'Follow-up' }
const CANAIS = ['Chamada', 'WhatsApp', 'Email', 'Reunião']
const btn = 'text-xs font-medium px-2 py-1 rounded-lg border border-line text-ink-muted hover:bg-surface'
const nomeAssunto = a => a.imovel_nome || a.texto || 'Imóvel'
const MOSTRAR = 12 // registos visíveis antes de «Ver mais antigos»
const PREFIXO = /^\[[^\]]+\]\s*/ // etiqueta automática, ex.: «[REACTIVAÇÃO EMAIL]»
const limpaNota = n => String(n || '').replace(PREFIXO, '')
// Canal tal como foi gravado (registos antigos em minúsculas) → grafia única.
const CANAL = { chamada: 'Chamada', whatsapp: 'WhatsApp', email: 'Email', 'reunião': 'Reunião', reuniao: 'Reunião', nota: 'Nota' }
const canalDe = h => (h.antigo || !h.canal ? 'Follow-up' : CANAL[String(h.canal).toLowerCase()] || h.canal)
const COR = { Chamada: '#C9A84C', WhatsApp: '#16A34A', Email: '#2563EB', 'Reunião': '#7C3AED', Nota: '#8A857A', 'Follow-up': '#B08A2E' }
const ICONE = { Chamada: Phone, WhatsApp: MessageCircle, Email: Mail, 'Reunião': Users, Nota: StickyNote, 'Follow-up': RefreshCw }
const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']

// Título curto do registo: «Call <imóvel>», «Follow Up», «Nota»… O resto só ao abrir.
function tituloDe(h) {
  const canal = canalDe(h)
  if (canal === 'Nota') return 'Nota'
  const etiqueta = String(h.notas || '').match(PREFIXO)?.[0]
  if (etiqueta) {
    const t = etiqueta.replace(/[[\]]/g, '').trim().toLowerCase().replace(/reactiva/g, 'reativa').replace(/\s*(email|whatsapp)$/, '')
    return `${canal} · ${t.charAt(0).toUpperCase()}${t.slice(1)}`
  }
  const imoveis = (h.assuntos || []).filter(a => a.imovel_id).map(nomeAssunto)
  if (imoveis.length) return `${canal === 'Chamada' || canal === 'Follow-up' ? 'Call' : canal} ${imoveis.join(', ')}`
  if (h.finalidade === 'discovery') return 'Discovery'
  return canal === 'Chamada' || canal === 'Follow-up' ? 'Follow Up' : canal
}

// Data partida para o lado oposto ao cartão: «12 jun» e «2026 · 12:30».
function dataDe(v) {
  const s = String(v || '')
  const comHoraMarcada = /T\d{2}:\d{2}/.test(s)
  const d = comHoraMarcada ? new Date(s) : null
  if (d && !isNaN(d)) {
    return { dia: `${d.getDate()} ${MESES[d.getMonth()]}`, resto: `${d.getFullYear()} · ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}` }
  }
  const [y, m, dd] = s.slice(0, 10).split('-')
  return y && m && dd ? { dia: `${+dd} ${MESES[+m - 1]}`, resto: y } : { dia: '—', resto: '' }
}

// Um registo da linha cronológica em árvore. Fechado mostra só título e data;
// ao clicar abre o detalhe, com a nota editável (o campo só aparece no lápis).
function RegistoArvore({ h, lado, rota, pessoaId, onSaved }) {
  const [aberto, setAberto] = useState(false)
  const [editar, setEditar] = useState(false)
  const [texto, setTexto] = useState('')
  const [saving, setSaving] = useState(false)
  const [erro, setErro] = useState('')
  const canal = canalDe(h)
  const cor = COR[canal] || COR.Nota
  const Icone = ICONE[canal] || StickyNote
  const { dia, resto } = dataDe(h.quando)
  const prefixo = String(h.notas || '').match(PREFIXO)?.[0] || ''
  const dir = lado === 'dir'

  function abrirEdicao() { setTexto(limpaNota(h.notas)); setErro(''); setEditar(true); setAberto(true) }
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
    <li className="relative grid grid-cols-[36px_1fr] sm:grid-cols-[1fr_44px_1fr] gap-x-3 sm:gap-x-0 items-start">
      <span className="col-start-1 row-start-1 row-span-2 sm:row-span-1 sm:col-start-2 justify-self-center z-10 w-9 h-9 rounded-full border-2 bg-surface-raised  grid place-items-center"
        style={{ borderColor: cor, color: cor }} title={canal}>
        <Icone className="w-4 h-4" />
      </span>
      <div className={`col-start-2 row-start-1 sm:row-start-1 pt-0.5 sm:pt-1.5 tabular-nums leading-tight ${dir ? 'sm:col-start-1 sm:text-right sm:pr-3' : 'sm:col-start-3 sm:pl-3'}`}>
        <span className="text-sm sm:text-base font-bold mr-1.5 sm:mr-0 sm:block" style={{ color: cor }}>{dia}</span>
        <span className="text-[11px] text-ink-muted">{resto}</span>
      </div>
      <div className={`col-start-2 row-start-2 sm:row-start-1 min-w-0 grid gap-1.5 pb-1 ${dir ? 'sm:col-start-3 sm:pl-3' : 'sm:col-start-1 sm:pr-3'}`}>
        <button type="button" onClick={() => setAberto(v => !v)} aria-expanded={aberto}
          className={`w-full rounded-lg border border-line  bg-surface-raised  px-3 py-2 hover:shadow-sm transition-shadow text-left ${dir ? '' : 'sm:text-right'}`}
          onMouseEnter={e => { e.currentTarget.style.borderColor = cor }} onMouseLeave={e => { e.currentTarget.style.borderColor = '' }}>
          <span className="block text-[10px] font-semibold uppercase tracking-wider" style={{ color: cor }}>{canal}</span>
          <span className="block text-sm font-semibold text-ink  break-words">{tituloDe(h)}</span>
        </button>
        {aberto && (
          <div className="rounded-lg bg-surface  px-3 py-2 grid gap-1.5 text-xs text-left">
            {(h.resultado || h.proxima_data || h.autor) && (
              <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                {h.resultado && <span className={h.resultado === 'Feito' ? 'text-success' : 'text-orange-700'}>{h.resultado}</span>}
                {h.proxima_data && <span className="text-ink-muted">seguinte a {fmtDia(h.proxima_data)}</span>}
                {h.autor && <span className="text-ink-muted">{h.autor}</span>}
              </div>
            )}
            {h.assuntos?.some(a => !a.imovel_id) && (
              <p className="text-ink-muted">Assuntos: {h.assuntos.filter(a => !a.imovel_id).map(nomeAssunto).join(', ')}</p>
            )}
            {editar ? (
              <div className="grid gap-1">
                <textarea rows={3} value={texto} onChange={e => setTexto(e.target.value)} autoFocus aria-label="Nota"
                  onKeyDown={e => {
                    if (e.key === 'Escape') setEditar(false)
                    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); guardar() }
                  }}
                  placeholder="Nota" className={inputClass} />
                {erro && <p className="text-danger">{erro}</p>}
                <div className="flex justify-end gap-1.5">
                  <button type="button" onClick={() => setEditar(false)} disabled={saving} className={btn}>Cancelar</button>
                  <button type="button" onClick={guardar} disabled={saving}
                    className="text-xs font-semibold px-2 py-1 rounded-lg disabled:opacity-50 bg-ink text-surface hover:opacity-90">
                    {saving ? 'A guardar…' : 'Guardar nota'}
                  </button>
                </div>
              </div>
            ) : h.notas ? (
              <div className="flex items-start justify-between gap-2">
                <p className="text-ink  whitespace-pre-line break-words min-w-0">{limpaNota(h.notas)}</p>
                <button type="button" onClick={abrirEdicao} aria-label="Editar nota" title="Editar nota" className="shrink-0 text-ink-muted hover:text-warning">
                  <Pencil className="w-3.5 h-3.5" />
                </button>
              </div>
            ) : (
              <button type="button" onClick={abrirEdicao} className="justify-self-start text-ink-muted hover:text-warning">+ nota</button>
            )}
          </div>
        )}
      </div>
    </li>
  )
}

// Nota solta: fica na linha do tempo, mas não conta como contacto.
function NotaForm({ rota, pessoaId, onCancel, onDone }) {
  const [texto, setTexto] = useState('')
  const [saving, setSaving] = useState(false)
  const [erro, setErro] = useState('')
  async function guardar(e) {
    e.preventDefault()
    if (!texto.trim()) return setErro('Escreve a nota.')
    setSaving(true); setErro('')
    try {
      const r = await apiFetch(`/api/crm/${rota}/${pessoaId}/contacto/nota`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ notas: texto.trim() }),
      })
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || 'Erro ao guardar')
      onDone?.()
    } catch (err) {
      setErro(err.message)
    } finally {
      setSaving(false)
    }
  }
  return (
    <form onSubmit={guardar} className="mt-2 rounded-lg border border-warning/30 bg-warning/10 p-2.5 grid gap-2">
      <textarea rows={3} value={texto} onChange={e => setTexto(e.target.value)} autoFocus placeholder="Escreve a nota" aria-label="Nova nota" className={inputClass}
        onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) guardar(e) }} />
      {erro && <p className="text-xs text-danger">{erro}</p>}
      <div className="flex justify-end gap-1.5">
        <button type="button" onClick={onCancel} disabled={saving} className={btn}>Cancelar</button>
        <button type="submit" disabled={saving}
          className="px-3 py-1.5 text-xs font-semibold rounded-lg disabled:opacity-50 bg-ink text-surface hover:opacity-90">
          {saving ? 'A guardar…' : 'Guardar nota'}
        </button>
      </div>
    </form>
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
            <span key={a.id || `${a.imovel_id || a.texto}-${i}`} className="inline-flex items-center gap-1 text-[11px] rounded-full border border-line bg-surface-raised px-2 py-0.5 text-ink">
              {nomeAssunto(a)}
              <button type="button" onClick={() => setItens(itens.filter((_, j) => j !== i))} aria-label={`Retirar ${nomeAssunto(a)}`} className="text-ink-muted hover:text-danger">
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
    <div className="rounded-lg border border-dashed border-warning/30 bg-surface-raised/60 p-2 grid gap-1.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[11px] font-semibold text-ink">Oportunidades enviadas nesta chamada</p>
        <span className="text-[10px] font-semibold uppercase tracking-wide rounded px-1.5 py-0.5 bg-surface-muted text-ink">entram em Pré-aprovação</span>
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
          <button type="button" onClick={() => setItens(itens.filter((_, j) => j !== i))} aria-label={`Retirar oportunidade ${i + 1}`} className="justify-self-start text-ink-muted hover:text-danger">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      ))}
      <button type="button" onClick={() => setItens([...itens, { ...OPORTUNIDADE_VAZIA }])}
        className="justify-self-start inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full border border-line bg-surface-raised text-ink-muted hover:bg-surface">
        <Plus className="w-3 h-3" /> {itens.length ? 'outra oportunidade' : 'registar oportunidade'}
      </button>
    </div>
  )
}

// modo: 'agendar' (marcar ou mudar o contacto), 'feito' (o contacto marcado),
// 'novo' (contacto fora do marcado: não o fecha nem lhe mexe nos assuntos) ou 'sem_sucesso'.
// pessoa: { nome, regiao } — para ligar ao consultor as oportunidades registadas.
function ContactoForm({ tipo, pessoaId, pessoa, modo, proximo, rotulo, tipoSugerido, opcoes, onCancel, onDone }) {
  const feito = modo === 'feito' || modo === 'novo'
  const marcados = modo === 'novo' ? [] : proximo?.assuntos || []
  const dataMarcada = String(proximo?.quando || '').slice(0, 10)
  const [data, setData] = useState(modo === 'agendar' && dataMarcada ? dataMarcada : feito ? '' : emDias(1))
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
  const comExtras = feito && tipo === 'consultor'

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
    if (!feito && !data) return setErro('Indica a data.')
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
        : ['registar', { resultado: 'Feito', quando: quando ? new Date(quando).toISOString() : null, canal, finalidade, notas, tratados, novos: [...limpos(novos), ...novosImoveis], proximo: prox, avulso: modo === 'novo' && !!proximo }]
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
    <form onSubmit={guardar} className="mt-2 rounded-lg border border-warning/30 bg-warning/10 p-2.5 grid gap-2">
      <p className="text-xs text-ink-muted">
        {modo === 'agendar' ? `Fica como tarefa na agenda. Só há um ${rotuloMin} por pessoa: os imóveis a tratar entram como assuntos.`
          : modo === 'sem_sucesso' ? `Fica registado como tentado hoje (${fmtDia(emDias(0))}) sem sucesso. Os assuntos seguem para a nova data.`
          : modo === 'novo' ? `Fica na linha do tempo.${proximo ? ` O ${rotuloMin} marcado mantém-se, a não ser que indiques outra data em baixo.` : ''}`
          : 'Fica no histórico. O que não foi tratado segue para o contacto seguinte.'}
      </p>

      {feito && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            <label className="text-[11px] text-ink-muted">Quando
              <input type="datetime-local" value={quando} onChange={e => setQuando(e.target.value)} className={inputClass} />
            </label>
            <label className="text-[11px] text-ink-muted">Canal
              <select value={canal} onChange={e => setCanal(e.target.value)} className={inputClass}>
                {CANAIS.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </label>
            {tipo === 'investidor' && (
              <label className="text-[11px] text-ink-muted">Finalidade
                <select value={finalidade} onChange={e => setFinalidade(e.target.value)} className={inputClass}>
                  <option value="discovery">Discovery</option>
                  <option value="follow_up">Follow Up</option>
                </select>
              </label>
            )}
          </div>
          {marcados.length > 0 && (
            <div>
              <p className="text-[11px] text-ink-muted mb-1">Assuntos tratados</p>
              <div className="flex flex-wrap gap-x-3 gap-y-1">
                {marcados.map(a => (
                  <label key={a.id} className="inline-flex items-center gap-1.5 text-xs text-ink">
                    <input type="checkbox" checked={tratados.includes(a.id)}
                      onChange={e => setTratados(e.target.checked ? [...tratados, a.id] : tratados.filter(x => x !== a.id))} />
                    {nomeAssunto(a)}
                  </label>
                ))}
              </div>
            </div>
          )}
          <div>
            <p className="text-[11px] text-ink-muted mb-1">{modo === 'novo' ? 'Assuntos (imóveis falados)' : 'Outros assuntos que surgiram'}</p>
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
            <div className="flex items-center gap-2 px-2 py-1.5 rounded-lg border border-warning/30 bg-warning/10 text-xs text-warning">
              <Mic className="w-3.5 h-3.5 shrink-0" />
              <span className="truncate flex-1">{audio.name}</span>
              <button type="button" onClick={() => setAudio(null)} className="text-warning hover:text-danger shrink-0" aria-label="Retirar gravação">
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          ) : (
            <label htmlFor={`audio-contacto-${pessoaId}`}
              className="inline-flex items-center gap-1.5 px-2 py-1 rounded-lg border border-dashed border-line text-xs text-ink-muted cursor-pointer hover:border-warning/30 hover:text-warning">
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
        <p className="text-[11px] text-ink-muted mb-1">
          {modo === 'agendar' ? 'Data do contacto' : modo === 'sem_sucesso' ? 'Nova data' : modo === 'novo' && proximo ? 'Mudar o próximo contacto para (opcional)' : 'Próximo contacto (opcional)'}
        </p>
        <div className="flex flex-wrap items-center gap-1.5">
          <input type="date" value={data} onChange={e => setData(e.target.value)} className={`${inputClass} sm:w-40`} aria-label="Data" />
          <input type="time" value={hora} onChange={e => setHora(e.target.value)} className={`${inputClass} sm:w-28`} aria-label="Hora (opcional)" title="Hora (opcional)" />
          {[[1, 'Amanhã'], [3, '3 dias'], [7, '1 semana'], [14, '2 semanas']].map(([n, r]) => (
            <button key={n} type="button" onClick={() => setData(emDias(n))}
              className={`px-2 py-0.5 text-[11px] rounded-full border ${data === emDias(n) ? 'border-yellow-400 bg-warning/15 text-warning' : 'border-line bg-surface-raised text-ink-muted hover:bg-surface'}`}>
              {r}
            </button>
          ))}
        </div>
        {(!feito || data) && (
          <div className="flex flex-wrap items-center gap-1.5 mt-1.5" role="radiogroup" aria-label="Tipo de contacto">
            <span className="text-[11px] text-ink-muted">Tipo</span>
            {Object.entries(TIPOS).map(([k, r]) => (
              <button key={k} type="button" role="radio" aria-checked={tipoContacto === k} onClick={() => setTipoContacto(k)}
                className={`px-2 py-0.5 text-[11px] rounded-full border ${tipoContacto === k ? 'border-yellow-400 bg-warning/15 text-warning' : 'border-line bg-surface-raised text-ink-muted hover:bg-surface'}`}>
                {r}
              </button>
            ))}
          </div>
        )}
      </div>

      {modo === 'agendar' && (
        <div>
          <p className="text-[11px] text-ink-muted mb-1">Assuntos a tratar</p>
          <AssuntosEditor itens={assuntos} setItens={setAssuntos} opcoes={opcoes} />
        </div>
      )}

      {erro && <p className="text-xs text-danger">{erro}</p>}
      <div className="flex justify-end gap-1.5">
        <button type="button" onClick={onCancel} disabled={saving}
          className="px-3 py-1.5 text-xs font-medium rounded-lg border border-line bg-surface-raised text-ink-muted hover:bg-surface disabled:opacity-50">
          Cancelar
        </button>
        <button type="submit" disabled={saving}
          className="px-3 py-1.5 text-xs font-semibold rounded-lg disabled:opacity-50 bg-ink text-surface hover:opacity-90">
          {saving ? 'A guardar…' : 'Guardar'}
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
  const [modo, setModo] = useState(null) // 'agendar' | 'feito' | 'sem_sucesso' | 'novo' (contacto fora do marcado) | 'nota'
  const [verTodos, setVerTodos] = useState(false)
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
    <div className="border-b border-line  px-4 sm:px-6 py-2.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-sm font-semibold text-ink ">Próximos passos</span>
        <span className="flex flex-wrap gap-1.5">
          <button type="button" onClick={() => setModo(modo === 'novo' ? null : 'novo')}
            className="inline-flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-lg bg-warning text-white hover:bg-yellow-700">
            <Plus className="w-3 h-3" /> Novo contacto
          </button>
          <button type="button" onClick={() => setModo(modo === 'nota' ? null : 'nota')} className={`inline-flex items-center gap-1 ${btn}`}>
            <StickyNote className="w-3 h-3" /> Nova nota
          </button>
          {!proximo && <button type="button" onClick={() => setModo('agendar')} className={btn}>Agendar contacto</button>}
        </span>
      </div>

      {!proximo ? (
        <p className="text-xs text-ink-muted mt-1.5">
          Sem contacto marcado.
          {nota && <span className="text-ink-muted"> Próxima ação anotada antes: «{nota}». Ao agendar, entra como assunto.</span>}
        </p>
      ) : (
        <div className="mt-2 grid gap-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-sm">
            <span className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide rounded px-1.5 py-0.5 bg-warning/10 text-warning">
              <Icon className="w-3 h-3" /> {etiqueta}
            </span>
            <span className={`font-medium tabular-nums ${atrasado ? 'text-orange-700' : 'text-ink '}`}>{fmtQuando(proximo.quando)}</span>
            {atrasado && <span className="text-xs text-orange-700">em atraso</span>}
            {proximo.funcionario && <span className="text-xs text-ink-muted">{proximo.funcionario}</span>}
            <span className="ml-auto inline-flex flex-wrap gap-1.5">
              <button type="button" onClick={() => setModo('feito')}
                className="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-lg bg-success/10 text-success hover:bg-success/15 border border-success/30">
                <Check className="w-3 h-3" /> Feito
              </button>
              <button type="button" onClick={() => setModo('sem_sucesso')}
                className="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-lg bg-orange-50 text-orange-700 hover:bg-orange-100 border border-orange-200">
                <X className="w-3 h-3" /> Sem sucesso
              </button>
              <button type="button" onClick={() => setModo('agendar')} className="text-xs font-medium px-2 py-0.5 rounded-lg border border-line text-ink-muted hover:bg-surface">
                Mudar data ou assuntos
              </button>
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-1 text-xs text-ink-muted">
            <span>Assuntos:</span>
            {proximo.assuntos.length === 0 && <span className="text-ink-muted">nenhum indicado</span>}
            {proximo.assuntos.map(a => a.imovel_id ? (
              <button key={a.id} type="button" onClick={() => onNavigate?.('Imóveis', a.imovel_id)}
                className="rounded-full border border-line bg-surface-raised px-2 py-0.5 text-[11px] text-ink hover:border-warning/30">
                {a.imovel_nome}{a.imovel_estado ? ` · ${String(a.imovel_estado).replace(/^\d+-\s*/, '')}` : ''}
              </button>
            ) : (
              <span key={a.id} className="rounded-full border border-line bg-surface-raised px-2 py-0.5 text-[11px] text-ink">{a.texto}</span>
            ))}
          </div>
        </div>
      )}

      {modo === 'nota' && <NotaForm rota={ROTA[tipo]} pessoaId={pessoaId} onCancel={() => setModo(null)} onDone={guardado} />}
      {modo && modo !== 'nota' && (
        <ContactoForm key={modo} tipo={tipo} pessoaId={pessoaId} pessoa={{ nome: d.pessoa?.nome, regiao }} modo={modo} rotulo={rotulo} tipoSugerido={tipoSugerido} opcoes={opcoes}
          proximo={proximo || (nota && modo === 'agendar' ? { assuntos: [{ texto: nota }] } : null)}
          onCancel={() => setModo(null)} onDone={guardado} />
      )}

      {historico.length > 0 && (
        <div className="mt-3">
          <div className="flex flex-wrap items-baseline justify-between gap-2 mb-2">
            <span className="text-[11px] uppercase tracking-wider text-ink-muted">Histórico · {historico.length}</span>
            <span className="text-[11px] text-ink-muted">Clica num registo para ver o detalhe</span>
          </div>
          {/* Linha cronológica em árvore: eixo ao centro (à esquerda no telemóvel), mais recente em cima. */}
          <ol className="relative grid gap-2.5 py-1 before:absolute before:top-0 before:bottom-0 before:w-0.5 before:rounded before:bg-line  before:left-[17px] sm:before:left-1/2 sm:before:-translate-x-1/2">
            {(verTodos ? historico : historico.slice(0, MOSTRAR)).map((h, i) => (
              <RegistoArvore key={h.id} h={h} lado={i % 2 === 0 ? 'dir' : 'esq'} rota={ROTA[tipo]} pessoaId={pessoaId} onSaved={() => query.refetch()} />
            ))}
          </ol>
          {historico.length > MOSTRAR && (
            <div className="text-center mt-2">
              <button type="button" onClick={() => setVerTodos(v => !v)} className={btn}>
                {verTodos ? 'Mostrar menos' : `Ver mais antigos (${historico.length - MOSTRAR})`}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
