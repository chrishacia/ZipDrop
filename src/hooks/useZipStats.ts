import { useState, useEffect, useCallback } from 'react'

const STATS_KEY = 'zipdrop:stats'
const HISTORY_KEY = 'zipdrop:history'
const MAX_HISTORY_ITEMS = 50

export interface ZipStats {
  totalZipsCreated: number
  totalFilesZipped: number
  totalRawSizeBytes: number
  totalZippedSizeBytes: number
  firstUsedAt: string | null
  lastUsedAt: string | null
}

export interface ZipHistoryItem {
  id: string
  timestamp: string
  folderName: string
  filesCount: number
  rawSizeBytes: number
  zippedSizeBytes: number
  compressionRatio: number
}

const defaultStats: ZipStats = {
  totalZipsCreated: 0,
  totalFilesZipped: 0,
  totalRawSizeBytes: 0,
  totalZippedSizeBytes: 0,
  firstUsedAt: null,
  lastUsedAt: null,
}

export function useZipStats() {
  const [stats, setStats] = useState<ZipStats>(defaultStats)
  const [history, setHistory] = useState<ZipHistoryItem[]>([])
  const [isLoaded, setIsLoaded] = useState(false)

  // Load from localStorage on mount
  useEffect(() => {
    try {
      const savedStats = localStorage.getItem(STATS_KEY)
      const savedHistory = localStorage.getItem(HISTORY_KEY)

      if (savedStats) {
        setStats(JSON.parse(savedStats))
      }
      if (savedHistory) {
        setHistory(JSON.parse(savedHistory))
      }
    } catch (e) {
      console.error('Failed to load stats from localStorage:', e)
    }
    setIsLoaded(true)
  }, [])

  // Persist stats to localStorage
  useEffect(() => {
    if (!isLoaded) return
    try {
      localStorage.setItem(STATS_KEY, JSON.stringify(stats))
    } catch (e) {
      console.error('Failed to save stats to localStorage:', e)
    }
  }, [stats, isLoaded])

  // Persist history to localStorage
  useEffect(() => {
    if (!isLoaded) return
    try {
      localStorage.setItem(HISTORY_KEY, JSON.stringify(history))
    } catch (e) {
      console.error('Failed to save history to localStorage:', e)
    }
  }, [history, isLoaded])

  const recordZipCreation = useCallback((data: {
    folderName: string
    filesCount: number
    rawSizeBytes: number
    zippedSizeBytes: number
  }) => {
    const now = new Date().toISOString()
    const compressionRatio = data.rawSizeBytes > 0
      ? ((data.rawSizeBytes - data.zippedSizeBytes) / data.rawSizeBytes) * 100
      : 0

    // Update stats
    setStats(prev => ({
      totalZipsCreated: prev.totalZipsCreated + 1,
      totalFilesZipped: prev.totalFilesZipped + data.filesCount,
      totalRawSizeBytes: prev.totalRawSizeBytes + data.rawSizeBytes,
      totalZippedSizeBytes: prev.totalZippedSizeBytes + data.zippedSizeBytes,
      firstUsedAt: prev.firstUsedAt || now,
      lastUsedAt: now,
    }))

    // Add to history
    const historyItem: ZipHistoryItem = {
      id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      timestamp: now,
      folderName: data.folderName,
      filesCount: data.filesCount,
      rawSizeBytes: data.rawSizeBytes,
      zippedSizeBytes: data.zippedSizeBytes,
      compressionRatio,
    }

    setHistory(prev => [historyItem, ...prev].slice(0, MAX_HISTORY_ITEMS))
  }, [])

  const clearStats = useCallback(() => {
    setStats(defaultStats)
    setHistory([])
  }, [])

  const getTotalSaved = useCallback(() => {
    return stats.totalRawSizeBytes - stats.totalZippedSizeBytes
  }, [stats])

  const getAverageCompressionRatio = useCallback(() => {
    if (stats.totalRawSizeBytes === 0) return 0
    return ((stats.totalRawSizeBytes - stats.totalZippedSizeBytes) / stats.totalRawSizeBytes) * 100
  }, [stats])

  return {
    stats,
    history,
    isLoaded,
    recordZipCreation,
    clearStats,
    getTotalSaved,
    getAverageCompressionRatio,
  }
}
