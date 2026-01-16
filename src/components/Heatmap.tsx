import { useState } from 'react'
import { useHeatmap } from '../hooks/useFunFeatures'

const formatSize = (bytes: number): string => {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.floor(Math.log(Math.abs(bytes)) / Math.log(k))
  return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`
}

const getLevelColor = (level: number): string => {
  switch (level) {
    case 0: return '#161b22'
    case 1: return '#0e4429'
    case 2: return '#006d32'
    case 3: return '#26a641'
    case 4: return '#39d353'
    default: return '#161b22'
  }
}

const getMonthLabels = (days: number): { label: string; offset: number }[] => {
  const labels: { label: string; offset: number }[] = []
  const today = new Date()
  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  
  let currentMonth = -1
  for (let i = 0; i < days; i++) {
    const date = new Date(today)
    date.setDate(date.getDate() - (days - 1 - i))
    const month = date.getMonth()
    if (month !== currentMonth) {
      currentMonth = month
      // Calculate week offset
      const weekOffset = Math.floor(i / 7)
      labels.push({ label: monthNames[month], offset: weekOffset })
    }
  }
  
  return labels
}

interface HeatmapProps {
  personal?: boolean
}

export default function Heatmap({ personal = false }: HeatmapProps) {
  const [hoveredDay, setHoveredDay] = useState<{ date: string; count: number; files: number; bytes_saved: number } | null>(null)
  const { heatmap, stats, isLoading, error, refresh } = useHeatmap(365, personal)

  if (error) {
    return (
      <div className="card bg-dark border-danger">
        <div className="card-body text-center">
          <p className="text-danger mb-2">Failed to load activity data</p>
          <button type="button" className="btn btn-outline-danger btn-sm" onClick={refresh}>
            Try Again
          </button>
        </div>
      </div>
    )
  }

  // Group days into weeks (7 rows)
  const weeks: typeof heatmap[] = []
  const totalWeeks = Math.ceil(heatmap.length / 7)
  
  for (let w = 0; w < totalWeeks; w++) {
    const weekStart = w * 7
    const weekDays = heatmap.slice(weekStart, weekStart + 7)
    weeks.push(weekDays)
  }

  const monthLabels = getMonthLabels(365)
  const dayLabels = ['', 'Mon', '', 'Wed', '', 'Fri', '']

  return (
    <div className="card bg-dark border-secondary">
      <div className="card-header d-flex justify-content-between align-items-center">
        <h5 className="mb-0">
          <i className="bi bi-calendar-check me-2 text-success" />
          {personal ? 'Your Activity' : 'Global Activity'}
        </h5>
        <div className="d-flex gap-3 align-items-center">
          <small className="text-muted">
            {stats.active_days} active days • {stats.total_zips} zips
          </small>
          <div className="d-flex align-items-center gap-1">
            <small className="text-muted">Less</small>
            {[0, 1, 2, 3, 4].map((level) => (
              <div
                key={level}
                style={{
                  width: '10px',
                  height: '10px',
                  backgroundColor: getLevelColor(level),
                  borderRadius: '2px',
                }}
              />
            ))}
            <small className="text-muted">More</small>
          </div>
        </div>
      </div>
      <div className="card-body">
        {isLoading ? (
          <div className="text-center py-4">
            <div className="spinner-border spinner-border-sm text-primary" />
          </div>
        ) : (
          <div className="position-relative">
            {/* Month labels */}
            <div className="d-flex mb-1" style={{ marginLeft: '30px' }}>
              {monthLabels.map((m, i) => (
                <div
                  key={i}
                  className="text-muted"
                  style={{
                    fontSize: '10px',
                    position: 'absolute',
                    left: `${30 + m.offset * 14}px`,
                  }}
                >
                  {m.label}
                </div>
              ))}
            </div>

            {/* Heatmap grid */}
            <div className="d-flex" style={{ marginTop: '20px' }}>
              {/* Day labels */}
              <div className="d-flex flex-column" style={{ width: '30px' }}>
                {dayLabels.map((label, i) => (
                  <div
                    key={i}
                    className="text-muted"
                    style={{ height: '12px', fontSize: '10px', lineHeight: '12px' }}
                  >
                    {label}
                  </div>
                ))}
              </div>

              {/* Weeks */}
              <div className="d-flex gap-1 overflow-auto">
                {weeks.map((week, weekIndex) => (
                  <div key={weekIndex} className="d-flex flex-column gap-1">
                    {week.map((day, dayIndex) => (
                      <div
                        key={`${weekIndex}-${dayIndex}`}
                        style={{
                          width: '12px',
                          height: '12px',
                          backgroundColor: getLevelColor(day.level),
                          borderRadius: '2px',
                          cursor: day.count > 0 ? 'pointer' : 'default',
                        }}
                        onMouseEnter={() => day.count > 0 && setHoveredDay(day)}
                        onMouseLeave={() => setHoveredDay(null)}
                        title={day.count > 0 ? `${day.date}: ${day.count} zips` : day.date}
                      />
                    ))}
                  </div>
                ))}
              </div>
            </div>

            {/* Tooltip */}
            {hoveredDay && (
              <div 
                className="position-absolute bg-dark border border-secondary rounded p-2 shadow"
                style={{ 
                  top: '-60px', 
                  left: '50%', 
                  transform: 'translateX(-50%)',
                  zIndex: 10,
                  minWidth: '200px',
                }}
              >
                <div className="fw-bold mb-1">
                  {new Date(hoveredDay.date).toLocaleDateString('en-US', { 
                    weekday: 'long', 
                    year: 'numeric', 
                    month: 'long', 
                    day: 'numeric' 
                  })}
                </div>
                <div className="small">
                  <span className="text-success">{hoveredDay.count} zips</span>
                  {' • '}
                  <span>{hoveredDay.files} files</span>
                  {' • '}
                  <span className="text-info">{formatSize(hoveredDay.bytes_saved)} saved</span>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Activity stats */}
        <div className="row mt-3 g-2">
          <div className="col-6 col-md-3">
            <div className="text-center">
              <div className="fs-5 fw-bold text-success">{stats.active_days}</div>
              <small className="text-muted">Active Days</small>
            </div>
          </div>
          <div className="col-6 col-md-3">
            <div className="text-center">
              <div className="fs-5 fw-bold text-primary">{stats.total_zips}</div>
              <small className="text-muted">Total Zips</small>
            </div>
          </div>
          <div className="col-6 col-md-3">
            <div className="text-center">
              <div className="fs-5 fw-bold text-warning">{stats.max_daily_zips}</div>
              <small className="text-muted">Best Day</small>
            </div>
          </div>
          <div className="col-6 col-md-3">
            <div className="text-center">
              <div className="fs-5 fw-bold text-info">{stats.activity_rate}%</div>
              <small className="text-muted">Activity Rate</small>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
