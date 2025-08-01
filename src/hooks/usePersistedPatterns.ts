import { useState, useEffect } from 'react'

const STORAGE_KEY = 'zipdrop:excludePatterns'

export function usePersistedPatterns() {
  const [patterns, setPatterns] = useState<string[]>([])

  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (saved) setPatterns(JSON.parse(saved))
  }, [])

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(patterns))
  }, [patterns])

  return { patterns, setPatterns }
}
