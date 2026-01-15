import { useState, useEffect, useCallback } from 'react'

// Configure your API URL here
const API_BASE_URL = import.meta.env.VITE_ZIPDROP_API_URL || ''

export interface GlobalStats {
  total_zips: number
  total_files: number
  total_raw_bytes: number
  total_zipped_bytes: number
  total_bytes_saved: number
  first_event: string | null
  last_event: string | null
}

export interface TodayStats {
  zips_created: number
  files_zipped: number
  raw_bytes: number
  zipped_bytes: number
  bytes_saved: number
}

export interface PeriodStats {
  period: string
  zips_created: number
  files_zipped: number
  raw_bytes: number
  zipped_bytes: number
  bytes_saved: number
}

interface UseGlobalStatsReturn {
  stats: GlobalStats | null
  todayStats: TodayStats | null
  periodStats: PeriodStats[]
  isLoading: boolean
  error: string | null
  isEnabled: boolean
  recordEvent: (data: {
    filesCount: number
    rawSizeBytes: number
    zippedSizeBytes: number
  }) => Promise<boolean>
  refreshStats: () => Promise<void>
  loadPeriodStats: (period: 'daily' | 'weekly' | 'monthly', limit?: number) => Promise<void>
}

// Generate a simple anonymous client ID (persisted in localStorage)
const getClientId = (): string => {
  const key = 'zipdrop:clientId'
  let clientId = localStorage.getItem(key)
  if (!clientId) {
    clientId = crypto.randomUUID()
    localStorage.setItem(key, clientId)
  }
  return clientId
}

export const useGlobalStats = (): UseGlobalStatsReturn => {
  const [stats, setStats] = useState<GlobalStats | null>(null)
  const [todayStats, setTodayStats] = useState<TodayStats | null>(null)
  const [periodStats, setPeriodStats] = useState<PeriodStats[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Check if API is configured
  const isEnabled = Boolean(API_BASE_URL)

  const fetchStats = useCallback(async () => {
    if (!isEnabled) return

    setIsLoading(true)
    setError(null)

    try {
      const [statsRes, todayRes] = await Promise.all([
        fetch(`${API_BASE_URL}/api/stats`),
        fetch(`${API_BASE_URL}/api/stats/today`),
      ])

      if (statsRes.ok) {
        setStats(await statsRes.json())
      }
      if (todayRes.ok) {
        setTodayStats(await todayRes.json())
      }
    } catch (err) {
      console.warn('Failed to fetch global stats:', err)
      setError('Failed to load global stats')
    } finally {
      setIsLoading(false)
    }
  }, [isEnabled])

  const loadPeriodStats = useCallback(async (
    period: 'daily' | 'weekly' | 'monthly',
    limit = 30
  ) => {
    if (!isEnabled) return

    try {
      const res = await fetch(`${API_BASE_URL}/api/stats/${period}?limit=${limit}`)
      if (res.ok) {
        const data = await res.json()
        setPeriodStats(data.data || [])
      }
    } catch (err) {
      console.warn('Failed to fetch period stats:', err)
    }
  }, [isEnabled])

  const recordEvent = useCallback(async (data: {
    filesCount: number
    rawSizeBytes: number
    zippedSizeBytes: number
  }): Promise<boolean> => {
    if (!isEnabled) return false

    try {
      const res = await fetch(`${API_BASE_URL}/api/events`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...data,
          clientId: getClientId(),
        }),
      })

      if (res.ok) {
        // Refresh stats after recording
        fetchStats()
        return true
      }
      return false
    } catch (err) {
      console.warn('Failed to record event:', err)
      return false
    }
  }, [isEnabled, fetchStats])

  // Fetch stats on mount
  useEffect(() => {
    fetchStats()
  }, [fetchStats])

  return {
    stats,
    todayStats,
    periodStats,
    isLoading,
    error,
    isEnabled,
    recordEvent,
    refreshStats: fetchStats,
    loadPeriodStats,
  }
}
