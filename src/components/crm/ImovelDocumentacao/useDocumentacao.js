import { useState, useEffect, useCallback, useMemo } from 'react'
import { apiFetch } from '../../../lib/api.js'
import { detectarInconsistencias, estadoFromValido } from './documentacao.config.js'

/**
 * Lógica de estado do módulo de documentação (importação livre):
 * - carrega os documentos (coluna fotos, pasta "documentos") e as análises
 *   persistidas (coluna documentacao_analise) do imóvel;
 * - faz upload (reutiliza POST /fotos + move para a pasta documentos);
 * - chama o endpoint de análise por IA (opt-in, por documento) e persiste o resultado;
 * - agrega flags e cruza dados_chave entre documentos para detectar inconsistências.
 */
export function useDocumentacao(imovelId, tipoImovelProp) {
  const [docs, setDocs] = useState([])           // ficheiros (pasta documentos)
  const [analises, setAnalises] = useState([])    // documentacao_analise
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [uploadErro, setUploadErro] = useState(null) // erro do último upload
  const [analyzing, setAnalyzing] = useState(() => new Set()) // fotoIds em análise
  const [erros, setErros] = useState({})          // { [fotoId]: mensagem }

  const isDoc = (f) =>
    f.folder === 'documentos' ||
    f.type === 'application/pdf' ||
    /\.pdf$/i.test(f.name || '') ||
    (f.type?.startsWith('application/'))

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const r = await apiFetch(`/api/crm/imoveis/${imovelId}`)
      const imovel = await r.json()
      const fotos = imovel.fotos ? JSON.parse(imovel.fotos) : []
      setDocs(fotos.filter(isDoc))
      const an = imovel.documentacao_analise
      setAnalises(Array.isArray(an) ? an : (typeof an === 'string' ? safeParse(an) : []))
    } catch (e) { console.error('Erro a carregar documentação:', e) }
    setLoading(false)
  }, [imovelId])

  useEffect(() => { load() }, [load])

  // Upload: envia ficheiros já marcados como pertencentes à pasta "documentos".
  // O backend grava o folder na própria entrada (write único), evitando a race
  // de chamadas /mover em paralelo que sobrepunham o array e perdiam documentos.
  // Timeout alargado (uploads de fotos/PDF grandes excediam os 30s default e
  // abortavam sem feedback). Erros são expostos em vez de engolidos.
  const upload = useCallback(async (files) => {
    if (!files?.length) return
    setUploading(true)
    setUploadErro(null)
    try {
      const fd = new FormData()
      fd.append('folder', 'documentos')
      for (const f of files) fd.append('fotos', f)
      const r = await apiFetch(`/api/crm/imoveis/${imovelId}/fotos`, { method: 'POST', body: fd, timeoutMs: 120000 })
      const data = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(data.error || `Falha no upload (HTTP ${r.status})`)
      // Refletir já o resultado devolvido pelo servidor (não depender só do reload).
      if (Array.isArray(data.fotos)) setDocs(data.fotos.filter(isDoc))
      await load()
    } catch (e) {
      const msg = e.name === 'AbortError' ? 'Upload demorou demasiado e foi cancelado. Tenta ficheiros mais pequenos.' : (e.message || 'Erro no upload')
      setUploadErro(msg)
      console.error('Erro no upload:', e)
    }
    setUploading(false)
  }, [imovelId, load])

  // Analisa um documento via IA (endpoint backend → Claude). Opt-in, por ficheiro.
  const analisar = useCallback(async (doc) => {
    setErros(prev => { const n = { ...prev }; delete n[doc.id]; return n })
    setAnalyzing(prev => new Set(prev).add(doc.id))
    try {
      const r = await apiFetch(`/api/crm/imoveis/${imovelId}/documentos/analise`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        timeoutMs: 120000,
        body: JSON.stringify({ path: doc.path, name: doc.name, type: doc.type, fotoId: doc.id, tipoImovel: tipoImovelProp }),
      })
      const data = await r.json()
      if (!r.ok) throw new Error(data.error || 'Falha na análise')
      if (Array.isArray(data.documentacao_analise)) setAnalises(data.documentacao_analise)
    } catch (e) {
      setErros(prev => ({ ...prev, [doc.id]: e.message || 'Erro na análise' }))
    } finally {
      setAnalyzing(prev => { const n = new Set(prev); n.delete(doc.id); return n })
    }
  }, [imovelId, tipoImovelProp])

  const analisarTodos = useCallback(async () => {
    const analisados = new Set(analises.map(a => a.fotoId).filter(Boolean))
    for (const d of docs) {
      if (!analisados.has(d.id)) await analisar(d)
    }
  }, [docs, analises, analisar])

  const removerAnalise = useCallback(async (fotoId) => {
    try {
      const r = await apiFetch(`/api/crm/imoveis/${imovelId}/documentos/analise/${fotoId}`, { method: 'DELETE' })
      const data = await r.json()
      if (Array.isArray(data.documentacao_analise)) setAnalises(data.documentacao_analise)
    } catch (e) { console.error('Erro a remover análise:', e) }
  }, [imovelId])

  // Análise associada a um ficheiro (por fotoId).
  const analiseDoFicheiro = useCallback(
    (fotoId) => analises.find(a => a.fotoId === fotoId) || null,
    [analises]
  )

  // Flags agregadas de todas as análises, ordenadas por severidade.
  const flags = useMemo(() => {
    const out = []
    for (const a of analises) {
      for (const f of (a.flags || [])) out.push({ ...f, origem: a.tipo_documento || a.nome_ficheiro || 'Documento' })
    }
    const rank = { critical: 0, warning: 1, info: 2 }
    return out.sort((x, y) => (rank[x.severity] ?? 3) - (rank[y.severity] ?? 3))
  }, [analises])

  // Inconsistências entre documentos (cruzamento de dados_chave, sem IA).
  const inconsistencias = useMemo(() => detectarInconsistencias(analises), [analises])

  // Resumo de contagens (substitui o score por checklist).
  const resumoEstado = useMemo(() => {
    const validos = analises.filter(a => a.valido === true).length
    const alertas = analises.filter(a => a.valido === 'warning').length
    const problemas = analises.filter(a => a.valido !== true && a.valido !== 'warning').length
    return {
      totalDocs: docs.length,
      analisados: analises.length,
      porAnalisar: docs.filter(d => !analises.some(a => a.fotoId === d.id)).length,
      validos,
      alertas,
      problemas,
      nInconsistencias: inconsistencias.length,
      nFlags: flags.length,
      nCriticas: flags.filter(f => f.severity === 'critical').length,
    }
  }, [docs, analises, flags, inconsistencias])

  return {
    docs, analises, loading, uploading, uploadErro, analyzing, erros,
    upload, analisar, analisarTodos, removerAnalise, analiseDoFicheiro,
    flags, inconsistencias, resumoEstado, estadoFromValido, reload: load,
  }
}

function safeParse(s) { try { return JSON.parse(s) } catch { return [] } }
