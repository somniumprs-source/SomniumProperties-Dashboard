import { useState, useEffect } from 'react'
import { listAll } from '../notion/databases/campanhas.js'

export function useCampanhas() {
  const [campanhas, setCampanhas] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    listAll()
      .then(setCampanhas)
      .catch(err => setError(err.message))
      .finally(() => setLoading(false))
  }, [])

  return { campanhas, loading, error }
}
