import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react'
import { Sparkles, Search, Check, X, MapPin, Footprints, Car, Bike, Bus, Star, Loader2, ChevronDown, ChevronRight, ThumbsUp, TrendingDown } from 'lucide-react'
import { apiFetch } from '../../lib/api.js'
import { pesquisarPOIs, procurarLugar, pontoManual, CATEGORIAS, GRUPOS as GRUPOS_ATUAIS } from '../../../supabase/functions/_shared/analiseLocalizacaoIA.js'
import { gerarEstudoPNG } from '../../../supabase/functions/_shared/estudoMapaOSM.js'

const MapaLocalizacao = lazy(() => import('./MapaLocalizacao.jsx'))

// Grupos atuais primeiro; os antigos só aparecem em pesquisas feitas antes de 11/2026.
const GRUPOS = { ...GRUPOS_ATUAIS, desporto: 'Desporto', restauracao: 'Restauração', servicos: 'Serviços' }
const FILTROS = [
  { v: 'todos', l: 'Todos' }, { v: 'proposto', l: 'Por aprovar' }, { v: 'validado', l: 'Aprovados' }, { v: 'excluido', l: 'Excluídos' },
]

const fmtDist = m => m == null ? '—' : m < 1000 ? `${m} m` : `${(m / 1000).toFixed(1).replace('.', ',')} km`
const fmtMin = s => {
  if (s == null) return '—'
  const m = Math.max(1, Math.round(s / 60))
  return m < 60 ? `${m} min` : `${Math.floor(m / 60)}h${String(m % 60).padStart(2, '0')}`
}
const fmtData = iso => iso ? new Date(iso).toLocaleString('pt-PT', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : ''

function BotoesDecisao({ estado, onChange }) {
  return (
    <div className="flex gap-1 shrink-0">
      <button type="button" title="Aprovar" onClick={() => onChange(estado === 'validado' ? 'proposto' : 'validado')}
        className={`p-1.5 rounded-md border ${estado === 'validado' ? 'bg-emerald-600 border-emerald-600 text-white' : 'border-line text-ink-muted hover:text-emerald-700 hover:border-emerald-400'}`}>
        <Check className="w-3.5 h-3.5" />
      </button>
      <button type="button" title="Excluir" onClick={() => onChange(estado === 'excluido' ? 'proposto' : 'excluido')}
        className={`p-1.5 rounded-md border ${estado === 'excluido' ? 'bg-rose-600 border-rose-600 text-white' : 'border-line text-ink-muted hover:text-rose-700 hover:border-rose-400'}`}>
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  )
}

function ItemAnalise({ item, campoExtra, labelExtra, onDecidir, onEditar }) {
  const [texto, setTexto] = useState(item.texto)
  const [extra, setExtra] = useState(item[campoExtra] || '')
  useEffect(() => { setTexto(item.texto); setExtra(item[campoExtra] || '') }, [item.texto, item[campoExtra]])
  const tom = item.estado === 'validado' ? 'border-emerald-300 bg-emerald-50/40' : item.estado === 'excluido' ? 'border-line opacity-50' : 'border-line'
  return (
    <div className={`rounded-lg border p-3 ${tom}`}>
      <div className="flex gap-2 items-start">
        <div className="flex-1 space-y-1.5">
          <textarea value={texto} rows={2} onChange={e => setTexto(e.target.value)}
            onBlur={() => texto !== item.texto && onEditar({ texto })}
            className="w-full text-sm font-medium text-ink bg-transparent resize-none focus:outline-none focus:ring-1 focus:ring-yellow-300 rounded" />
          <div className="text-[11px] font-semibold uppercase tracking-wide text-ink-muted">{labelExtra}</div>
          <textarea value={extra} rows={2} onChange={e => setExtra(e.target.value)}
            onBlur={() => extra !== (item[campoExtra] || '') && onEditar({ [campoExtra]: extra })}
            className="w-full text-xs text-ink-muted bg-transparent resize-none focus:outline-none focus:ring-1 focus:ring-yellow-300 rounded" />
        </div>
        <BotoesDecisao estado={item.estado} onChange={onDecidir} />
      </div>
    </div>
  )
}

export default function AnaliseLocalizacaoIA({ imovel, toast, onUpdate, onEstudoGerado }) {
  const base = `/api/crm/imoveis/${imovel.id}/analise-localizacao-ia`
  const [dados, setDados] = useState(null)
  const [emFila, setEmFila] = useState(false)
  const [erroFila, setErroFila] = useState(null)
  const [origem, setOrigem] = useState(imovel.morada || '')
  const [pesquisando, setPesquisando] = useState(false)
  const [progresso, setProgresso] = useState(null)
  const [pedindo, setPedindo] = useState(false)
  const [aplicando, setAplicando] = useState(false)
  const [gerandoEstudo, setGerandoEstudo] = useState(false)
  // Ponto acrescentado à mão
  const [manualTexto, setManualTexto] = useState('')
  const [manualCat, setManualCat] = useState('supermercados')
  const [manualOpcoes, setManualOpcoes] = useState(null)
  const [manualAProcurar, setManualAProcurar] = useState(false)
  // Opções da imagem do estudo (guardadas em pois_distancias ao gerar)
  const pd = imovel.pois_distancias || {}
  const [destaque, setDestaque] = useState(pd.destaque || '')
  const [hl, setHl] = useState(() => [0, 1].map(i => ({
    titulo: pd.highlights?.[i]?.titulo || '', descricao: pd.highlights?.[i]?.descricao || '',
    subtitulo: pd.highlights?.[i]?.subtitulo || '', badge: i === 0 ? (pd.highlights?.[0]?.badge || '') : '',
  })))
  const [filtro, setFiltro] = useState('todos')
  const [abertos, setAbertos] = useState({})
  const [aberto, setAberto] = useState(true)
  const poll = useRef(null)

  async function carregar() {
    try {
      const r = await apiFetch(base)
      const j = await r.json()
      if (!r.ok) throw new Error(j.error)
      setDados(j.dados)
      setEmFila(j.em_fila)
      setErroFila(j.fila?.estado === 'erro' ? j.fila.erro : null)
      if (j.dados?.origem?.texto) setOrigem(o => o || j.dados.origem.texto)
    } catch (e) { toast('Erro: ' + e.message, 'error') }
  }
  useEffect(() => { carregar() }, [imovel.id])

  // Enquanto a análise estiver na fila (corre no Mac), atualiza a cada 15 s.
  useEffect(() => {
    clearInterval(poll.current)
    if (emFila) poll.current = setInterval(carregar, 15000)
    return () => clearInterval(poll.current)
  }, [emFila])

  async function pesquisar() {
    const texto = origem.trim()
    if (!texto && !imovel.coordenadas_lat) { toast('Indica a morada do imóvel', 'error'); return }
    // Com a morada da ficha e coordenadas gravadas, parte das coordenadas; morada escrita à mão é localizada de novo.
    const usarCoord = imovel.coordenadas_lat && imovel.coordenadas_lng && texto === (imovel.morada || '').trim()
    setPesquisando(true)
    try {
      const resultado = await pesquisarPOIs({
        origemTexto: texto,
        centro: usarCoord ? { lat: imovel.coordenadas_lat, lng: imovel.coordenadas_lng } : null,
        aoProgresso: setProgresso,
      })
      const r = await apiFetch(`${base}/pesquisa`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(resultado),
      })
      const j = await r.json()
      if (!r.ok) throw new Error(j.error)
      setDados(j.dados)
      toast(`${j.dados.pois.length} pontos de interesse encontrados`, 'success')
    } catch (e) { toast('Erro: ' + e.message, 'error') }
    setPesquisando(false)
    setProgresso(null)
  }

  // Cliques seguidos: o ecrã muda logo (otimista) e só a resposta do último pedido é aplicada,
  // para uma resposta mais antiga não repor um estado anterior.
  const pedidoAtual = useRef(0)
  async function guardar(patch, otimista) {
    if (otimista) setDados(otimista)
    const n = ++pedidoAtual.current
    try {
      const r = await apiFetch(base, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(patch) })
      const j = await r.json()
      if (!r.ok) throw new Error(j.error)
      if (n === pedidoAtual.current) setDados(j.dados)
    } catch (e) { toast('Erro: ' + e.message, 'error'); carregar() }
  }

  function decidirPois(ids, estado) {
    const set = new Set(ids)
    setDados(d => ({ ...d, pois: d.pois.map(p => set.has(p.id) ? { ...p, estado } : p) }))
    guardar({ pois: Object.fromEntries(ids.map(id => [id, estado])) })
  }

  function mudarItem(lista, id, patch) {
    setDados(d => ({ ...d, analise: { ...d.analise, [lista]: d.analise[lista].map(it => it.id === id ? { ...it, ...patch } : it) } }))
    guardar({ itens: { [id]: patch } })
  }

  async function pedirAnalise() {
    setPedindo(true)
    try {
      const r = await apiFetch(`${base}/analisar`, { method: 'POST' })
      const j = await r.json()
      if (!r.ok) throw new Error(j.error)
      setDados(j.dados); setEmFila(true); setErroFila(null)
      toast('Análise pedida. Corre no Mac da equipa e aparece aqui quando estiver pronta.', 'success')
    } catch (e) { toast('Erro: ' + e.message, 'error') }
    setPedindo(false)
  }

  async function aplicar() {
    setAplicando(true)
    try {
      const r = await apiFetch(`${base}/aplicar`, { method: 'POST' })
      const j = await r.json()
      if (!r.ok) throw new Error(j.error)
      await onUpdate()
      await carregar()
      toast(`Acrescentados ${j.acrescentados_fortes} pontos fortes e ${j.acrescentados_fracos} pontos fracos à aba Pontos & Riscos`, 'success')
    } catch (e) { toast('Erro: ' + e.message, 'error') }
    setAplicando(false)
  }

  // Estudo de localização (imagem do dossier) só com os pontos aprovados, sem Google.
  async function gerarEstudo() {
    setGerandoEstudo(true)
    try {
      const highlights = hl.filter(h => h.titulo.trim()).map((h, i) => ({
        titulo: h.titulo, descricao: h.descricao, subtitulo: h.subtitulo, accent: i === 0 && hl[0].titulo.trim() ? 'gold' : 'red',
        ...(h.badge ? { badge: Array.isArray(h.badge) ? h.badge : String(h.badge).split(/[;,]\s*/).filter(Boolean) } : {}),
      }))
      // A imagem é composta aqui no browser; o servidor só a guarda.
      const { blob, resultados } = await gerarEstudoPNG({ dados, imovel, highlights, destaque: destaque || null, aoProgresso: t => setProgresso({ passo: 1, total: 2, texto: t }) })
      setProgresso({ passo: 2, total: 2, texto: 'A guardar o estudo…' })
      const fd = new FormData()
      fd.append('imagem', blob, 'estudo-localizacao.jpg')
      fd.append('meta', JSON.stringify({ resultados, highlights, destaque: destaque || null, origem: dados.origem?.texto || imovel.morada || '' }))
      const r = await apiFetch(`${base}/estudo`, { method: 'POST', body: fd })
      const j = await r.json()
      if (!r.ok) throw new Error(j.error)
      onEstudoGerado?.(j.localizacao_imagem)
      await onUpdate()
      toast(`Estudo de localização gerado com ${validados.length} pontos aprovados`, 'success')
    } catch (e) { toast('Erro: ' + e.message, 'error') }
    setGerandoEstudo(false)
    setProgresso(null)
  }

  // Sem destaques guardados, propõe o transporte público à porta (como o «SMTUC à porta» da Lages).
  useEffect(() => {
    const tp = dados?.transporte_publico
    if (!tp || pd.highlights?.length || hl[0].titulo || (tp.pe?.s ?? Infinity) > 600) return
    const minutos = Math.max(1, Math.round(tp.pe.s / 60))
    const metro = /metro/i.test(tp.categoria || '')
    setHl(prev => [{
      titulo: metro ? 'Metrobus à porta' : 'Autocarro à porta',
      descricao: `Paragem ${tp.nome} a ${minutos} min a pé${tp.linhas ? `, com as linhas ${tp.linhas}` : ''}${tp.rede ? ` (${tp.rede})` : ''}`,
      subtitulo: 'Sem necessidade de carro para o dia a dia',
      badge: tp.linhas ? tp.linhas.split(/,\s*/).slice(0, 6).join(', ') : '',
    }, prev[1]])
  }, [dados?.transporte_publico])

  async function procurarManual() {
    if (!manualTexto.trim() || !dados?.origem) return
    setManualAProcurar(true)
    try {
      const r = await procurarLugar(manualTexto.trim(), dados.origem)
      setManualOpcoes(r)
      if (!r.length) toast('Nenhum lugar encontrado com esse nome. Experimenta acrescentar a rua ou a localidade.', 'error')
    } catch (e) { toast('Erro: ' + e.message, 'error') }
    setManualAProcurar(false)
  }

  async function acrescentarManual(lugar) {
    setManualAProcurar(true)
    try {
      const poi = await pontoManual({ centro: dados.origem, lugar, categoria: manualCat })
      await guardar({ adicionar: poi })
      setManualOpcoes(null); setManualTexto('')
      toast(`${lugar.nome} acrescentado e aprovado`, 'success')
    } catch (e) { toast('Erro: ' + e.message, 'error') }
    setManualAProcurar(false)
  }

  const pois = dados?.pois || []
  const validados = pois.filter(p => p.estado === 'validado')
  const contagem = useMemo(() => ({
    proposto: pois.filter(p => p.estado === 'proposto').length,
    validado: validados.length,
    excluido: pois.filter(p => p.estado === 'excluido').length,
  }), [dados])
  const porGrupo = useMemo(() => {
    const g = {}
    for (const p of pois) {
      if (filtro !== 'todos' && p.estado !== filtro) continue
      ;(g[p.grupo] ||= []).push(p)
    }
    for (const k in g) g[k].sort((a, b) => a.categoria_label.localeCompare(b.categoria_label) || a.linha_reta_m - b.linha_reta_m)
    return g
  }, [dados, filtro])
  const analise = dados?.analise
  const validadosAnalise = analise ? [...analise.pontos_fortes, ...analise.pontos_fracos].filter(i => i.estado === 'validado').length : 0

  return (
    <div className="rounded-xl border border-line bg-surface-raised overflow-hidden">
      <button type="button" onClick={() => setAberto(a => !a)}
        className="w-full px-4 py-3 border-b border-line bg-gradient-to-r from-yellow-50 to-white flex items-center gap-2 text-left">
        <Sparkles className="w-4 h-4 text-brand-gold" />
        <span className="text-sm font-bold text-ink flex-1">Análise IA da localização</span>
        {pois.length > 0 && <span className="text-[11px] text-ink-muted">{contagem.validado} aprovados · {contagem.proposto} por aprovar · {contagem.excluido} excluídos</span>}
        {aberto ? <ChevronDown className="w-4 h-4 text-ink-muted" /> : <ChevronRight className="w-4 h-4 text-ink-muted" />}
      </button>

      {aberto && (
        <div className="p-4 space-y-5">
          {/* 1. Pesquisa */}
          <div className="space-y-2">
            <p className="text-xs text-ink-muted">
              Procura no OpenStreetMap, gratuitamente, tudo o que existe à volta do imóvel (saúde, educação, comércio, restauração, transportes, desporto, lazer e serviços), com os tempos a pé e de carro. Tudo fica por aprovar: escolhe os pontos que entram no estudo de localização e na análise dos pontos fortes e fracos.
            </p>
            <div className="flex flex-col sm:flex-row gap-2">
              <input value={origem} onChange={e => setOrigem(e.target.value)} placeholder="Morada do imóvel"
                className="flex-1 px-3 py-2 rounded-lg border border-line text-sm focus:outline-none focus:ring-2 focus:ring-yellow-300" />
              <button type="button" onClick={pesquisar} disabled={pesquisando}
                className="inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-brand-dark text-white text-sm font-semibold disabled:opacity-50">
                {pesquisando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                {pesquisando ? 'A procurar…' : pois.length ? 'Procurar de novo' : 'Procurar pontos de interesse'}
              </button>
            </div>
            {(pesquisando || gerandoEstudo) && progresso && (
              <div className="space-y-1">
                <div className="h-1.5 rounded-full bg-surface overflow-hidden border border-line">
                  <div className="h-full bg-brand-gold transition-all" style={{ width: `${Math.round((progresso.passo / progresso.total) * 100)}%` }} />
                </div>
                <p className="text-[11px] text-ink-muted">{progresso.texto} {pesquisando ? 'Pode demorar um ou dois minutos; não feches a ficha.' : ''}</p>
              </div>
            )}
            {dados?.origem && (
              <p className="text-[11px] text-ink-muted flex items-center gap-1">
                <MapPin className="w-3 h-3 shrink-0" /> Ponto de partida: {dados.origem.resolvida || dados.origem.texto} ({dados.origem.lat?.toFixed(5)}, {dados.origem.lng?.toFixed(5)}) · pesquisa de {fmtData(dados.pesquisado_em)} · dados © contribuidores do OpenStreetMap
              </p>
            )}
            {dados?.transporte_publico && (
              <p className="text-[11px] text-ink flex items-center gap-1">
                <Bus className="w-3 h-3 shrink-0 text-brand-gold" /> Transporte público: {dados.transporte_publico.nome} ({dados.transporte_publico.categoria.toLowerCase()}{dados.transporte_publico.linhas ? `, linhas ${dados.transporte_publico.linhas}` : ''}) a {fmtMin(dados.transporte_publico.pe?.s)} a pé.
              </p>
            )}
            {dados?.avisos?.length > 0 && (
              <p className="text-[11px] text-amber-700">Avisos da pesquisa: {dados.avisos.join(' · ')}</p>
            )}
          </div>

          {/* 2. Pontos de interesse */}
          {pois.length > 0 && (
            <div className="space-y-3">
              <Suspense fallback={<div className="h-[420px] rounded-lg border border-line bg-surface flex items-center justify-center text-xs text-ink-muted">A carregar o mapa…</div>}>
                <MapaLocalizacao origem={dados.origem} pois={pois} onDecidir={decidirPois} />
              </Suspense>

              <div className="rounded-lg border border-line p-3 space-y-2">
                <div className="text-xs font-semibold text-ink">Acrescentar um ponto que não apareceu</div>
                <div className="flex flex-col sm:flex-row gap-2">
                  <input value={manualTexto} onChange={e => setManualTexto(e.target.value)} onKeyDown={e => e.key === 'Enter' && procurarManual()}
                    placeholder="Nome do lugar (ex.: Continente Coimbra)"
                    className="flex-1 px-3 py-1.5 rounded-lg border border-line text-sm focus:outline-none focus:ring-2 focus:ring-yellow-300" />
                  <select value={manualCat} onChange={e => setManualCat(e.target.value)}
                    className="px-2 py-1.5 rounded-lg border border-line text-sm">
                    {CATEGORIAS.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
                  </select>
                  <button type="button" onClick={procurarManual} disabled={manualAProcurar || !manualTexto.trim()}
                    className="inline-flex items-center justify-center gap-1 px-3 py-1.5 rounded-lg border border-line text-sm text-ink hover:bg-surface disabled:opacity-50">
                    {manualAProcurar ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Search className="w-3.5 h-3.5" />} Procurar
                  </button>
                </div>
                {manualOpcoes?.length > 0 && (
                  <ul className="divide-y divide-line rounded-lg border border-line">
                    {manualOpcoes.map((l, i) => (
                      <li key={i} className="flex items-center gap-2 px-3 py-1.5 text-xs">
                        <div className="flex-1 min-w-0">
                          <div className="font-medium text-ink truncate">{l.nome}</div>
                          <div className="text-ink-muted truncate">{fmtDist(l.linha_reta_m)} do imóvel · {l.endereco}</div>
                        </div>
                        <button type="button" onClick={() => acrescentarManual(l)} disabled={manualAProcurar}
                          className="px-2 py-1 rounded border border-emerald-300 text-emerald-700 hover:bg-emerald-50 disabled:opacity-50">Acrescentar</button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-1.5">
                {FILTROS.map(f => (
                  <button key={f.v} type="button" onClick={() => setFiltro(f.v)}
                    className={`text-[11px] px-2.5 py-1 rounded-full border ${filtro === f.v ? 'bg-brand-dark text-white border-brand-dark' : 'border-line text-ink-muted hover:bg-surface'}`}>
                    {f.l}{f.v !== 'todos' ? ` (${contagem[f.v]})` : ` (${pois.length})`}
                  </button>
                ))}
              </div>
              {Object.keys(GRUPOS).filter(g => porGrupo[g]?.length).map(g => {
                const lista = porGrupo[g]
                const fechado = abertos[g] === false
                return (
                  <div key={g} className="rounded-lg border border-line">
                    <div className="flex items-center gap-2 px-3 py-2 bg-surface border-b border-line">
                      <button type="button" onClick={() => setAbertos(a => ({ ...a, [g]: fechado }))} className="flex items-center gap-1.5 flex-1 text-left">
                        {fechado ? <ChevronRight className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                        <span className="text-xs font-bold text-ink">{GRUPOS[g]}</span>
                        <span className="text-[11px] text-ink-muted">({lista.length})</span>
                      </button>
                      <button type="button" onClick={() => decidirPois(lista.map(p => p.id), 'validado')}
                        className="text-[11px] px-2 py-0.5 rounded border border-emerald-300 text-emerald-700 hover:bg-emerald-50">Aprovar todos</button>
                      <button type="button" onClick={() => decidirPois(lista.map(p => p.id), 'excluido')}
                        className="text-[11px] px-2 py-0.5 rounded border border-rose-300 text-rose-700 hover:bg-rose-50">Excluir todos</button>
                    </div>
                    {!fechado && (
                      <ul className="divide-y divide-line">
                        {lista.map(p => (
                          <li key={p.id} className={`flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2 ${p.estado === 'excluido' ? 'opacity-45' : ''} ${p.estado === 'validado' ? 'bg-emerald-50/40' : ''}`}>
                            <div className="flex-1 min-w-0">
                              <div className="text-sm text-ink truncate">
                                <span className="font-medium">{p.nome}</span>
                                <span className="text-[11px] text-ink-muted ml-2">{p.categoria_label}</span>
                              </div>
                              <div className="text-[11px] text-ink-muted truncate">{[p.linhas && `Linhas ${p.linhas}`, p.endereco].filter(Boolean).join(' · ')}</div>
                            </div>
                            <div className="flex items-center gap-2 text-[11px] text-ink-muted shrink-0 order-3 sm:order-none w-full sm:w-auto">
                              <span title="Linha reta">{fmtDist(p.linha_reta_m)}</span>
                              {[['pe', Footprints, 'A pé'], ['bicicleta', Bike, 'De bicicleta'], ['carro', Car, 'De carro']].map(([k, Icone, l]) => (
                                <span key={k} className="inline-flex items-center gap-0.5 w-14" title={`${l}${p[k]?.estimado ? ' (estimativa pela distância)' : ''}: ${fmtDist(p[k]?.m)}`}>
                                  <Icone className="w-3 h-3" />{p[k]?.estimado ? '≈' : ''}{fmtMin(p[k]?.s)}
                                </span>
                              ))}
                              {p.rating != null && <span className="inline-flex items-center gap-0.5" title={`${p.avaliacoes || 0} avaliações`}><Star className="w-3 h-3" />{String(p.rating).replace('.', ',')}</span>}
                            </div>
                            <BotoesDecisao estado={p.estado} onChange={e => decidirPois([p.id], e)} />
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                )
              })}

              <details className="rounded-lg border border-line">
                <summary className="px-3 py-2 text-xs font-semibold text-ink cursor-pointer select-none">Opções da imagem do estudo (destaque e destaques)</summary>
                <div className="p-3 pt-0 space-y-3">
                  <div>
                    <label className="text-[11px] font-semibold text-ink block mb-1">Ponto em destaque (dourado)</label>
                    <select value={destaque} onChange={e => setDestaque(e.target.value)}
                      className="w-full px-3 py-1.5 rounded-lg border border-line text-sm">
                      <option value="">Sem destaque</option>
                      {validados.map(p => <option key={p.id} value={p.nome}>{p.nome} ({p.categoria_label})</option>)}
                    </select>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {hl.map((h, i) => (
                      <div key={i} className={`rounded-lg p-2.5 space-y-1.5 border ${i === 0 ? 'border-warning/30 bg-warning/10' : 'border-danger/30 bg-danger/10'}`}>
                        <p className={`text-[10px] font-bold uppercase tracking-wide ${i === 0 ? 'text-warning' : 'text-danger'}`}>Destaque {i + 1} ({i === 0 ? 'dourado' : 'vermelho'})</p>
                        {[['titulo', 'Título (ex.: SMTUC à porta)'], ['descricao', 'Descrição'], ['subtitulo', 'Subtítulo'], ...(i === 0 ? [['badge', 'Etiquetas curtas, separadas por vírgulas (ex.: 7, 9, 26)']] : [])].map(([k, ph]) => (
                          <input key={k} value={Array.isArray(h[k]) ? h[k].join(', ') : h[k]} placeholder={ph}
                            onChange={e => setHl(prev => prev.map((x, j) => j === i ? { ...x, [k]: e.target.value } : x))}
                            className="w-full px-2.5 py-1 rounded border border-line text-xs focus:outline-none focus:ring-2 focus:ring-yellow-300" />
                        ))}
                      </div>
                    ))}
                  </div>
                  <p className="text-[11px] text-ink-muted">Aplicam-se quando geras o estudo de localização.</p>
                </div>
              </details>

              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={pedirAnalise} disabled={pedindo || emFila || validados.length === 0}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-brand-gold text-brand-dark text-sm font-semibold disabled:opacity-50">
                  {pedindo || emFila ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                  {emFila ? 'Análise em curso…' : analise ? `Refazer análise IA (${validados.length} aprovados)` : `Gerar análise IA (${validados.length} aprovados)`}
                </button>
                <button type="button" onClick={gerarEstudo} disabled={gerandoEstudo || validados.length === 0}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-brand-dark text-white text-sm font-semibold disabled:opacity-50">
                  {gerandoEstudo ? <Loader2 className="w-4 h-4 animate-spin" /> : <MapPin className="w-4 h-4" />}
                  {gerandoEstudo ? 'A gerar o estudo…' : `Gerar estudo de localização com os aprovados (${validados.length})`}
                </button>
              </div>
              {validados.length === 0 && <p className="text-[11px] text-ink-muted">Aprova pelo menos um ponto de interesse para gerar o estudo e a análise. No estudo, todos os aprovados ficam numerados no mapa, com a legenda por baixo.</p>}
              {emFila && <p className="text-[11px] text-ink-muted">A análise corre no Mac da equipa (plano Claude). Esta área atualiza sozinha quando estiver pronta.</p>}
              {erroFila && !emFila && <p className="text-[11px] text-rose-700">A última análise falhou: {erroFila}</p>}
            </div>
          )}

          {/* 3. Análise */}
          {analise && (
            <div className="space-y-4 border-t border-line pt-4">
              <div>
                <h4 className="text-sm font-bold text-ink">Pontos fortes e fracos da localização</h4>
                <p className="text-[11px] text-ink-muted">Gerada em {fmtData(analise.gerado_em)}. Tudo por aprovar: edita o texto se for preciso, aprova ou exclui cada ponto e acrescenta os aprovados à ficha.</p>
              </div>
              {analise.resumo && <p className="text-sm text-ink bg-surface rounded-lg p-3 border border-line">{analise.resumo}</p>}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <div className="flex items-center gap-1.5 text-xs font-semibold text-ink"><ThumbsUp className="w-3.5 h-3.5 text-emerald-600" />Pontos fortes</div>
                  {analise.pontos_fortes.map(it => (
                    <ItemAnalise key={it.id} item={it} campoExtra="uso_venda" labelExtra="Como se usa na venda"
                      onDecidir={estado => mudarItem('pontos_fortes', it.id, { estado })}
                      onEditar={patch => mudarItem('pontos_fortes', it.id, patch)} />
                  ))}
                </div>
                <div className="space-y-2">
                  <div className="flex items-center gap-1.5 text-xs font-semibold text-ink"><TrendingDown className="w-3.5 h-3.5 text-amber-600" />Pontos fracos</div>
                  {analise.pontos_fracos.map(it => (
                    <ItemAnalise key={it.id} item={it} campoExtra="resposta" labelExtra="Como se responde"
                      onDecidir={estado => mudarItem('pontos_fracos', it.id, { estado })}
                      onEditar={patch => mudarItem('pontos_fracos', it.id, patch)} />
                  ))}
                </div>
              </div>
              <div className="flex items-center gap-3">
                <button type="button" onClick={aplicar} disabled={aplicando || validadosAnalise === 0}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-brand-dark text-white text-sm font-semibold disabled:opacity-50">
                  {aplicando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                  Acrescentar aprovados aos Pontos & Riscos ({validadosAnalise})
                </button>
                {dados.aplicado_em && <span className="text-[11px] text-ink-muted">Última vez acrescentados em {fmtData(dados.aplicado_em)}</span>}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
