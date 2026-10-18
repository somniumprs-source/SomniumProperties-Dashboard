/**
 * Tab "Ficheiros" — galeria de fotos + documentos do imóvel.
 */
import { useState, useEffect, useRef } from 'react'
import { Upload, Image, FileText, Trash2, ExternalLink, FolderOpen, X, ChevronLeft, ChevronRight, Plus, ArrowRightLeft, Camera } from 'lucide-react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { apiFetch } from '../../lib/api.js'
import { overlayVariants } from '../../lib/motion.js'
import { ImovelDocumentacao } from './ImovelDocumentacao/index.jsx'
import { confirmar } from '../ui/ConfirmDialog.jsx'

function baseName(name) {
  if (!name || typeof name !== 'string') return ''
  return name.replace(/\.[^.]+$/, '').trim().toLowerCase()
}

export function FicheirosTab({ imovelId, driveFolderId, tipoImovel }) {
  const [allFiles, setAllFiles] = useState([])
  const [driveData, setDriveData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [lightbox, setLightbox] = useState(null)
  const [section, setSection] = useState('fotos') // 'fotos' | 'docs'
  // IDs de fotos cujo <img> falhou a carregar (404, broken URL, content-type
  // não imagem servido como tal). São automaticamente escondidas e ficam
  // acessíveis para limpeza via botão "Remover fotos quebradas".
  const [brokenIds, setBrokenIds] = useState(() => new Set())
  const [cleaning, setCleaning] = useState(false)
  const fileInputRef = useRef(null)
  const cameraInputRef = useRef(null)

  async function loadData() {
    setLoading(true)
    try {
      const [imovelRes, driveRes] = await Promise.all([
        apiFetch(`/api/crm/imoveis/${imovelId}`),
        apiFetch(`/api/crm/imoveis/${imovelId}/drive-files`),
      ])
      const imovel = await imovelRes.json()
      const driveJson = await driveRes.json()
      let fotos = imovel.fotos ? JSON.parse(imovel.fotos) : []

      // Auto-dedup de fotos locais por nome (sem extensao, case-insensitive).
      // Drive nao da para apagar daqui — se o nome ja existir no Drive,
      // apagamos o duplicado local e ficamos com a versao do Drive.
      const driveNames = new Set(
        (driveJson?.fotos || []).map(f => baseName(f.name)).filter(Boolean)
      )
      const seen = new Set()
      const toDelete = []
      for (const f of fotos) {
        if (f.folder === 'documentos' || !f.type?.startsWith('image/')) continue
        const key = baseName(f.name)
        if (!key) continue
        if (seen.has(key) || driveNames.has(key)) toDelete.push(f.id)
        else seen.add(key)
      }
      if (toDelete.length > 0) {
        const deleted = new Set(toDelete)
        await Promise.allSettled(toDelete.map(id =>
          apiFetch(`/api/crm/imoveis/${imovelId}/fotos/${id}`, { method: 'DELETE' })
        ))
        fotos = fotos.filter(f => !deleted.has(f.id))
      }

      setAllFiles(fotos)
      setDriveData(driveJson)
    } catch (e) { console.error('Erro:', e) }
    setLoading(false)
  }

  useEffect(() => { loadData() }, [imovelId])

  // Quando carregamos lista nova, esquecer os "broken" anteriores —
  // pode ser ficheiro reuploaded com mesmo id, etc.
  useEffect(() => { setBrokenIds(new Set()) }, [imovelId])

  function markBroken(id) {
    setBrokenIds(prev => {
      if (prev.has(id)) return prev
      const next = new Set(prev)
      next.add(id)
      return next
    })
  }

  async function cleanBrokenPhotos() {
    if (brokenIds.size === 0) return
    if (!(await confirmar(`Remover ${brokenIds.size} foto${brokenIds.size > 1 ? 's' : ''} que não carregou${brokenIds.size > 1 ? 'aram' : ''}?`))) return
    setCleaning(true)
    try {
      // Apaga em paralelo cada foto broken via endpoint existente.
      await Promise.all([...brokenIds].map(id =>
        apiFetch(`/api/crm/imoveis/${imovelId}/fotos/${id}`, { method: 'DELETE' }).catch(() => null)
      ))
      // Recarrega lista oficial do servidor
      await loadData()
      setBrokenIds(new Set())
    } catch (e) { console.error('Erro a remover fotos quebradas:', e) }
    setCleaning(false)
  }

  async function handleUpload(e) {
    const files = e.target.files
    if (!files?.length) return
    setUploading(true)
    try {
      const fd = new FormData()
      for (const f of files) fd.append('fotos', f)
      const r = await apiFetch(`/api/crm/imoveis/${imovelId}/fotos`, { method: 'POST', body: fd })
      const data = await r.json()
      if (data.fotos) setAllFiles(data.fotos)
    } catch (e) { console.error('Erro upload:', e) }
    setUploading(false)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  async function handleCameraCapture(e) {
    const files = e.target.files
    if (!files?.length) return
    setUploading(true)
    try {
      const fd = new FormData()
      for (const f of files) fd.append('fotos', f)
      const r = await apiFetch(`/api/crm/imoveis/${imovelId}/fotos`, { method: 'POST', body: fd })
      const data = await r.json()
      if (data.fotos) setAllFiles(data.fotos)
    } catch (e) { console.error('Erro camera:', e) }
    setUploading(false)
    if (cameraInputRef.current) cameraInputRef.current.value = ''
  }

  async function handleDelete(fotoId) {
    if (!(await confirmar('Apagar este ficheiro?'))) return
    try {
      const r = await apiFetch(`/api/crm/imoveis/${imovelId}/fotos/${fotoId}`, { method: 'DELETE' })
      const data = await r.json()
      if (data.fotos) setAllFiles(data.fotos)
    } catch (e) { console.error('Erro:', e) }
  }

  async function handleMove(fotoId, toFolder) {
    try {
      const r = await apiFetch(`/api/crm/imoveis/${imovelId}/fotos/${fotoId}/mover`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ folder: toFolder }),
      })
      const data = await r.json()
      if (data.fotos) setAllFiles(data.fotos)
    } catch (e) { console.error('Erro:', e) }
  }

  // Separar
  const localPhotos = allFiles.filter(f => f.folder !== 'documentos' && f.type?.startsWith('image/'))
  const localDocs = allFiles.filter(f => f.folder === 'documentos' || f.type?.startsWith('application/'))
  const drivePhotos = (driveData?.fotos || []).map(f => ({
    id: f.id, name: f.name, source: 'drive',
    url: f.thumbnailLink?.replace('=s220', '=s800') || f.viewLink,
    viewLink: f.viewLink, thumbnailLink: f.thumbnailLink,
  }))
  const driveDocuments = driveData?.documentos || []

  const galleryPhotos = [
    ...localPhotos.map(f => ({ ...f, source: 'local', url: f.path })),
    ...drivePhotos,
  ].filter(f => !brokenIds.has(f.id))
  const allDocuments = [
    ...localDocs.map(f => ({ ...f, source: 'local' })),
    ...driveDocuments.map(f => ({ ...f, source: 'drive' })),
  ]

  // Visualizador em ecrã inteiro: Esc fecha, setas navegam, página não rola.
  const lightboxAberto = lightbox !== null && !!galleryPhotos[lightbox]
  const totalFotos = galleryPhotos.length
  useEffect(() => {
    if (!lightboxAberto) return
    function onKey(e) {
      if (e.key === 'Escape') setLightbox(null)
      else if (e.key === 'ArrowLeft') setLightbox(i => (i > 0 ? i - 1 : i))
      else if (e.key === 'ArrowRight') setLightbox(i => (i < totalFotos - 1 ? i + 1 : i))
    }
    window.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
    }
  }, [lightboxAberto, totalFotos])

  if (loading) {
    return (
      <div className="space-y-3">
        <div className="h-10 bg-surface-muted rounded-lg animate-pulse" />
        <div className="grid grid-cols-3 gap-2">
          {[1,2,3,4,5,6].map(i => <div key={i} className="aspect-[4/3] bg-surface-muted rounded-lg animate-pulse" />)}
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* ── Header: tabs + actions ── */}
      <div className="flex items-center justify-between">
        <div className="flex bg-surface-muted rounded-lg p-0.5">
          <button onClick={() => setSection('fotos')}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-md text-xs font-semibold transition-[background-color,border-color,color,box-shadow,opacity,transform] ${
              section === 'fotos' ? 'bg-surface-raised text-ink shadow-sm' : 'text-ink-muted hover:text-ink'
            }`}>
            <Image className="w-3.5 h-3.5" />
            Fotografias
            {galleryPhotos.length > 0 && (
              <span className={`ml-1 text-[10px] px-1.5 py-0.5 rounded-full ${
                section === 'fotos' ? 'bg-brand-gold text-white' : 'bg-line text-ink-muted'
              }`}>{galleryPhotos.length}</span>
            )}
          </button>
          <button onClick={() => setSection('docs')}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-md text-xs font-semibold transition-[background-color,border-color,color,box-shadow,opacity,transform] ${
              section === 'docs' ? 'bg-surface-raised text-ink shadow-sm' : 'text-ink-muted hover:text-ink'
            }`}>
            <FileText className="w-3.5 h-3.5" />
            Documentação
            {allDocuments.length > 0 && (
              <span className={`ml-1 text-[10px] px-1.5 py-0.5 rounded-full ${
                section === 'docs' ? 'bg-ink text-surface' : 'bg-line text-ink-muted'
              }`}>{allDocuments.length}</span>
            )}
          </button>
        </div>

        <div className="flex items-center gap-2">
          {driveFolderId && (
            <a href={`https://drive.google.com/drive/folders/${driveFolderId}`} target="_blank" rel="noopener noreferrer"
              className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg bg-surface-raised border border-line text-ink-muted hover:border-line hover:text-ink transition-colors">
              <FolderOpen className="w-3.5 h-3.5" /> Drive
              <ExternalLink className="w-3 h-3 opacity-40" />
            </a>
          )}
          <button onClick={() => cameraInputRef.current?.click()}
            className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-lg bg-ink text-surface transition-[box-shadow,opacity] shadow-sm hover:opacity-90"
            disabled={uploading}>
            <Camera className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Tirar Foto</span>
          </button>
          <button onClick={() => fileInputRef.current?.click()}
            className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-lg bg-accent text-accent-foreground hover:brightness-[1.04] transition-colors shadow-sm hover:shadow"
            disabled={uploading}>
            {uploading
              ? <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
              : <Plus className="w-3.5 h-3.5" />
            }
            {uploading ? 'A carregar...' : 'Adicionar'}
          </button>
          <input ref={cameraInputRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={handleCameraCapture} />
          <input ref={fileInputRef} type="file" multiple accept="image/*,.pdf,.doc,.docx,.xls,.xlsx" className="hidden" onChange={handleUpload} />
        </div>
      </div>

      {/* Aviso + acção para fotos quebradas (scraper falhou, URL caducou, etc.) */}
      {section === 'fotos' && brokenIds.size > 0 && (
        <div className="flex items-center justify-between gap-3 px-4 py-2.5 rounded-lg bg-warning/10 border border-warning/30">
          <div className="text-xs text-warning">
            <strong>{brokenIds.size}</strong> {brokenIds.size === 1 ? 'foto não carregou' : 'fotos não carregaram'} —
            provavelmente falharam ao serem extraídas do anúncio original.
          </div>
          <button onClick={cleanBrokenPhotos} disabled={cleaning}
            className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-warning text-white hover:bg-amber-700 disabled:opacity-50 whitespace-nowrap">
            {cleaning ? 'A remover…' : `Remover ${brokenIds.size}`}
          </button>
        </div>
      )}

      {/* ── FOTOGRAFIAS ── */}
      {section === 'fotos' && (
        galleryPhotos.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 rounded-xl bg-surface border border-dashed border-line transition-colors">
            <div className="w-16 h-16 rounded-2xl bg-surface-raised border border-line flex items-center justify-center mb-3 shadow-sm">
              <Image className="w-7 h-7 text-ink-muted/70" />
            </div>
            <p className="text-sm font-medium text-ink-muted">Sem fotografias</p>
            <p className="text-xs text-ink-muted mt-1 mb-4">Carrega ficheiros ou tira uma foto com o telemovel</p>
            <div className="flex gap-2">
              <button onClick={() => cameraInputRef.current?.click()}
                className="flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-lg bg-ink text-surface shadow-sm hover:opacity-90">
                <Camera className="w-3.5 h-3.5" /> Tirar Foto
              </button>
              <button onClick={() => fileInputRef.current?.click()}
                className="flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-lg bg-accent text-accent-foreground hover:brightness-[1.04] shadow-sm">
                <Plus className="w-3.5 h-3.5" /> Carregar
              </button>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-1.5">
            {galleryPhotos.map((foto, idx) => (
              <div key={foto.id + '-' + idx}
                className="group relative aspect-square rounded-xl overflow-hidden bg-surface-muted cursor-pointer ring-0 hover:ring-2 hover:ring-brand-gold/50 transition-[background-color,border-color,color,box-shadow,opacity,transform]"
                onClick={() => setLightbox(idx)}>
                <img
                  src={foto.source === 'local' ? foto.url : (foto.thumbnailLink || foto.url)}
                  alt={foto.name}
                  className="w-full h-full object-cover"
                  loading="lazy"
                  onError={() => markBroken(foto.id)}
                />
                {/* Hover overlay */}
                <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                <div className="absolute bottom-0 left-0 right-0 p-2 opacity-0 group-hover:opacity-100 transition-opacity">
                  <p className="text-[10px] text-white/90 truncate">{foto.name}</p>
                </div>
                {/* Actions */}
                <div className="absolute top-1.5 right-1.5 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  {foto.source === 'local' && (
                    <button onClick={e => { e.stopPropagation(); handleMove(foto.id, 'documentos') }}
                      title="Mover para Documentos"
                      className="w-7 h-7 rounded-lg bg-surface-raised/95 flex items-center justify-center shadow-sm hover:bg-surface-muted">
                      <ArrowRightLeft className="w-3.5 h-3.5 text-ink" />
                    </button>
                  )}
                  {foto.source === 'drive' && foto.viewLink && (
                    <a href={foto.viewLink} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()}
                      className="w-7 h-7 rounded-lg bg-surface-raised/95 flex items-center justify-center shadow-sm hover:bg-surface-raised">
                      <ExternalLink className="w-3.5 h-3.5 text-ink-muted" />
                    </a>
                  )}
                  {foto.source === 'local' && (
                    <button onClick={e => { e.stopPropagation(); handleDelete(foto.id) }}
                      className="w-7 h-7 rounded-lg bg-red-500/90 flex items-center justify-center shadow-sm hover:bg-danger">
                      <Trash2 className="w-3.5 h-3.5 text-white" />
                    </button>
                  )}
                </div>
                {/* Source indicator — small dot */}
                {foto.source === 'drive' && (
                  <div className="absolute top-2 left-2 w-2 h-2 rounded-full bg-blue-500 ring-2 ring-white shadow-sm" title="Google Drive" />
                )}
              </div>
            ))}

            {/* Add more button */}
            <div className="aspect-square rounded-xl border-2 border-dashed border-line flex flex-col items-center justify-center cursor-pointer hover:border-ink/30 hover:bg-surface-muted transition-colors"
              onClick={() => fileInputRef.current?.click()}>
              <Plus className="w-6 h-6 text-ink-muted/70 mb-1" />
              <span className="text-[10px] text-ink-muted font-medium">Adicionar</span>
            </div>
          </div>
        )
      )}

      {/* ── DOCUMENTAÇÃO (checklist + análise IA + relatório) ── */}
      {section === 'docs' && (
        <ImovelDocumentacao imovelId={imovelId} tipoImovel={tipoImovel} />
      )}

      {/* ── LIGHTBOX ── */}
      {/* Propositadamente escuro (fotografias), igual nos dois temas. */}
      {createPortal(
      <AnimatePresence>
      {lightboxAberto && (
        <motion.div key="lightbox" variants={overlayVariants} initial="initial" animate="animate" exit="exit"
          role="dialog" aria-modal="true" aria-label={`Fotografia ${lightbox + 1} de ${galleryPhotos.length}`}
          className="fixed inset-0 z-50 bg-black/95 flex items-center justify-center backdrop-blur-sm" onClick={() => setLightbox(null)}>
          {/* Close */}
          <button aria-label="Fechar" className="absolute top-4 right-4 w-10 h-10 rounded-full bg-white/10 flex items-center justify-center text-white/80 hover:bg-white/20 hover:text-white z-10 transition-colors duration-fast"
            onClick={() => setLightbox(null)}>
            <X className="w-5 h-5" />
          </button>
          {/* Nav */}
          {lightbox > 0 && (
            <button aria-label="Fotografia anterior" className="absolute left-3 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-white/10 flex items-center justify-center text-white/60 hover:bg-white/20 hover:text-white z-10 transition-colors duration-fast"
              onClick={e => { e.stopPropagation(); setLightbox(lightbox - 1) }}>
              <ChevronLeft className="w-6 h-6" />
            </button>
          )}
          {lightbox < galleryPhotos.length - 1 && (
            <button aria-label="Fotografia seguinte" className="absolute right-3 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-white/10 flex items-center justify-center text-white/60 hover:bg-white/20 hover:text-white z-10 transition-colors duration-fast"
              onClick={e => { e.stopPropagation(); setLightbox(lightbox + 1) }}>
              <ChevronRight className="w-6 h-6" />
            </button>
          )}
          {/* Image */}
          <img
            src={galleryPhotos[lightbox].source === 'local'
              ? galleryPhotos[lightbox].url
              : (galleryPhotos[lightbox].thumbnailLink?.replace('=s220', '=s1600') || galleryPhotos[lightbox].url)}
            alt={galleryPhotos[lightbox].name}
            className="max-h-[85vh] max-w-[90vw] object-contain rounded-lg shadow-2xl"
            onClick={e => e.stopPropagation()}
          />
          {/* Bottom bar */}
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-3 bg-black/60 backdrop-blur-sm px-5 py-2.5 rounded-full">
            <span className="text-xs text-white/60">{lightbox + 1} / {galleryPhotos.length}</span>
            <span className="w-px h-3 bg-white/20" />
            <span className="text-xs text-white/80 max-w-[200px] truncate">{galleryPhotos[lightbox].name}</span>
          </div>
          {/* Thumbnail strip */}
          {galleryPhotos.length > 1 && (
            <div className="absolute bottom-14 left-1/2 -translate-x-1/2 flex gap-1 max-w-[80vw] overflow-x-auto px-2 py-1">
              {galleryPhotos.map((f, i) => (
                <div key={f.id + '-t-' + i}
                  className={`w-10 h-10 rounded-md overflow-hidden shrink-0 cursor-pointer transition-[box-shadow,opacity,transform] duration-fast ${
                    i === lightbox ? 'ring-2 ring-white scale-110' : 'opacity-50 hover:opacity-80'
                  }`}
                  onClick={e => { e.stopPropagation(); setLightbox(i) }}>
                  <img src={f.source === 'local' ? f.url : (f.thumbnailLink || f.url)}
                    alt="" className="w-full h-full object-cover" loading="lazy" decoding="async" />
                </div>
              ))}
            </div>
          )}
        </motion.div>
      )}
      </AnimatePresence>,
      document.body,
      )}
    </div>
  )
}
