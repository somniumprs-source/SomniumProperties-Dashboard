import { useState, useEffect, useCallback } from 'react'
import { REGIOES, isRegiaoValida } from '../constants.js'

const STORAGE_PREFIX = 'somnium.regiao'
const LAST_KEY = `${STORAGE_PREFIX}.last`

/**
 * Hook regional self-contained. Cada chamada de useRegiaoGate(tabKey)
 * gere a sua própria escolha de região por sessionStorage, independente
 * das outras abas. Devolve o modal pronto a renderizar.
 *
 * Uso:
 *   const { regiao, setRegiao, modal, badge } = useRegiaoGate('projectos')
 *   return <div>{modal}{badge} ... </div>
 *
 * tabKey deve ser único por contexto (ex: 'projectos', 'crm-imoveis',
 * 'metricas', 'operacoes', 'alertas', 'crm-consultores', 'crm-negocios').
 */
export function useRegiaoGate(tabKey, { autoOpen = true } = {}) {
  const sessionKey = `${STORAGE_PREFIX}.${tabKey}`
  const [regiao, setRegiaoState] = useState(null)
  const [modalAberto, setModalAberto] = useState(false)

  useEffect(() => {
    let r = null
    try { r = sessionStorage.getItem(sessionKey) } catch {}
    if (!isRegiaoValida(r)) r = null
    setRegiaoState(r)
    if (autoOpen && !r) setModalAberto(true)
    else setModalAberto(false)
  }, [sessionKey, autoOpen])

  const setRegiao = useCallback((r) => {
    if (!isRegiaoValida(r)) return
    try {
      sessionStorage.setItem(sessionKey, r)
      localStorage.setItem(LAST_KEY, r)
    } catch {}
    setRegiaoState(r)
    setModalAberto(false)
  }, [sessionKey])

  const abrirModal = useCallback(() => setModalAberto(true), [])
  const fecharModal = useCallback(() => {
    if (regiao) setModalAberto(false)
  }, [regiao])

  return {
    regiao,
    setRegiao,
    modalAberto,
    abrirModal,
    fecharModal,
    regioesDisponiveis: REGIOES,
  }
}

export function getUltimaRegiao() {
  try { return localStorage.getItem(LAST_KEY) } catch { return null }
}
