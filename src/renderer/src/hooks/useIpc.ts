import { useState, useEffect, useCallback } from 'react'

export function useIpc<T>(channel: string, ...args: unknown[]) {
  const [data, setData] = useState<T | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(() => {
    setLoading(true)
    setError(null)
    window.electron.invoke<T>(channel, ...args)
      .then(setData)
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channel, ...args])

  useEffect(() => {
    load()
  }, [load])

  return { data, loading, error, reload: load }
}
