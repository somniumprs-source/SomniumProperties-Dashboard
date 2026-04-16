/**
 * Tab "Ficheiros" — galeria de fotos + documentos do imóvel.
 */
import { useState, useEffect, useRef } from 'react'
import { Upload, Image, FileText, Trash2, ExternalLink, FolderOpen, X, ChevronLeft, ChevronRight, Plus, ArrowRightLeft, Camera } from 'lucide-react'
import { apiFetch } from '../../lib/api.js'

export function FicheirosTab({ imovelId, driveFolderId }) {
  const [allFiles, setAllFiles] = useState([])
  const [driveData, setDriveData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [lightbox, setLightbox] = useState(null)
  const [section, setSection] = useState('fotos') // 'fotos' | 'docs'
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
      setAllFiles(imovel.fotos ? JSON.parse(imovel.fotos) : [])
      setDriveData(await driveRes.json())
    } catch (e) { console.error('Erro:', e) }
    setLoading(false)
  }

  useEffect(() => { loadData() }, [imovelId])

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
    if (!confirm('Apagar este ficheiro?')) return
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
  ]
  const allDocuments = [
    ...localDocs.map(f => ({ ...f, source: 'local' })),
    ...driveDocuments.map(f => ({ ...f, source: 'drive' })),
  ]

  if (loading) {
    return (
      <div className="space-y-3">
        <div className="h-10 bg-neutral-100 rounded-lg animate-pulse" />
        <div className="grid grid-cols-3 gap-2">
          {[1,2,3,4,5,6].map(i => <div key={i} className="aspect-[4/3] bg-neutral-100 rounded-lg animate-pulse" />)}
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* ── Header: tabs + actions ── */}
      <div className="flex items-center justify-between">
        <div className="flex bg-neutral-100 rounded-lg p-0.5">
          <button onClick={() => setSection('fotos')}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-md text-xs font-semibold transition-all ${
              section === 'fotos' ? 'bg-white text-neutral-800 shadow-sm' : 'text-neutral-500 hover:text-neutral-700'
            }`}>
            <Image className="w-3.5 h-3.5" />
            Fotografias
            {galleryPhotos.length > 0 && (
              <span className={`ml-1 text-[10px] px-1.5 py-0.5 rounded-full ${
                section === 'fotos' ? 'bg-[#C9A84C] text-white' : 'bg-neutral-200 text-neutral-500'
              }`}>{galleryPhotos.length}</span>
            )}
          </button>
          <button onClick={() => setSection('docs')}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-md text-xs font-semibold transition-all ${
              section === 'docs' ? 'bg-white text-neutral-800 shadow-sm' : 'text-neutral-500 hover:text-neutral-700'
            }`}>
            <FileText className="w-3.5 h-3.5" />
            Documentos
            {allDocuments.length > 0 && (
              <span className={`ml-1 text-[10px] px-1.5 py-0.5 rounded-full ${
                section === 'docs' ? 'bg-indigo-500 text-white' : 'bg-neutral-200 text-neutral-500'
              }`}>{allDocuments.length}</span>
            )}
          </button>
        </div>

        <div className="flex items-center gap-2">
          {driveFolderId && (
            <a href={`https://drive.google.com/drive/folders/${driveFolderId}`} target="_blank" rel="noopener noreferrer"
              className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg bg-white border border-neutral-200 text-neutral-600 hover:border-blue-300 hover:text-blue-600 transition-colors">
              <FolderOpen className="w-3.5 h-3.5" /> Drive
              <ExternalLink className="w-3 h-3 opacity-40" />
            </a>
          )}
          <button onClick={() => cameraInputRef.current?.click()}
            className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-lg text-white transition-colors shadow-sm hover:shadow"
            style={{ backgroundColor: '#1a1a1a' }}
            disabled={uploading}>
            <Camera className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Tirar Foto</span>
          </button>
          <button onClick={() => fileInputRef.current?.click()}
            className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-lg text-white transition-colors shadow-sm hover:shadow"
            style={{ backgroundColor: '#C9A84C' }}
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

      {/* ── FOTOGRAFIAS ── */}
      {section === 'fotos' && (
        galleryPhotos.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 rounded-xl bg-neutral-50 border border-dashed border-neutral-200 transition-colors">
            <div className="w-16 h-16 rounded-2xl bg-white border border-neutral-100 flex items-center justify-center mb-3 shadow-sm">
              <Image className="w-7 h-7 text-neutral-300" />
            </div>
            <p className="text-sm font-medium text-neutral-500">Sem fotografias</p>
            <p className="text-xs text-neutral-400 mt-1 mb-4">Carrega ficheiros ou tira uma foto com o telemovel</p>
            <div className="flex gap-2">
              <button onClick={() => cameraInputRef.current?.click()}
                className="flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-lg text-white shadow-sm"
                style={{ backgroundColor: '#1a1a1a' }}>
                <Camera className="w-3.5 h-3.5" /> Tirar Foto
              </button>
              <button onClick={() => fileInputRef.current?.click()}
                className="flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-lg text-white shadow-sm"
                style={{ backgroundColor: '#C9A84C' }}>
                <Plus className="w-3.5 h-3.5" /> Carregar
              </button>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-1.5">
            {galleryPhotos.map((foto, idx) => (
              <div key={foto.id + '-' + idx}
                className="group relative aspect-square rounded-xl overflow-hidden bg-neutral-100 cursor-pointer ring-0 hover:ring-2 hover:ring-[#C9A84C]/50 transition-all"
                onClick={() => setLightbox(idx)}>
                <img
                  src={foto.source === 'local' ? foto.url : (foto.thumbnailLink || foto.url)}
                  alt={foto.name}
                  className="w-full h-full object-cover"
                  loading="lazy"
                  onError={e => { e.target.style.display = 'none' }}
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
                      className="w-7 h-7 rounded-lg bg-white/95 flex items-center justify-center shadow-sm hover:bg-indigo-50">
                      <ArrowRightLeft className="w-3.5 h-3.5 text-indigo-600" />
                    </button>
                  )}
                  {foto.source === 'drive' && foto.viewLink && (
                    <a href={foto.viewLink} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()}
                      className="w-7 h-7 rounded-lg bg-white/95 flex items-center justify-center shadow-sm hover:bg-white">
                      <ExternalLink className="w-3.5 h-3.5 text-neutral-600" />
                    </a>
                  )}
                  {foto.source === 'local' && (
                    <button onClick={e => { e.stopPropagation(); handleDelete(foto.id) }}
                      className="w-7 h-7 rounded-lg bg-red-500/90 flex items-center justify-center shadow-sm hover:bg-red-600">
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
            <div className="aspect-square rounded-xl border-2 border-dashed border-neutral-200 flex flex-col items-center justify-center cursor-pointer hover:border-[#C9A84C] hover:bg-[#faf8f2] transition-colors"
              onClick={() => fileInputRef.current?.click()}>
              <Plus className="w-6 h-6 text-neutral-300 mb-1" />
              <span className="text-[10px] text-neutral-400 font-medium">Adicionar</span>
            </div>
          </div>
        )
      )}

      {/* ── DOCUMENTOS ── */}
      {section === 'docs' && (
        allDocuments.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 rounded-xl bg-neutral-50 border border-dashed border-neutral-200 cursor-pointer hover:border-indigo-300 transition-colors"
            onClick={() => fileInputRef.current?.click()}>
            <div className="w-16 h-16 rounded-2xl bg-white border border-neutral-100 flex items-center justify-center mb-3 shadow-sm">
              <FileText className="w-7 h-7 text-neutral-300" />
            </div>
            <p className="text-sm font-medium text-neutral-500">Sem documentos</p>
            <p className="text-xs text-neutral-400 mt-1">Os PDFs e ficheiros da pasta Drive aparecem aqui</p>
          </div>
        ) : (
          <div className="rounded-xl border border-neutral-100 overflow-hidden divide-y divide-neutral-50">
            {allDocuments.map(doc => {
              const isPdf = doc.name?.toLowerCase().endsWith('.pdf') || doc.mimeType?.includes('pdf') || doc.type?.includes('pdf')
              const isImage = doc.type?.startsWith('image/') || doc.mimeType?.startsWith('image/')
              const link = doc.source === 'drive' ? doc.viewLink : doc.path
              return (
                <div key={doc.id} className="flex items-center gap-3 px-4 py-3 bg-white hover:bg-neutral-50/80 transition-colors group">
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                    isPdf ? 'bg-red-50' : isImage ? 'bg-amber-50' : 'bg-neutral-50'
                  }`}>
                    {isPdf ? (
                      <span className="text-[10px] font-black text-red-500">PDF</span>
                    ) : isImage ? (
                      <Image className="w-4.5 h-4.5 text-amber-500" />
                    ) : (
                      <FileText className="w-4.5 h-4.5 text-neutral-400" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-neutral-700 truncate">{doc.name}</p>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      {doc.size > 0 && (
                        <span className="text-[10px] text-neutral-400">
                          {doc.size > 1024 * 1024 ? `${(doc.size / 1024 / 1024).toFixed(1)}MB` : `${Math.round(doc.size / 1024)}KB`}
                        </span>
                      )}
                      {(doc.uploaded_at || doc.createdTime) && (
                        <span className="text-[10px] text-neutral-300">
                          {new Date(doc.uploaded_at || doc.createdTime).toLocaleDateString('pt-PT')}
                        </span>
                      )}
                      {doc.source === 'drive' && (
                        <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded bg-blue-50 text-blue-500">Drive</span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0 opacity-60 group-hover:opacity-100 transition-opacity">
                    {link && (
                      <a href={link} target="_blank" rel="noopener noreferrer"
                        className="px-3 py-1.5 text-[11px] font-medium rounded-lg bg-neutral-100 text-neutral-600 hover:bg-neutral-200 transition-colors">
                        Abrir
                      </a>
                    )}
                    {doc.source === 'local' && isImage && (
                      <button onClick={() => handleMove(doc.id, 'fotos')} title="Mover para Fotografias"
                        className="p-1.5 rounded-lg text-neutral-300 hover:bg-emerald-50 hover:text-emerald-500 transition-colors">
                        <ArrowRightLeft className="w-3.5 h-3.5" />
                      </button>
                    )}
                    {doc.source === 'local' && (
                      <button onClick={() => handleDelete(doc.id)}
                        className="p-1.5 rounded-lg text-neutral-300 hover:bg-red-50 hover:text-red-500 transition-colors">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )
      )}

      {/* ── LIGHTBOX ── */}
      {lightbox !== null && galleryPhotos[lightbox] && (
        <div className="fixed inset-0 z-50 bg-black/95 flex items-center justify-center backdrop-blur-sm" onClick={() => setLightbox(null)}>
          {/* Close */}
          <button className="absolute top-4 right-4 w-10 h-10 rounded-full bg-white/10 flex items-center justify-center text-white/80 hover:bg-white/20 hover:text-white z-10 transition-colors"
            onClick={() => setLightbox(null)}>
            <X className="w-5 h-5" />
          </button>
          {/* Nav */}
          {lightbox > 0 && (
            <button className="absolute left-3 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-white/10 flex items-center justify-center text-white/60 hover:bg-white/20 hover:text-white z-10 transition-colors"
              onClick={e => { e.stopPropagation(); setLightbox(lightbox - 1) }}>
              <ChevronLeft className="w-6 h-6" />
            </button>
          )}
          {lightbox < galleryPhotos.length - 1 && (
            <button className="absolute right-3 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-white/10 flex items-center justify-center text-white/60 hover:bg-white/20 hover:text-white z-10 transition-colors"
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
                  className={`w-10 h-10 rounded-md overflow-hidden shrink-0 cursor-pointer transition-all ${
                    i === lightbox ? 'ring-2 ring-white scale-110' : 'opacity-50 hover:opacity-80'
                  }`}
                  onClick={e => { e.stopPropagation(); setLightbox(i) }}>
                  <img src={f.source === 'local' ? f.url : (f.thumbnailLink || f.url)}
                    alt="" className="w-full h-full object-cover" />
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
