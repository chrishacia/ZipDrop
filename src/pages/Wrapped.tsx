import { useState } from 'react'
import { useWrapped } from '../hooks/useFunFeatures'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts'

const formatSize = (bytes: number): string => {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB', 'PB']
  const i = Math.floor(Math.log(Math.abs(bytes)) / Math.log(k))
  return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`
}

interface WrappedProps {
  onBack: () => void
  initialYear?: number
}

export default function Wrapped({ onBack, initialYear }: WrappedProps) {
  const currentYear = new Date().getFullYear()
  const [year, setYear] = useState(initialYear ?? currentYear)
  const [isPersonal, setIsPersonal] = useState(false)
  const { wrapped, isLoading, error, refresh } = useWrapped(year, isPersonal)
  
  const hasClientId = typeof window !== 'undefined' && localStorage.getItem('zipdrop_client_id')
  const availableYears = Array.from({ length: currentYear - 2024 + 1 }, (_, i) => 2024 + i)

  if (error) {
    return (
      <main className="container py-4">
        <div className="text-center">
          <button type="button" onClick={onBack} className="btn btn-outline-secondary mb-4">
            <i className="bi bi-arrow-left me-2" />
            Back to Analytics
          </button>
          <div className="card bg-dark border-danger">
            <div className="card-body">
              <p className="text-danger mb-2">Failed to load wrapped data</p>
              <button type="button" className="btn btn-outline-danger" onClick={refresh}>
                Try Again
              </button>
            </div>
          </div>
        </div>
      </main>
    )
  }

  return (
    <main className="container py-4">
      {/* Header */}
      <div className="text-center mb-5">
        <button type="button" onClick={onBack} className="btn btn-outline-secondary btn-sm mb-3">
          <i className="bi bi-arrow-left me-2" />
          Back to Analytics
        </button>
        <h1 className="display-4 fw-bold">
          <span className="text-primary">ZipDrop</span>{' '}
          <span className="text-warning">Wrapped</span>
        </h1>
        <p className="lead text-muted">Your Year in Compression</p>
        
        {/* Controls */}
        <div className="d-flex justify-content-center gap-3 mt-4">
          <select 
            className="form-select bg-dark text-white border-secondary"
            style={{ width: 'auto' }}
            value={year}
            onChange={(e) => setYear(parseInt(e.target.value))}
          >
            {availableYears.map(y => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
          
          {hasClientId && (
            <div className="btn-group">
              <button 
                className={`btn ${!isPersonal ? 'btn-primary' : 'btn-outline-secondary'}`}
                onClick={() => setIsPersonal(false)}
              >
                <i className="bi bi-globe me-1" />
                Global
              </button>
              <button 
                className={`btn ${isPersonal ? 'btn-primary' : 'btn-outline-secondary'}`}
                onClick={() => setIsPersonal(true)}
              >
                <i className="bi bi-person me-1" />
                Personal
              </button>
            </div>
          )}
        </div>
      </div>

      {isLoading ? (
        <div className="text-center py-5">
          <div className="spinner-border text-primary" />
          <p className="text-muted mt-3">Loading your wrapped...</p>
        </div>
      ) : wrapped?.summary.total_zips === 0 ? (
        <div className="text-center py-5">
          <i className="bi bi-emoji-neutral display-1 text-muted mb-3 d-block" />
          <h3 className="text-muted">No data for {year}</h3>
          <p className="text-muted">
            {isPersonal 
              ? "You haven't created any zips this year yet!" 
              : "No zips were created globally this year."}
          </p>
        </div>
      ) : wrapped && (
        <div className="row g-4">
          {/* Hero Stats */}
          <div className="col-12">
            <div className="card bg-gradient text-white" style={{ 
              background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)' 
            }}>
              <div className="card-body py-5 text-center">
                <h2 className="mb-4">
                  {isPersonal ? 'Your ' : ''}{year} in Numbers
                </h2>
                <div className="row g-4">
                  <div className="col-6 col-md-3">
                    <div className="display-4 fw-bold">{wrapped.summary.total_zips.toLocaleString()}</div>
                    <div className="text-white-50">ZIPs Created</div>
                  </div>
                  <div className="col-6 col-md-3">
                    <div className="display-4 fw-bold">{wrapped.summary.total_files.toLocaleString()}</div>
                    <div className="text-white-50">Files Compressed</div>
                  </div>
                  <div className="col-6 col-md-3">
                    <div className="display-4 fw-bold">{formatSize(wrapped.summary.total_bytes_saved)}</div>
                    <div className="text-white-50">Space Saved</div>
                  </div>
                  <div className="col-6 col-md-3">
                    <div className="display-4 fw-bold">{wrapped.summary.avg_compression_percent}%</div>
                    <div className="text-white-50">Avg Compression</div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Monthly Chart */}
          <div className="col-12">
            <div className="card bg-dark border-secondary">
              <div className="card-header">
                <h5 className="mb-0">
                  <i className="bi bi-bar-chart me-2 text-primary" />
                  Monthly Activity
                </h5>
              </div>
              <div className="card-body">
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={wrapped.monthly_breakdown}>
                    <XAxis 
                      dataKey="month_name" 
                      stroke="#6c757d"
                      tick={{ fill: '#adb5bd' }}
                      tickFormatter={(v) => v.substring(0, 3)}
                    />
                    <YAxis stroke="#6c757d" tick={{ fill: '#adb5bd' }} />
                    <Tooltip 
                      contentStyle={{ 
                        backgroundColor: '#212529', 
                        border: '1px solid #495057',
                        borderRadius: '8px',
                      }}
                      formatter={(value, name) => {
                        if (name === 'bytes_saved') return [formatSize(Number(value) || 0), 'Saved']
                        return [(Number(value) || 0).toLocaleString(), 'Zips']
                      }}
                    />
                    <Bar dataKey="zips" fill="#0d6efd" radius={[4, 4, 0, 0]} name="Zips" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>

          {/* Highlights */}
          <div className="col-md-6">
            <div className="card bg-dark border-secondary h-100">
              <div className="card-header">
                <h5 className="mb-0">
                  <i className="bi bi-star me-2 text-warning" />
                  Highlights
                </h5>
              </div>
              <div className="card-body">
                <ul className="list-unstyled mb-0">
                  {wrapped.highlights.busiest_day && (
                    <li className="d-flex align-items-center mb-3">
                      <span className="fs-3 me-3">📅</span>
                      <div>
                        <strong>Busiest Day</strong>
                        <br />
                        <span className="text-muted">
                          {new Date(wrapped.highlights.busiest_day.date).toLocaleDateString('en-US', {
                            month: 'long',
                            day: 'numeric',
                          })} - {wrapped.highlights.busiest_day.zips} zips
                        </span>
                      </div>
                    </li>
                  )}
                  {wrapped.highlights.peak_month && (
                    <li className="d-flex align-items-center mb-3">
                      <span className="fs-3 me-3">🏆</span>
                      <div>
                        <strong>Peak Month</strong>
                        <br />
                        <span className="text-muted">
                          {wrapped.highlights.peak_month.month_name} - {wrapped.highlights.peak_month.zips} zips
                        </span>
                      </div>
                    </li>
                  )}
                  {wrapped.highlights.favorite_weekday && (
                    <li className="d-flex align-items-center mb-3">
                      <span className="fs-3 me-3">📆</span>
                      <div>
                        <strong>Favorite Day</strong>
                        <br />
                        <span className="text-muted">
                          {wrapped.highlights.favorite_weekday.name}s - {wrapped.highlights.favorite_weekday.zips} zips
                        </span>
                      </div>
                    </li>
                  )}
                  <li className="d-flex align-items-center mb-3">
                    <span className="fs-3 me-3">📊</span>
                    <div>
                      <strong>Active Days</strong>
                      <br />
                      <span className="text-muted">
                        {wrapped.summary.active_days} days of zipping
                      </span>
                    </div>
                  </li>
                  {wrapped.summary.biggest_zip_files > 0 && (
                    <li className="d-flex align-items-center">
                      <span className="fs-3 me-3">💪</span>
                      <div>
                        <strong>Biggest ZIP</strong>
                        <br />
                        <span className="text-muted">
                          {wrapped.summary.biggest_zip_files.toLocaleString()} files ({formatSize(wrapped.summary.biggest_zip_size)})
                        </span>
                      </div>
                    </li>
                  )}
                </ul>
              </div>
            </div>
          </div>

          {/* Fun Facts */}
          <div className="col-md-6">
            <div className="card bg-dark border-secondary h-100">
              <div className="card-header">
                <h5 className="mb-0">
                  <i className="bi bi-lightbulb me-2 text-info" />
                  Fun Facts
                </h5>
              </div>
              <div className="card-body">
                {wrapped.fun_facts.length > 0 ? (
                  <ul className="list-unstyled mb-0">
                    {wrapped.fun_facts.map((fact, i) => (
                      <li key={i} className="d-flex align-items-start mb-3">
                        <span className="fs-4 me-3">💡</span>
                        <span>{fact}</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <div className="text-center text-muted py-4">
                    <i className="bi bi-emoji-smile fs-1 d-block mb-2" />
                    Keep zipping to unlock fun facts!
                  </div>
                )}

                {/* Always show some generic fun comparisons */}
                <div className="mt-4 pt-3 border-top border-secondary">
                  <h6 className="text-muted mb-3">Did You Know?</h6>
                  <ul className="list-unstyled mb-0 small">
                    <li className="mb-2">
                      <i className="bi bi-check-circle text-success me-2" />
                      You saved the equivalent of{' '}
                      <strong className="text-success">
                        {Math.round(wrapped.summary.total_bytes_saved / (1024 * 1024))} MP3 songs
                      </strong>{' '}
                      worth of storage
                    </li>
                    <li className="mb-2">
                      <i className="bi bi-check-circle text-success me-2" />
                      That's{' '}
                      <strong className="text-info">
                        {(wrapped.summary.total_zips / 365).toFixed(1)} zips per day
                      </strong>{' '}
                      on average
                    </li>
                    {wrapped.summary.total_files > 0 && (
                      <li>
                        <i className="bi bi-check-circle text-success me-2" />
                        Average ZIP contained{' '}
                        <strong className="text-warning">
                          {Math.round(wrapped.summary.total_files / wrapped.summary.total_zips)} files
                        </strong>
                      </li>
                    )}
                  </ul>
                </div>
              </div>
            </div>
          </div>

          {/* Share Card */}
          <div className="col-12">
            <div className="card bg-dark border-primary">
              <div className="card-body text-center py-4">
                <h5 className="mb-3">Share Your Wrapped!</h5>
                <p className="text-muted mb-3">
                  Show off your compression achievements
                </p>
                <div className="d-flex justify-content-center gap-2">
                  <button 
                    className="btn btn-primary"
                    onClick={() => {
                      const text = `🗜️ My ZipDrop ${year} Wrapped:\n📦 ${wrapped.summary.total_zips.toLocaleString()} ZIPs created\n📁 ${wrapped.summary.total_files.toLocaleString()} files compressed\n💾 ${formatSize(wrapped.summary.total_bytes_saved)} saved\n\nTry it: https://chrishacia.github.io/ZipDrop/`
                      navigator.clipboard.writeText(text)
                      alert('Copied to clipboard!')
                    }}
                  >
                    <i className="bi bi-clipboard me-2" />
                    Copy Stats
                  </button>
                  <a 
                    href={`https://twitter.com/intent/tweet?text=${encodeURIComponent(`🗜️ My ZipDrop ${year} Wrapped:\n📦 ${wrapped.summary.total_zips.toLocaleString()} ZIPs\n💾 ${formatSize(wrapped.summary.total_bytes_saved)} saved\n\nhttps://chrishacia.github.io/ZipDrop/`)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="btn btn-outline-primary"
                  >
                    <i className="bi bi-twitter me-2" />
                    Share on X
                  </a>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </main>
  )
}
