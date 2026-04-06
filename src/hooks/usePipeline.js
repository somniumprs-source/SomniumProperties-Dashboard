import { useState, useEffect } from 'react'
import { listAll } from '../notion/databases/pipeline.js'

export function usePipeline() {
  const [pipeline, setPipeline] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    listAll()
      .then(setPipeline)
      .catch(err => setError(err.message))
      .finally(() => setLoading(false))
  }, [])

  return { pipeline, loading, error }
}
