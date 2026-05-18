import { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react'
import { useLocation } from 'react-router-dom'
import { REGIOES, isRegiaoValida } from '../constants.js'

const RegiaoContext = createContext(null)

const STORAGE_PREFIX = 'somnium.regiao'
const LAST_KEY = `${STORAGE_PREFIX}.last`

function tabKeyFromPath(pathname) {
  if (!pathname || pathname === '/') return 'dashboard'
  const seg = pathname.split('/').filter(Boolean)[0] || 'dashboard'
  return seg
}

export function RegiaoProvider({ children }) {
  const location = useLocation()
  const tabKey = useMemo(() => tabKeyFromPath(location.pathname), [location.pathname])
  const sessionKey = `${STORAGE_PREFIX}.${tabKey}`

  const [regiaoAtiva, setRegiaoAtivaState] = useState(null)
  const [modalAberto, setModalAberto] = useState(false)

  useEffect(() => {
    let r = null
    try { r = sessionStorage.getItem(sessionKey) } catch {}
    if (!isRegiaoValida(r)) r = null
    setRegiaoAtivaState(r)
    if (!r) setModalAberto(true)
    else setModalAberto(false)
  }, [sessionKey])

  const setRegiaoAtiva = useCallback((r) => {
    if (!isRegiaoValida(r)) return
    try {
      sessionStorage.setItem(sessionKey, r)
      localStorage.setItem(LAST_KEY, r)
    } catch {}
    setRegiaoAtivaState(r)
    setModalAberto(false)
  }, [sessionKey])

  const abrirModal = useCallback(() => setModalAberto(true), [])
  const fecharModal = useCallback(() => {
    if (regiaoAtiva) setModalAberto(false)
  }, [regiaoAtiva])

  const ultimaRegiao = (() => {
    try { return localStorage.getItem(LAST_KEY) } catch { return null }
  })()

  const value = useMemo(() => ({
    regiaoAtiva,
    setRegiaoAtiva,
    modalAberto,
    abrirModal,
    fecharModal,
    tabKey,
    ultimaRegiao,
    regioesDisponiveis: REGIOES,
  }), [regiaoAtiva, setRegiaoAtiva, modalAberto, abrirModal, fecharModal, tabKey, ultimaRegiao])

  return (
    <RegiaoContext.Provider value={value}>
      {children}
    </RegiaoContext.Provider>
  )
}

export function useRegiao() {
  const ctx = useContext(RegiaoContext)
  if (!ctx) throw new Error('useRegiao() chamado fora de <RegiaoProvider>')
  return ctx
}

// Helper para uso fora do React (apiFetch precisa de saber a região activa
// da aba actual, lendo directamente do sessionStorage por path).
export function getRegiaoActivaFromStorage(pathname) {
  const tab = tabKeyFromPath(pathname || (typeof window !== 'undefined' ? window.location.pathname : ''))
  try {
    const r = sessionStorage.getItem(`${STORAGE_PREFIX}.${tab}`)
    if (isRegiaoValida(r)) return r
  } catch {}
  try {
    const last = localStorage.getItem(LAST_KEY)
    if (isRegiaoValida(last)) return last
  } catch {}
  return null
}
