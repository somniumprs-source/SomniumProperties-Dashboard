import { useState, useEffect } from 'react'
import { listAll } from '../notion/databases/obras.js'

export function useObras() {
  const [obras, setObras] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    listAll()
      .then(setObras)
      .catch(err => setError(err.message))
      .finally(() => setLoading(false))
  }, [])

  return { obras, loading, error }
}
