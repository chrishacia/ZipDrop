import { useState, type FC } from 'react'
import type { GlobalStats, TodayStats, PeriodStats } from '../hooks/useGlobalStats'

interface GlobalStatsCardProps {
  stats: GlobalStats | null
  todayStats: TodayStats | null
  periodStats: PeriodStats[]
  isLoading: boolean
  isEnabled: boolean
  onLoadPeriod: (period: 'daily' | 'weekly' | 'monthly') => void
}

const formatSize = (bytes: number): string => {
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  if (bytes === 0) return '0 B'
  const i = Math.floor(Math.log(Math.abs(bytes)) / Math.log(1024))
  return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${units[i]}`
}

const formatNumber = (num: number): string => {
  if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`
  if (num >= 1000) return `${(num / 1000).toFixed(1)}K`
  return num.toLocaleString()
}

const formatDate = (isoString: string | null): string => {
  if (!isoString) return 'Never'
  return new Date(isoString).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

const GlobalStatsCard: FC<GlobalStatsCardProps> = ({
  stats,
  todayStats,
  periodStats,
  isLoading,
  isEnabled,
  onLoadPeriod,
}) => {
  const [activePeriod, setActivePeriod] = useState<'daily' | 'weekly' | 'monthly' | null>(null)
  const [isExpanded, setIsExpanded] = useState(false)

  if (!isEnabled) {
    return null // Don't render if API is not configured
  }

  const handlePeriodClick = (period: 'daily' | 'weekly' | 'monthly') => {
    if (activePeriod === period) {
      setActivePeriod(null)
    } else {
      setActivePeriod(period)
      onLoadPeriod(period)
    }
  }

  return (
    <div className="card bg-dark border-secondary mb-4">
      <div className="card-header py-3 d-flex justify-content-between align-items-center">
        <h2 className="h5 mb-0">
          <i className="bi bi-globe me-2" aria-hidden="true"></i>
          Global Community Stats
        </h2>
        <button
          type="button"
          className="btn btn-sm btn-outline-light"
          onClick={() => setIsExpanded(!isExpanded)}
          aria-expanded={isExpanded}
        >
          <i className={`bi ${isExpanded ? 'bi-chevron-up' : 'bi-chevron-down'} me-1`} aria-hidden="true"></i>
          {isExpanded ? 'Hide' : 'Details'}
        </button>
      </div>

      <div className="card-body">
        {isLoading && !stats ? (
          <div className="text-center py-3">
            <div className="spinner-border spinner-border-sm text-primary" role="status">
              <span className="visually-hidden">Loading global stats...</span>
            </div>
          </div>
        ) : stats ? (
          <>
            {/* Main Stats Row */}
            <div className="row g-3 mb-3">
              <div className="col-6 col-md-3">
                <div className="text-center p-3 rounded bg-dark-subtle">
                  <div className="h3 text-primary mb-1">
                    {formatNumber(stats.total_zips)}
                  </div>
                  <div className="small text-muted">ZIPs Created</div>
                </div>
              </div>
              <div className="col-6 col-md-3">
                <div className="text-center p-3 rounded bg-dark-subtle">
                  <div className="h3 text-success mb-1">
                    {formatNumber(stats.total_files)}
                  </div>
                  <div className="small text-muted">Files Zipped</div>
                </div>
              </div>
              <div className="col-6 col-md-3">
                <div className="text-center p-3 rounded bg-dark-subtle">
                  <div className="h3 text-info mb-1">
                    {formatSize(stats.total_raw_bytes)}
                  </div>
                  <div className="small text-muted">Data Processed</div>
                </div>
              </div>
              <div className="col-6 col-md-3">
                <div className="text-center p-3 rounded bg-dark-subtle">
                  <div className="h3 text-warning mb-1">
                    {formatSize(stats.total_bytes_saved)}
                  </div>
                  <div className="small text-muted">Space Saved</div>
                </div>
              </div>
            </div>

            {/* Today's Stats */}
            {todayStats && todayStats.zips_created > 0 && (
              <div className="alert alert-dark border-secondary mb-3 py-2">
                <div className="d-flex flex-wrap justify-content-between align-items-center gap-2">
                  <span className="text-muted">
                    <i className="bi bi-calendar-day me-1" aria-hidden="true"></i>
                    Today
                  </span>
                  <div className="d-flex gap-3">
                    <span>
                      <strong className="text-primary">{todayStats.zips_created}</strong>
                      <small className="text-muted ms-1">zips</small>
                    </span>
                    <span>
                      <strong className="text-success">{formatNumber(todayStats.files_zipped)}</strong>
                      <small className="text-muted ms-1">files</small>
                    </span>
                    <span>
                      <strong className="text-warning">{formatSize(todayStats.bytes_saved)}</strong>
                      <small className="text-muted ms-1">saved</small>
                    </span>
                  </div>
                </div>
              </div>
            )}

            {/* Expanded Details */}
            {isExpanded && (
              <>
                {/* Period Selector */}
                <div className="d-flex flex-wrap gap-2 mb-3">
                  <span className="text-muted align-self-center me-2">View by:</span>
                  {(['daily', 'weekly', 'monthly'] as const).map((period) => (
                    <button
                      key={period}
                      type="button"
                      className={`btn btn-sm ${activePeriod === period ? 'btn-primary' : 'btn-outline-secondary'}`}
                      onClick={() => handlePeriodClick(period)}
                    >
                      {period.charAt(0).toUpperCase() + period.slice(1)}
                    </button>
                  ))}
                </div>

                {/* Period Data Table */}
                {activePeriod && periodStats.length > 0 && (
                  <div className="table-responsive">
                    <table className="table table-dark table-sm table-hover mb-0">
                      <thead>
                        <tr>
                          <th>Period</th>
                          <th className="text-end">ZIPs</th>
                          <th className="text-end">Files</th>
                          <th className="text-end">Processed</th>
                          <th className="text-end">Saved</th>
                        </tr>
                      </thead>
                      <tbody>
                        {periodStats.slice(0, 10).map((row) => (
                          <tr key={row.period}>
                            <td>{formatDate(row.period)}</td>
                            <td className="text-end text-primary">{row.zips_created}</td>
                            <td className="text-end text-success">{formatNumber(row.files_zipped)}</td>
                            <td className="text-end text-info">{formatSize(row.raw_bytes)}</td>
                            <td className="text-end text-warning">{formatSize(row.bytes_saved)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                {/* Metadata */}
                <div className="text-muted small mt-3 pt-3 border-top border-secondary">
                  <i className="bi bi-info-circle me-1" aria-hidden="true"></i>
                  Tracking since {formatDate(stats.first_event)}
                  {stats.last_event && ` · Last activity ${formatDate(stats.last_event)}`}
                </div>
              </>
            )}
          </>
        ) : (
          <p className="text-muted text-center mb-0">
            <i className="bi bi-wifi-off me-1" aria-hidden="true"></i>
            Unable to load global stats
          </p>
        )}
      </div>
    </div>
  )
}

export default GlobalStatsCard
