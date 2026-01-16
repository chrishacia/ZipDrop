import { useState, useEffect, useCallback } from 'react'

const API_BASE_URL = import.meta.env.VITE_ZIPDROP_API_URL || ''

// Get client ID from localStorage (same key as useGlobalStats)
const getClientId = (): string | null => {
  if (typeof window === 'undefined') return null
  return localStorage.getItem('zipdrop:clientId')
}

// Types
export interface LeaderboardEntry {
  rank: number
  client_id: string
  full_client_id: string
  total_zips: number
  total_files: number
  total_bytes_saved: number
  compression_ratio: number
  last_active: string
  days_active: number
}

export interface Achievement {
  id: string
  name: string
  description: string
  icon: string
  threshold: number
  type: string
  current: number
  progress: number
  unlocked: boolean
  unlocked_at: string | null
}

export interface HeatmapDay {
  date: string
  count: number
  files: number
  bytes_saved: number
  level: 0 | 1 | 2 | 3 | 4
}

export interface LiveStats {
  last_hour: {
    zips: number
    files: number
    bytes_saved: number
  }
  all_time: {
    zips: number
    bytes_saved: number
  }
  last_event: {
    timestamp: string
    files: number
    bytes_saved: number
    seconds_ago: number
  } | null
  server_time: string
}

export interface Records {
  records: {
    max_files_single_zip: number
    max_size_single_zip: number
    max_bytes_saved_single_zip: number
    unique_clients: number
    active_days: number
    busiest_day: { date: string; zips: number } | null
    busiest_hour: { hour: string; zips: number } | null
  }
  milestones: {
    current: number
    next: { target: number; reached: boolean; label: string } | null
    all: { target: number; reached: boolean; label: string }[]
    progress_to_next: number
  }
}

export interface WrappedData {
  year: number
  is_personal: boolean
  summary: {
    total_zips: number
    total_files: number
    total_bytes_saved: number
    avg_compression_percent: number
    active_days: number
    biggest_zip_files: number
    biggest_zip_size: number
  }
  highlights: {
    busiest_day: { date: string; zips: number } | null
    peak_month: { month: number; month_name: string; zips: number; bytes_saved: number } | null
    favorite_weekday: { day: number; name: string; zips: number } | null
  }
  monthly_breakdown: { month: number; month_name: string; zips: number; bytes_saved: number }[]
  fun_facts: string[]
}

export interface ClientRank {
  found: boolean
  rank?: number
  total_clients?: number
  percentile?: number
  stats?: {
    total_zips: number
    total_files: number
    total_bytes_saved: number
    compression_ratio: number
    first_zip: string
    last_active: string
  }
}

// Hook for leaderboard
export function useLeaderboard(sortBy: 'zips' | 'files' | 'bytes_saved' = 'zips', limit = 10) {
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([])
  const [myRank, setMyRank] = useState<ClientRank | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchLeaderboard = useCallback(async () => {
    if (!API_BASE_URL) return
    setIsLoading(true)
    setError(null)
    
    try {
      const res = await fetch(`${API_BASE_URL}/api/leaderboard?sort=${sortBy}&limit=${limit}`)
      if (!res.ok) throw new Error('Failed to fetch leaderboard')
      const data = await res.json()
      setLeaderboard(data.leaderboard)

      // Fetch user's rank if they have a client ID
      const clientId = getClientId()
      if (clientId) {
        const rankRes = await fetch(`${API_BASE_URL}/api/leaderboard/${clientId}`)
        if (rankRes.ok) {
          const rankData = await rankRes.json()
          setMyRank(rankData)
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setIsLoading(false)
    }
  }, [sortBy, limit])

  useEffect(() => {
    fetchLeaderboard()
  }, [fetchLeaderboard])

  return { leaderboard, myRank, isLoading, error, refresh: fetchLeaderboard }
}

// Hook for achievements
export function useAchievements() {
  const [achievements, setAchievements] = useState<Achievement[]>([])
  const [totalUnlocked, setTotalUnlocked] = useState(0)
  const [currentStreak, setCurrentStreak] = useState(0)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchAchievements = useCallback(async () => {
    const clientId = getClientId()
    if (!API_BASE_URL || !clientId) return
    
    setIsLoading(true)
    setError(null)
    
    try {
      const res = await fetch(`${API_BASE_URL}/api/achievements/${clientId}`)
      if (!res.ok) throw new Error('Failed to fetch achievements')
      const data = await res.json()
      setAchievements(data.achievements)
      setTotalUnlocked(data.total_unlocked)
      setCurrentStreak(data.current_streak)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchAchievements()
  }, [fetchAchievements])

  return { achievements, totalUnlocked, currentStreak, isLoading, error, refresh: fetchAchievements }
}

// Hook for heatmap
export function useHeatmap(days = 365, personal = false) {
  const [heatmap, setHeatmap] = useState<HeatmapDay[]>([])
  const [stats, setStats] = useState({ active_days: 0, max_daily_zips: 0, total_zips: 0, activity_rate: 0 })
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchHeatmap = useCallback(async () => {
    if (!API_BASE_URL) return
    setIsLoading(true)
    setError(null)
    
    try {
      let url = `${API_BASE_URL}/api/heatmap?days=${days}`
      if (personal) {
        const clientId = getClientId()
        if (clientId) url += `&clientId=${clientId}`
      }
      
      const res = await fetch(url)
      if (!res.ok) throw new Error('Failed to fetch heatmap')
      const data = await res.json()
      setHeatmap(data.heatmap)
      setStats(data.stats)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setIsLoading(false)
    }
  }, [days, personal])

  useEffect(() => {
    fetchHeatmap()
  }, [fetchHeatmap])

  return { heatmap, stats, isLoading, error, refresh: fetchHeatmap }
}

// Hook for live stats (with polling)
export function useLiveStats(pollInterval = 30000) {
  const [liveStats, setLiveStats] = useState<LiveStats | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchLiveStats = useCallback(async () => {
    if (!API_BASE_URL) return
    
    try {
      const res = await fetch(`${API_BASE_URL}/api/live`)
      if (!res.ok) throw new Error('Failed to fetch live stats')
      const data = await res.json()
      setLiveStats(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
    }
  }, [])

  useEffect(() => {
    setIsLoading(true)
    fetchLiveStats().finally(() => setIsLoading(false))
    
    const interval = setInterval(fetchLiveStats, pollInterval)
    return () => clearInterval(interval)
  }, [fetchLiveStats, pollInterval])

  return { liveStats, isLoading, error, refresh: fetchLiveStats }
}

// Hook for records and milestones
export function useRecords() {
  const [records, setRecords] = useState<Records | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchRecords = useCallback(async () => {
    if (!API_BASE_URL) return
    setIsLoading(true)
    setError(null)
    
    try {
      const res = await fetch(`${API_BASE_URL}/api/records`)
      if (!res.ok) throw new Error('Failed to fetch records')
      const data = await res.json()
      setRecords(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchRecords()
  }, [fetchRecords])

  return { records, isLoading, error, refresh: fetchRecords }
}

// Hook for wrapped/year summary
export function useWrapped(year: number, personal = false) {
  const [wrapped, setWrapped] = useState<WrappedData | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchWrapped = useCallback(async () => {
    if (!API_BASE_URL) return
    setIsLoading(true)
    setError(null)
    
    try {
      let url = `${API_BASE_URL}/api/wrapped/${year}`
      if (personal) {
        const clientId = getClientId()
        if (clientId) url += `?clientId=${clientId}`
      }
      
      const res = await fetch(url)
      if (!res.ok) throw new Error('Failed to fetch wrapped data')
      const data = await res.json()
      setWrapped(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setIsLoading(false)
    }
  }, [year, personal])

  useEffect(() => {
    fetchWrapped()
  }, [fetchWrapped])

  return { wrapped, isLoading, error, refresh: fetchWrapped }
}
