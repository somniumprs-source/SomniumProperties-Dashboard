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

/**
 * Determina a região activa a partir do path actual + sessionStorage.
 * Usado pelo apiFetch para auto-injectar X-Regiao em mutações disparadas
 * por sub-componentes (DetailPanel, tabs) que não recebem regiao via prop.
 *
 * Mapping:
 *   /crm    + ?tab=Imóveis|Consultores|Construtores|Negócios → crm-<tab>
 *   /projectos[/...]                                          → projectos
 *
 * Restantes paths → null (sem filtro). Mutações de entidades não-regionais
 * (lookups, tarefas globais, notificações) não pagam header desnecessário.
 */
export function getRegiaoActivaFromStorage() {
  if (typeof window === 'undefined') return null
  let key = null
  try {
    const path = window.location.pathname || '/'
    if (path.startsWith('/projectos')) {
      key = `${STORAGE_PREFIX}.projectos`
    } else if (path.startsWith('/crm')) {
      const params = new URLSearchParams(window.location.search || '')
      const tab = params.get('tab') || 'Imóveis'
      const slug = tab.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
      // Só sub-tabs regionais (Imóveis, Consultores, Construtores, Negócios).
      // Investidores e Despesas são pool unificado.
      if (['imoveis', 'consultores', 'construtores', 'negocios'].includes(slug)) {
        key = `${STORAGE_PREFIX}.crm-${slug}`
      }
    } else if (path.startsWith('/administracao/regiao')) {
      key = `${STORAGE_PREFIX}.administracao-regiao`
    }
  } catch {}
  if (!key) return null
  try {
    const r = sessionStorage.getItem(key)
    return isRegiaoValida(r) ? r : null
  } catch { return null }
}
