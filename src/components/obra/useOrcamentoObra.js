/**
 * Hook que carrega e persiste o orçamento de obra de um imóvel.
 * 1 orçamento por imóvel. Save debounced (1500ms) com PUT idempotente.
 *
 * Uma gravação recusada ou falhada NUNCA passa em silêncio: fica em `erro`
 * (o cabeçalho mostra "Não guardado") e sai um aviso. Com `readOnly` nada é
 * alterado nem enviado. Ao fechar a ficha, a gravação ainda agendada é enviada
 * de imediato em vez de se perder.
 */
import { useState, useEffect, useRef, useCallback } from 'react'
import { apiFetch } from '../../lib/api.js'

const ESTADO_VAZIO = {
  pisos: [],
  seccoes: {},
  notas: '',
  iva_perc: 23,
  total_obra: 0,
  total_licenciamento: 0,
  total_geral: 0,
  existe: false,
}

function avisar(message) {
  try { window.dispatchEvent(new CustomEvent('somnium:toast', { detail: { message, type: 'error' } })) } catch {}
}

export function useOrcamentoObra(imovelId, { readOnly = false } = {}) {
  const [orcamento, setOrcamento] = useState(ESTADO_VAZIO)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [erro, setErro] = useState(null)
  const saveTimer = useRef(null)
  // Snapshot agendado e ainda não enviado (para o enviar ao fechar a ficha).
  const pendente = useRef(null)
  // Imóvel actualmente no ecrã: respostas de outro imóvel não mexem no estado.
  const actual = useRef(imovelId)
  actual.current = imovelId

  const load = useCallback(async () => {
    if (!imovelId) return
    setLoading(true)
    try {
      const r = await apiFetch(`/api/crm/imoveis/${imovelId}/orcamento-obra`)
      if (r.ok) {
        const data = await r.json()
        setOrcamento({ ...ESTADO_VAZIO, ...data })
      }
    } catch {}
    setLoading(false)
  }, [imovelId])

  useEffect(() => { load() }, [load])

  const gravar = useCallback(async (next) => {
    pendente.current = null
    const noEcra = () => actual.current === imovelId
    try {
      const r = await apiFetch(`/api/crm/imoveis/${imovelId}/orcamento-obra`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pisos: next.pisos,
          seccoes: next.seccoes,
          notas: next.notas,
          iva_perc: next.iva_perc,
          zona_aru: next.zona_aru,
          tipo_obra: next.tipo_obra,
          bdi: next.bdi,
        }),
        // Autosave: não dispara refresh global da lista (evita salto p/ topo).
        // A lista actualiza quando o utilizador fecha a ficha (onClose -> load).
        skipRefresh: true,
      })
      if (!r.ok) {
        const j = await r.json().catch(() => ({}))
        throw new Error(j.error || `Erro ${r.status}`)
      }
      const saved = await r.json()
      if (noEcra()) {
        setErro(null)
        // Mantém inputs locais; apenas actualiza totais e meta vindos do server
        setOrcamento((p) => ({
          ...p,
          total_obra: saved.total_obra,
          total_licenciamento: saved.total_licenciamento,
          total_geral: saved.total_geral,
          existe: true,
          updated_at: saved.updated_at,
        }))
      }
    } catch (e) {
      const msg = e?.name === 'AbortError' ? 'o servidor demorou demasiado a responder' : (e?.message || 'erro de ligação')
      if (noEcra()) setErro(msg)
      avisar(`Orçamento de obra NÃO guardado: ${msg}`)
    }
    if (noEcra()) setSaving(false)
  }, [imovelId])

  // Actualiza estado local + agenda PUT debounced
  const update = useCallback((patch) => {
    if (readOnly) return
    setOrcamento((prev) => {
      const next = typeof patch === 'function' ? patch(prev) : { ...prev, ...patch }
      // Agendar save com snapshot do "next"
      clearTimeout(saveTimer.current)
      setSaving(true)
      pendente.current = next
      saveTimer.current = setTimeout(() => gravar(next), 1500)
      return next
    })
  }, [readOnly, gravar])

  // Cleanup: ao sair (ou mudar de imóvel), envia já o que ainda estava agendado.
  useEffect(() => () => {
    clearTimeout(saveTimer.current)
    if (pendente.current) gravar(pendente.current)
  }, [gravar])

  return { orcamento, loading, saving, erro, update, reload: load }
}
