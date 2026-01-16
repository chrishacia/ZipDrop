import { type FC } from 'react'
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts'
import { useAnalytics } from '../hooks/useAnalytics'
import type { PeriodData, HourlyData, WeekdayData } from '../hooks/useAnalytics'

const formatSize = (bytes: number): string => {
  if (bytes === 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB']
  const i = Math.min(Math.floor(Math.log(Math.abs(bytes)) / Math.log(1024)), units.length - 1)
  return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${units[i]}`
}

const formatNumber = (num: number): string => {
  if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`
  if (num >= 1000) return `${(num / 1000).toFixed(1)}K`
  return num.toLocaleString()
}

const formatDate = (dateStr: string): string => {
  const date = new Date(dateStr)
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

const formatHour = (hour: number): string => {
  if (hour === 0) return '12am'
  if (hour === 12) return '12pm'
  return hour < 12 ? `${hour}am` : `${hour - 12}pm`
}

interface AnalyticsProps {
  onBack: () => void
}

const Analytics: FC<AnalyticsProps> = ({ onBack }) => {
  const {
    averages,
    hourlyData,
    weekdayData,
    dailyData,
    isLoading,
    error,
    isEnabled,
    refreshAll,
  } = useAnalytics()

  if (!isEnabled) {
    return (
      <div className="container py-4">
        <div className="alert alert-warning">
          <i className="bi bi-exclamation-triangle me-2"></i>
          Analytics API is not configured. Set VITE_ZIPDROP_API_URL environment variable.
        </div>
        <button className="btn btn-outline-light" onClick={onBack}>
          <i className="bi bi-arrow-left me-2"></i>Back to ZipDrop
        </button>
      </div>
    )
  }

  // Prepare chart data (reverse to show oldest first)
  const chartData = [...dailyData].reverse().map(d => ({
    ...d,
    date: formatDate(d.period),
    raw_mb: d.raw_bytes / (1024 * 1024),
    saved_mb: d.bytes_saved / (1024 * 1024),
  }))

  const hourlyChartData = hourlyData.map(d => ({
    ...d,
    label: formatHour(d.hour),
  }))

  return (
    <div className="container-fluid py-4" style={{ maxWidth: '1400px' }}>
      {/* Header */}
      <div className="d-flex justify-content-between align-items-center mb-4">
        <div>
          <button className="btn btn-outline-light btn-sm me-3" onClick={onBack}>
            <i className="bi bi-arrow-left me-1"></i>Back
          </button>
          <span className="h3 mb-0">
            <i className="bi bi-graph-up me-2 text-primary"></i>
            Analytics Dashboard
          </span>
        </div>
        <button 
          className="btn btn-outline-primary btn-sm"
          onClick={refreshAll}
          disabled={isLoading}
        >
          <i className={`bi bi-arrow-clockwise me-1 ${isLoading ? 'spin' : ''}`}></i>
          Refresh
        </button>
      </div>

      {error && (
        <div className="alert alert-danger mb-4">
          <i className="bi bi-exclamation-circle me-2"></i>
          {error}
        </div>
      )}

      {isLoading && !averages ? (
        <div className="text-center py-5">
          <div className="spinner-border text-primary" role="status">
            <span className="visually-hidden">Loading analytics...</span>
          </div>
        </div>
      ) : (
        <>
          {/* Averages Cards */}
          {averages && (
            <div className="row g-3 mb-4">
              <div className="col-6 col-md-4 col-lg-2">
                <div className="card bg-dark border-secondary h-100">
                  <div className="card-body text-center">
                    <div className="h4 text-primary mb-1">{averages.avg_files_per_zip}</div>
                    <div className="small text-muted">Avg Files/Zip</div>
                  </div>
                </div>
              </div>
              <div className="col-6 col-md-4 col-lg-2">
                <div className="card bg-dark border-secondary h-100">
                  <div className="card-body text-center">
                    <div className="h4 text-success mb-1">{formatSize(averages.avg_raw_size)}</div>
                    <div className="small text-muted">Avg Zip Size</div>
                  </div>
                </div>
              </div>
              <div className="col-6 col-md-4 col-lg-2">
                <div className="card bg-dark border-secondary h-100">
                  <div className="card-body text-center">
                    <div className="h4 text-info mb-1">{averages.avg_compression_percent}%</div>
                    <div className="small text-muted">Avg Compression</div>
                  </div>
                </div>
              </div>
              <div className="col-6 col-md-4 col-lg-2">
                <div className="card bg-dark border-secondary h-100">
                  <div className="card-body text-center">
                    <div className="h4 text-warning mb-1">{formatSize(averages.avg_bytes_saved)}</div>
                    <div className="small text-muted">Avg Saved/Zip</div>
                  </div>
                </div>
              </div>
              <div className="col-6 col-md-4 col-lg-2">
                <div className="card bg-dark border-secondary h-100">
                  <div className="card-body text-center">
                    <div className="h4 text-danger mb-1">{formatNumber(averages.max_files_in_zip)}</div>
                    <div className="small text-muted">Max Files/Zip</div>
                  </div>
                </div>
              </div>
              <div className="col-6 col-md-4 col-lg-2">
                <div className="card bg-dark border-secondary h-100">
                  <div className="card-body text-center">
                    <div className="h4 text-secondary mb-1">{formatSize(averages.largest_zip_raw)}</div>
                    <div className="small text-muted">Largest Zip</div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Charts Row 1 */}
          <div className="row g-4 mb-4">
            {/* Daily Activity Line Chart */}
            <div className="col-lg-8">
              <div className="card bg-dark border-secondary h-100">
                <div className="card-header py-3">
                  <h5 className="mb-0">
                    <i className="bi bi-activity me-2 text-primary"></i>
                    Daily Activity (Last 30 Days)
                  </h5>
                </div>
                <div className="card-body">
                  {chartData.length > 0 ? (
                    <ResponsiveContainer width="100%" height={300}>
                      <LineChart data={chartData}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#444" />
                        <XAxis 
                          dataKey="date" 
                          stroke="#888" 
                          tick={{ fill: '#888', fontSize: 11 }}
                          interval="preserveStartEnd"
                        />
                        <YAxis stroke="#888" tick={{ fill: '#888', fontSize: 11 }} />
                        <Tooltip 
                          contentStyle={{ backgroundColor: '#1a1a1a', border: '1px solid #444' }}
                          labelStyle={{ color: '#fff' }}
                        />
                        <Legend />
                        <Line 
                          type="monotone" 
                          dataKey="zips_created" 
                          stroke="#0d6efd" 
                          strokeWidth={2}
                          name="Zips Created"
                          dot={false}
                        />
                        <Line 
                          type="monotone" 
                          dataKey="files_zipped" 
                          stroke="#198754" 
                          strokeWidth={2}
                          name="Files Zipped"
                          dot={false}
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="text-center text-muted py-5">
                      <i className="bi bi-inbox display-4 d-block mb-3"></i>
                      No data yet. Start creating zips!
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Day of Week Bar Chart */}
            <div className="col-lg-4">
              <div className="card bg-dark border-secondary h-100">
                <div className="card-header py-3">
                  <h5 className="mb-0">
                    <i className="bi bi-calendar-week me-2 text-success"></i>
                    Activity by Day
                  </h5>
                </div>
                <div className="card-body">
                  {weekdayData.some(d => d.zips_created > 0) ? (
                    <ResponsiveContainer width="100%" height={300}>
                      <BarChart data={weekdayData}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#444" />
                        <XAxis 
                          dataKey="day_name" 
                          stroke="#888" 
                          tick={{ fill: '#888', fontSize: 10 }}
                          tickFormatter={(val) => val.substring(0, 3)}
                        />
                        <YAxis stroke="#888" tick={{ fill: '#888', fontSize: 11 }} />
                        <Tooltip 
                          contentStyle={{ backgroundColor: '#1a1a1a', border: '1px solid #444' }}
                          labelStyle={{ color: '#fff' }}
                        />
                        <Bar dataKey="zips_created" fill="#198754" name="Zips" radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="text-center text-muted py-5">
                      <i className="bi bi-inbox display-4 d-block mb-3"></i>
                      No data yet
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Charts Row 2 */}
          <div className="row g-4 mb-4">
            {/* Hourly Distribution */}
            <div className="col-lg-6">
              <div className="card bg-dark border-secondary h-100">
                <div className="card-header py-3">
                  <h5 className="mb-0">
                    <i className="bi bi-clock me-2 text-info"></i>
                    Hourly Distribution (Last 7 Days)
                  </h5>
                </div>
                <div className="card-body">
                  {hourlyChartData.some(d => d.zips_created > 0) ? (
                    <ResponsiveContainer width="100%" height={250}>
                      <AreaChart data={hourlyChartData}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#444" />
                        <XAxis 
                          dataKey="label" 
                          stroke="#888" 
                          tick={{ fill: '#888', fontSize: 10 }}
                          interval={2}
                        />
                        <YAxis stroke="#888" tick={{ fill: '#888', fontSize: 11 }} />
                        <Tooltip 
                          contentStyle={{ backgroundColor: '#1a1a1a', border: '1px solid #444' }}
                          labelStyle={{ color: '#fff' }}
                        />
                        <Area 
                          type="monotone" 
                          dataKey="zips_created" 
                          stroke="#0dcaf0" 
                          fill="#0dcaf0" 
                          fillOpacity={0.3}
                          name="Zips Created"
                        />
                      </AreaChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="text-center text-muted py-5">
                      <i className="bi bi-inbox display-4 d-block mb-3"></i>
                      No data yet
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Data Volume Area Chart */}
            <div className="col-lg-6">
              <div className="card bg-dark border-secondary h-100">
                <div className="card-header py-3">
                  <h5 className="mb-0">
                    <i className="bi bi-hdd me-2 text-warning"></i>
                    Data Volume (MB)
                  </h5>
                </div>
                <div className="card-body">
                  {chartData.length > 0 ? (
                    <ResponsiveContainer width="100%" height={250}>
                      <AreaChart data={chartData}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#444" />
                        <XAxis 
                          dataKey="date" 
                          stroke="#888" 
                          tick={{ fill: '#888', fontSize: 10 }}
                          interval="preserveStartEnd"
                        />
                        <YAxis stroke="#888" tick={{ fill: '#888', fontSize: 11 }} />
                        <Tooltip 
                          contentStyle={{ backgroundColor: '#1a1a1a', border: '1px solid #444' }}
                          labelStyle={{ color: '#fff' }}
                          formatter={(value: number) => `${value.toFixed(2)} MB`}
                        />
                        <Legend />
                        <Area 
                          type="monotone" 
                          dataKey="raw_mb" 
                          stroke="#ffc107" 
                          fill="#ffc107" 
                          fillOpacity={0.3}
                          name="Processed (MB)"
                        />
                        <Area 
                          type="monotone" 
                          dataKey="saved_mb" 
                          stroke="#198754" 
                          fill="#198754" 
                          fillOpacity={0.3}
                          name="Saved (MB)"
                        />
                      </AreaChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="text-center text-muted py-5">
                      <i className="bi bi-inbox display-4 d-block mb-3"></i>
                      No data yet
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Fun Facts */}
          {averages && averages.total_zips > 0 && (
            <div className="card bg-dark border-secondary">
              <div className="card-header py-3">
                <h5 className="mb-0">
                  <i className="bi bi-lightbulb me-2 text-warning"></i>
                  Fun Facts
                </h5>
              </div>
              <div className="card-body">
                <div className="row g-3">
                  <div className="col-md-6 col-lg-3">
                    <div className="d-flex align-items-center">
                      <i className="bi bi-trophy text-warning fs-3 me-3"></i>
                      <div>
                        <div className="text-muted small">Largest zip processed</div>
                        <div className="fw-bold">{formatSize(averages.largest_zip_raw)}</div>
                      </div>
                    </div>
                  </div>
                  <div className="col-md-6 col-lg-3">
                    <div className="d-flex align-items-center">
                      <i className="bi bi-files text-info fs-3 me-3"></i>
                      <div>
                        <div className="text-muted small">Most files in a single zip</div>
                        <div className="fw-bold">{formatNumber(averages.max_files_in_zip)} files</div>
                      </div>
                    </div>
                  </div>
                  <div className="col-md-6 col-lg-3">
                    <div className="d-flex align-items-center">
                      <i className="bi bi-speedometer2 text-success fs-3 me-3"></i>
                      <div>
                        <div className="text-muted small">Average compression ratio</div>
                        <div className="fw-bold">{averages.avg_compression_percent}% smaller</div>
                      </div>
                    </div>
                  </div>
                  <div className="col-md-6 col-lg-3">
                    <div className="d-flex align-items-center">
                      <i className="bi bi-archive text-primary fs-3 me-3"></i>
                      <div>
                        <div className="text-muted small">Total zips created</div>
                        <div className="fw-bold">{formatNumber(averages.total_zips)} zips</div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </>
      )}

      <style>{`
        .spin {
          animation: spin 1s linear infinite;
        }
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  )
}

export default Analytics
