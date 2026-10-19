import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Search, Building2, UserRound, Briefcase, Construction, CornerDownLeft } from 'lucide-react'
import { Modal } from '../ui/Modal.jsx'
import { useAuth } from '../../contexts/AuthContext.jsx'
import { apiFetchJson } from '../../lib/api.js'
import { navVisivel } from './navConfig.js'

// Paleta de comandos (⌘K / Ctrl K): salta para qualquer página do menu ou
// para a ficha de um imóvel, investidor, consultor ou projeto pelo nome.
// Abre também pelo evento global EVENTO_ABRIR (botão da barra lateral).
export const EVENTO_ABRIR = 'somnium:comandos'
export const ATALHO = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent) ? '⌘K' : 'Ctrl K'

const sem = (s) => (s || '').normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase()

// Como cada tipo devolvido por /api/crm/search abre na plataforma.
const TIPOS = {
  imovel:     { grupo: 'Imóveis',      Icon: Building2,    to: r => `/crm?tab=${encodeURIComponent('Imóveis')}&detail=${r.id}`,      titulo: r => r.nome,      sub: r => [r.zona, r.estado] },
  investidor: { grupo: 'Investidores', Icon: UserRound,    to: r => `/crm?tab=Investidores&detail=${r.id}`,                          titulo: r => r.nome,      sub: r => [r.status, r.email] },
  consultor:  { grupo: 'Consultores',  Icon: Briefcase,    to: r => `/crm?tab=Consultores&detail=${r.id}`,                           titulo: r => r.nome,      sub: r => [r.estatuto, r.email] },
  negocio:    { grupo: 'Projetos',     Icon: Construction, to: r => `/projectos/${r.id}`,                                            titulo: r => r.movimento, sub: r => [r.categoria, r.fase] },
}

export function CommandPalette() {
  const { role, areas, canAccess } = useAuth()
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const [remotos, setRemotos] = useState([])
  const [aProcurar, setAProcurar] = useState(false)
  const [ativo, setAtivo] = useState(0)
  const listaRef = useRef(null)

  useEffect(() => {
    const onKey = (e) => {
      if ((e.metaKey || e.ctrlKey) && !e.altKey && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setOpen(o => !o)
      }
    }
    const onAbrir = () => setOpen(true)
    window.addEventListener('keydown', onKey)
    window.addEventListener(EVENTO_ABRIR, onAbrir)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener(EVENTO_ABRIR, onAbrir)
    }
  }, [])

  useEffect(() => { if (!open) { setQ(''); setRemotos([]) } }, [open])

  // Registos do CRM: pesquisa no servidor com pausa curta entre teclas.
  const podeCrm = canAccess?.('crm')
  const podeProjetos = canAccess?.('projectos')
  useEffect(() => {
    const termo = q.trim()
    if (!open || !podeCrm || termo.length < 2) { setRemotos([]); setAProcurar(false); return }
    let cancel = false
    setAProcurar(true)
    const t = setTimeout(() => {
      apiFetchJson(`/api/crm/search?q=${encodeURIComponent(termo)}`)
        .then(j => { if (!cancel) setRemotos((j.results || []).filter(r => TIPOS[r.tipo] && (r.tipo !== 'negocio' || podeProjetos))) })
        .catch(() => { if (!cancel) setRemotos([]) })
        .finally(() => { if (!cancel) setAProcurar(false) })
    }, 200)
    return () => { cancel = true; clearTimeout(t) }
  }, [q, open, podeCrm, podeProjetos])

  const grupos = useMemo(() => {
    const termo = sem(q.trim())
    const paginas = navVisivel(role, areas).flatMap(s => s.items)
      .filter(i => !termo || sem(i.label).includes(termo) || sem(i.to).includes(termo))
      .map(i => ({ key: `p:${i.to}`, Icon: i.Icon, titulo: i.label, to: i.to }))
    const porGrupo = {}
    for (const r of remotos) {
      const t = TIPOS[r.tipo]
      ;(porGrupo[t.grupo] ||= []).push({
        key: `${r.tipo}:${r.id}`, Icon: t.Icon, titulo: t.titulo(r) || 'Sem nome', to: t.to(r),
        sub: t.sub(r).filter(Boolean).join(' · '),
      })
    }
    return [
      ...(paginas.length ? [{ label: 'Páginas', itens: paginas }] : []),
      ...Object.values(TIPOS).map(t => t.grupo).filter(g => porGrupo[g]).map(g => ({ label: g, itens: porGrupo[g] })),
    ]
  }, [q, remotos, role, areas])

  const itens = useMemo(() => grupos.flatMap(g => g.itens), [grupos])
  useEffect(() => { setAtivo(0) }, [q, remotos])
  useEffect(() => {
    listaRef.current?.querySelector('[data-ativo="true"]')?.scrollIntoView({ block: 'nearest' })
  }, [ativo])

  const abrir = (item) => {
    if (!item) return
    setOpen(false)
    navigate(item.to)
  }

  const onKeyDown = (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setAtivo(i => Math.min(itens.length - 1, i + 1)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setAtivo(i => Math.max(0, i - 1)) }
    else if (e.key === 'Enter') { e.preventDefault(); abrir(itens[ativo]) }
  }

  const termo = q.trim()
  let n = -1
  return (
    <Modal open={open} onClose={() => setOpen(false)} size="lg" bare top label="Pesquisa rápida" className="overflow-hidden flex flex-col">
      <div className="flex items-center gap-3 px-4 border-b border-line">
        <Search className="w-4 h-4 text-ink-muted shrink-0" />
        <input
          autoFocus value={q} onChange={e => setQ(e.target.value)} onKeyDown={onKeyDown}
          placeholder={podeCrm ? 'Procurar página, imóvel, investidor, consultor ou projeto…' : 'Procurar página…'}
          className="flex-1 bg-transparent py-3.5 text-sm text-ink placeholder:text-ink-muted outline-none"
          role="combobox" aria-expanded="true" aria-controls="comandos-lista" aria-autocomplete="list"
          aria-activedescendant={itens[ativo] ? `cmd-${ativo}` : undefined}
        />
        {aProcurar && <span className="w-3.5 h-3.5 border-2 border-accent border-t-transparent rounded-full animate-spin shrink-0" aria-hidden="true" />}
      </div>

      <div ref={listaRef} id="comandos-lista" role="listbox" className="max-h-[min(60vh,26rem)] overflow-y-auto p-2">
        {grupos.map(g => (
          <div key={g.label} className="mb-1 last:mb-0">
            <p className="px-2 pt-2 pb-1 text-overline uppercase text-ink-muted">{g.label}</p>
            {g.itens.map(item => {
              n += 1
              const idx = n
              const sel = idx === ativo
              const { Icon } = item
              return (
                <button key={item.key} id={`cmd-${idx}`} type="button" role="option" aria-selected={sel} data-ativo={sel}
                  onMouseMove={() => { if (!sel) setAtivo(idx) }} onClick={() => abrir(item)}
                  className={`w-full flex items-center gap-3 px-2 py-2 rounded-lg text-left transition-colors duration-fast ${sel ? 'bg-surface-muted' : ''}`}>
                  <span className={`w-7 h-7 rounded-md flex items-center justify-center shrink-0 ${sel ? 'bg-accent/15 text-accent-ink' : 'bg-surface-muted text-ink-muted'}`}>
                    <Icon className="w-3.5 h-3.5" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-ui text-ink truncate">{item.titulo}</span>
                    {item.sub && <span className="block text-caption text-ink-muted truncate">{item.sub}</span>}
                  </span>
                  {sel && <CornerDownLeft className="w-3.5 h-3.5 text-ink-muted shrink-0" aria-hidden="true" />}
                </button>
              )
            })}
          </div>
        ))}
        {!itens.length && (
          <p className="px-3 py-8 text-center text-ui text-ink-muted">
            {aProcurar ? 'A procurar…' : termo.length < 2 && podeCrm ? 'Escreva pelo menos 2 letras.' : `Sem resultados para «${termo}».`}
          </p>
        )}
      </div>

      <div className="flex items-center gap-4 px-4 py-2 border-t border-line bg-surface-muted/60 text-caption text-ink-muted">
        <span><Tecla>↑</Tecla><Tecla>↓</Tecla> navegar</span>
        <span><Tecla>↵</Tecla> abrir</span>
        <span><Tecla>esc</Tecla> fechar</span>
        <span className="ml-auto hidden sm:inline"><Tecla>{ATALHO}</Tecla> em qualquer página</span>
      </div>
    </Modal>
  )
}

function Tecla({ children }) {
  return <kbd className="inline-flex items-center justify-center min-w-[1.25rem] h-5 px-1 mr-1 rounded border border-line bg-surface-raised font-mono text-[11px] text-ink-muted">{children}</kbd>
}
