/**
 * Tab "Ficheiros" para a ficha do imóvel.
 * Separa claramente: Fotografias do imóvel vs Documentos.
 */
import { useState, useEffect, useRef } from 'react'
import { Upload, Image, FileText, Trash2, ExternalLink, FolderOpen, Camera, X, ChevronLeft, ChevronRight, File } from 'lucide-react'
import { apiFetch } from '../../lib/api.js'

export function FicheirosTab({ imovelId, driveFolderId }) {
  const [allFiles, setAllFiles] = useState([])
  const [driveData, setDriveData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [lightbox, setLightbox] = useState(null)
  const fileInputRef = useRef(null)

  async function loadData() {
    setLoading(true)
    try {
      const imovelRes = await apiFetch(`/api/crm/imoveis/${imovelId}`)
      const imovel = await imovelRes.json()
      setAllFiles(imovel.fotos ? JSON.parse(imovel.fotos) : [])

      const driveRes = await apiFetch(`/api/crm/imoveis/${imovelId}/drive-files`)
      setDriveData(await driveRes.json())
    } catch (e) {
      console.error('Erro ao carregar ficheiros:', e)
    }
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

  async function handleDelete(fotoId) {
    if (!confirm('Apagar este ficheiro?')) return
    try {
      const r = await apiFetch(`/api/crm/imoveis/${imovelId}/fotos/${fotoId}`, { method: 'DELETE' })
      const data = await r.json()
      if (data.fotos) setAllFiles(data.fotos)
    } catch (e) { console.error('Erro ao apagar:', e) }
  }

  // ── Separar fotos de documentos ─────────────────────────────
  const localPhotos = allFiles.filter(f => f.folder !== 'documentos' && f.type?.startsWith('image/'))
  const localDocs = allFiles.filter(f => f.folder === 'documentos' || f.type?.startsWith('application/'))

  const drivePhotos = (driveData?.fotos || []).map(f => ({
    id: f.id, name: f.name, source: 'drive',
    url: f.thumbnailLink?.replace('=s220', '=s800') || f.viewLink,
    viewLink: f.viewLink, thumbnailLink: f.thumbnailLink,
  }))

  const driveDocuments = driveData?.documentos || []

  // Gallery = local photos + drive photos (só fotos reais, sem documentos)
  const galleryPhotos = [
    ...localPhotos.map(f => ({ ...f, source: 'local', url: f.path })),
    ...drivePhotos,
  ]

  // Documents = local docs + drive documents
  const allDocuments = [
    ...localDocs.map(f => ({ ...f, source: 'local' })),
    ...driveDocuments.map(f => ({ ...f, source: 'drive' })),
  ]

  if (loading) {
    return (
      <div className="space-y-4">
        {[1, 2, 3].map(i => <div key={i} className="h-32 bg-neutral-100 rounded-xl animate-pulse" />)}
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Upload Section */}
      <div className="rounded-xl border-2 border-dashed border-neutral-200 p-6 text-center hover:border-[#C9A84C] transition-colors cursor-pointer"
        onClick={() => fileInputRef.current?.click()}>
        <input ref={fileInputRef} type="file" multiple accept="image/*,.pdf" className="hidden" onChange={handleUpload} />
        <div className="flex flex-col items-center gap-2">
          <div className="w-12 h-12 rounded-full bg-neutral-100 flex items-center justify-center">
            {uploading
              ? <div className="w-5 h-5 border-2 border-[#C9A84C] border-t-transparent rounded-full animate-spin" />
              : <Upload className="w-5 h-5 text-neutral-400" />
            }
          </div>
          <p className="text-sm font-medium text-neutral-600">
            {uploading ? 'A carregar...' : 'Carregar fotos ou documentos'}
          </p>
          <p className="text-xs text-neutral-400">JPG, PNG, WEBP, PDF (max 15MB por ficheiro)</p>
        </div>
      </div>

      {/* Drive Folder Link */}
      {driveFolderId && (
        <a href={`https://drive.google.com/drive/folders/${driveFolderId}`} target="_blank" rel="noopener noreferrer"
          className="flex items-center gap-3 p-3 rounded-xl bg-blue-50 border border-blue-200 hover:bg-blue-100 transition-colors">
          <FolderOpen className="w-5 h-5 text-blue-600" />
          <div className="flex-1">
            <p className="text-sm font-medium text-blue-800">Pasta Google Drive</p>
            <p className="text-xs text-blue-500">Ver todos os ficheiros no Drive</p>
          </div>
          <ExternalLink className="w-4 h-4 text-blue-400" />
        </a>
      )}

      {/* ═══════════ FOTOGRAFIAS ═══════════ */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <Camera className="w-4 h-4 text-emerald-600" />
          <h3 className="text-sm font-bold text-neutral-800">
            Fotografias do Imóvel
          </h3>
          <span className="text-xs text-neutral-400 ml-1">({galleryPhotos.length})</span>
        </div>

        {galleryPhotos.length === 0 ? (
          <div className="text-center py-8 bg-neutral-50 rounded-xl border border-neutral-100">
            <Image className="w-10 h-10 text-neutral-300 mx-auto mb-2" />
            <p className="text-sm text-neutral-400">Sem fotografias</p>
            <p className="text-xs text-neutral-300 mt-1">Carrega fotos ou adiciona-as na pasta Fotos do Drive</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
            {galleryPhotos.map((foto, idx) => (
              <div key={foto.id + '-' + idx} className="group relative aspect-[4/3] rounded-lg overflow-hidden bg-neutral-100 cursor-pointer"
                onClick={() => setLightbox(idx)}>
                <img
                  src={foto.source === 'local' ? foto.url : (foto.thumbnailLink || foto.url)}
                  alt={foto.name}
                  className="w-full h-full object-cover transition-transform group-hover:scale-105"
                  loading="lazy"
                  onError={e => { e.target.src = ''; e.target.className = 'w-full h-full bg-neutral-200 flex items-center justify-center' }}
                />
                <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors flex items-end justify-between p-2 opacity-0 group-hover:opacity-100">
                  <span className="text-[10px] text-white bg-black/50 px-1.5 py-0.5 rounded truncate max-w-[70%]">
                    {foto.name}
                  </span>
                  <div className="flex gap-1">
                    {foto.source === 'drive' && foto.viewLink && (
                      <a href={foto.viewLink} target="_blank" rel="noopener noreferrer"
                        onClick={e => e.stopPropagation()}
                        className="w-6 h-6 rounded-full bg-white/90 flex items-center justify-center hover:bg-white">
                        <ExternalLink className="w-3 h-3 text-neutral-700" />
                      </a>
                    )}
                    {foto.source === 'local' && (
                      <button onClick={e => { e.stopPropagation(); handleDelete(foto.id) }}
                        className="w-6 h-6 rounded-full bg-red-500/90 flex items-center justify-center hover:bg-red-600">
                        <Trash2 className="w-3 h-3 text-white" />
                      </button>
                    )}
                  </div>
                </div>
                {foto.source === 'drive' && (
                  <div className="absolute top-1.5 right-1.5">
                    <span className="text-[9px] font-medium px-1.5 py-0.5 rounded bg-blue-500 text-white">Drive</span>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ═══════════ DOCUMENTOS ═══════════ */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <FileText className="w-4 h-4 text-indigo-600" />
          <h3 className="text-sm font-bold text-neutral-800">
            Documentos
          </h3>
          <span className="text-xs text-neutral-400 ml-1">({allDocuments.length})</span>
        </div>

        {allDocuments.length === 0 ? (
          <div className="text-center py-6 bg-neutral-50 rounded-xl border border-neutral-100">
            <File className="w-8 h-8 text-neutral-300 mx-auto mb-2" />
            <p className="text-sm text-neutral-400">Sem documentos</p>
            <p className="text-xs text-neutral-300 mt-1">Os documentos da pasta Drive e uploads aparecem aqui</p>
          </div>
        ) : (
          <div className="space-y-1.5">
            {allDocuments.map(doc => (
              <div key={doc.id} className="flex items-center gap-3 p-3 bg-white rounded-lg border border-neutral-100 hover:border-neutral-200 transition-colors">
                <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${
                  doc.source === 'drive' ? 'bg-blue-50' : 'bg-indigo-50'
                }`}>
                  {doc.type?.startsWith('image/') || doc.mimeType?.startsWith('image/')
                    ? <Image className={`w-4 h-4 ${doc.source === 'drive' ? 'text-blue-500' : 'text-indigo-500'}`} />
                    : <FileText className={`w-4 h-4 ${doc.source === 'drive' ? 'text-blue-500' : 'text-indigo-500'}`} />
                  }
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-neutral-700 truncate">{doc.name}</p>
                  <div className="flex items-center gap-2 mt-0.5">
                    {doc.size > 0 && <span className="text-xs text-neutral-400">{Math.round(doc.size / 1024)}KB</span>}
                    {(doc.uploaded_at || doc.createdTime) && (
                      <span className="text-xs text-neutral-400">
                        {new Date(doc.uploaded_at || doc.createdTime).toLocaleDateString('pt-PT')}
                      </span>
                    )}
                    <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${
                      doc.source === 'drive' ? 'bg-blue-100 text-blue-600' : 'bg-neutral-100 text-neutral-500'
                    }`}>
                      {doc.source === 'drive' ? 'Drive' : 'Local'}
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  {doc.source === 'drive' && doc.viewLink ? (
                    <a href={doc.viewLink} target="_blank" rel="noopener noreferrer"
                      className="text-xs text-blue-600 hover:underline">Abrir</a>
                  ) : doc.source === 'local' && doc.path ? (
                    <a href={doc.path} target="_blank" rel="noopener noreferrer"
                      className="text-xs text-indigo-600 hover:underline">Abrir</a>
                  ) : null}
                  {doc.source === 'local' && (
                    <button onClick={() => handleDelete(doc.id)} className="text-neutral-300 hover:text-red-500 ml-1">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ═══════════ LIGHTBOX ═══════════ */}
      {lightbox !== null && galleryPhotos[lightbox] && (
        <div className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center" onClick={() => setLightbox(null)}>
          <button className="absolute top-4 right-4 text-white/80 hover:text-white z-10" onClick={() => setLightbox(null)}>
            <X className="w-8 h-8" />
          </button>
          {lightbox > 0 && (
            <button className="absolute left-4 top-1/2 -translate-y-1/2 text-white/60 hover:text-white z-10"
              onClick={e => { e.stopPropagation(); setLightbox(lightbox - 1) }}>
              <ChevronLeft className="w-10 h-10" />
            </button>
          )}
          {lightbox < galleryPhotos.length - 1 && (
            <button className="absolute right-4 top-1/2 -translate-y-1/2 text-white/60 hover:text-white z-10"
              onClick={e => { e.stopPropagation(); setLightbox(lightbox + 1) }}>
              <ChevronRight className="w-10 h-10" />
            </button>
          )}
          <img
            src={galleryPhotos[lightbox].source === 'local'
              ? galleryPhotos[lightbox].url
              : (galleryPhotos[lightbox].thumbnailLink?.replace('=s220', '=s1600') || galleryPhotos[lightbox].url)}
            alt={galleryPhotos[lightbox].name}
            className="max-h-[90vh] max-w-[90vw] object-contain rounded-lg"
            onClick={e => e.stopPropagation()}
          />
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 text-white/80 text-sm bg-black/50 px-4 py-2 rounded-lg">
            {galleryPhotos[lightbox].name} — {lightbox + 1}/{galleryPhotos.length}
          </div>
        </div>
      )}
    </div>
  )
}
