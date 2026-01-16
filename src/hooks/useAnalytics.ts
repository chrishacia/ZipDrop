import { useState, useEffect, useCallback } from 'react'

const API_BASE_URL = import.meta.env.VITE_ZIPDROP_API_URL || ''

export interface AveragesData {
  total_zips: number
  avg_files_per_zip: number
  avg_raw_size: number
  avg_zipped_size: number
  avg_bytes_saved: number
  avg_compression_percent: number
  max_files_in_zip: number
  largest_zip_raw: number
  min_files_in_zip: number
  smallest_zip_raw: number
}

export interface HourlyData {
  hour: number
  zips_created: number
  files_zipped: number
  raw_bytes: number
}

export interface WeekdayData {
  day_of_week: number
  day_name: string
  zips_created: number
  files_zipped: number
  raw_bytes: number
}

export interface PeriodData {
  period: string
  zips_created: number
  files_zipped: number
  raw_bytes: number
  zipped_bytes: number
  bytes_saved: number
}

interface UseAnalyticsReturn {
  averages: AveragesData | null
  hourlyData: HourlyData[]
  weekdayData: WeekdayData[]
  dailyData: PeriodData[]
  weeklyData: PeriodData[]
  monthlyData: PeriodData[]
  isLoading: boolean
  error: string | null
  isEnabled: boolean
  refreshAll: () => Promise<void>
}

export const useAnalytics = (): UseAnalyticsReturn => {
  const [averages, setAverages] = useState<AveragesData | null>(null)
  const [hourlyData, setHourlyData] = useState<HourlyData[]>([])
  const [weekdayData, setWeekdayData] = useState<WeekdayData[]>([])
  const [dailyData, setDailyData] = useState<PeriodData[]>([])
  const [weeklyData, setWeeklyData] = useState<PeriodData[]>([])
  const [monthlyData, setMonthlyData] = useState<PeriodData[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const isEnabled = Boolean(API_BASE_URL)

  const fetchAll = useCallback(async () => {
    if (!isEnabled) return

    setIsLoading(true)
    setError(null)

    try {
      const [avgRes, hourlyRes, weekdayRes, dailyRes, weeklyRes, monthlyRes] = await Promise.all([
        fetch(`${API_BASE_URL}/api/stats/averages`),
        fetch(`${API_BASE_URL}/api/stats/hourly`),
        fetch(`${API_BASE_URL}/api/stats/weekday`),
        fetch(`${API_BASE_URL}/api/stats/daily?limit=30`),
        fetch(`${API_BASE_URL}/api/stats/weekly?limit=12`),
        fetch(`${API_BASE_URL}/api/stats/monthly?limit=12`),
      ])

      if (avgRes.ok) setAverages(await avgRes.json())
      if (hourlyRes.ok) setHourlyData(await hourlyRes.json())
      if (weekdayRes.ok) setWeekdayData(await weekdayRes.json())
      if (dailyRes.ok) {
        const data = await dailyRes.json()
        setDailyData(data.data || [])
      }
      if (weeklyRes.ok) {
        const data = await weeklyRes.json()
        setWeeklyData(data.data || [])
      }
      if (monthlyRes.ok) {
        const data = await monthlyRes.json()
        setMonthlyData(data.data || [])
      }
    } catch (err) {
      console.warn('Failed to fetch analytics:', err)
      setError('Failed to load analytics data')
    } finally {
      setIsLoading(false)
    }
  }, [isEnabled])

  useEffect(() => {
    fetchAll()
  }, [fetchAll])

  return {
    averages,
    hourlyData,
    weekdayData,
    dailyData,
    weeklyData,
    monthlyData,
    isLoading,
    error,
    isEnabled,
    refreshAll: fetchAll,
  }
}
