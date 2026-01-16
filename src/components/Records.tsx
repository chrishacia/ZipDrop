import { useRecords } from '../hooks/useFunFeatures'

const formatSize = (bytes: number): string => {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB', 'PB']
  const i = Math.floor(Math.log(Math.abs(bytes)) / Math.log(k))
  return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`
}

export default function Records() {
  const { records, isLoading, error, refresh } = useRecords()

  if (error) {
    return (
      <div className="card bg-dark border-danger">
        <div className="card-body text-center">
          <p className="text-danger mb-2">Failed to load records</p>
          <button type="button" className="btn btn-outline-danger btn-sm" onClick={refresh}>
            Try Again
          </button>
        </div>
      </div>
    )
  }

  if (isLoading || !records) {
    return (
      <div className="card bg-dark border-secondary">
        <div className="card-body text-center py-4">
          <div className="spinner-border spinner-border-sm text-primary" />
        </div>
      </div>
    )
  }

  const { records: r, milestones } = records

  return (
    <div className="card bg-dark border-secondary">
      <div className="card-header">
        <h5 className="mb-0">
          <i className="bi bi-stars me-2 text-warning" />
          Records & Milestones
        </h5>
      </div>
      <div className="card-body">
        {/* Milestone Progress */}
        {milestones.next && (
          <div className="mb-4">
            <div className="d-flex justify-content-between align-items-center mb-2">
              <span>Next Milestone: <strong className="text-warning">{milestones.next.label}</strong></span>
              <span className="text-muted">
                {milestones.current.toLocaleString()} / {milestones.next.target.toLocaleString()}
              </span>
            </div>
            <div className="progress" style={{ height: '20px' }}>
              <div 
                className="progress-bar bg-warning progress-bar-striped progress-bar-animated" 
                style={{ width: `${milestones.progress_to_next}%` }}
              >
                {milestones.progress_to_next}%
              </div>
            </div>
            <div className="d-flex justify-content-between mt-2">
              {milestones.all.map((m, i) => (
                <div 
                  key={i} 
                  className={`small ${m.reached ? 'text-success' : 'text-muted'}`}
                >
                  {m.reached ? '✓' : '○'} {m.label}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Records Grid */}
        <h6 className="text-muted mb-3">
          <i className="bi bi-graph-up me-2" />
          All-Time Records
        </h6>
        <div className="row g-3">
          <div className="col-6 col-md-4">
            <div className="card bg-dark border-secondary h-100">
              <div className="card-body text-center">
                <i className="bi bi-files text-primary fs-3 mb-2 d-block" />
                <div className="h4 mb-0">{(r.max_files_single_zip || 0).toLocaleString()}</div>
                <small className="text-muted">Most Files in One ZIP</small>
              </div>
            </div>
          </div>
          <div className="col-6 col-md-4">
            <div className="card bg-dark border-secondary h-100">
              <div className="card-body text-center">
                <i className="bi bi-hdd text-info fs-3 mb-2 d-block" />
                <div className="h4 mb-0">{formatSize(r.max_size_single_zip || 0)}</div>
                <small className="text-muted">Largest ZIP Created</small>
              </div>
            </div>
          </div>
          <div className="col-6 col-md-4">
            <div className="card bg-dark border-secondary h-100">
              <div className="card-body text-center">
                <i className="bi bi-piggy-bank text-success fs-3 mb-2 d-block" />
                <div className="h4 mb-0">{formatSize(r.max_bytes_saved_single_zip || 0)}</div>
                <small className="text-muted">Most Saved in One ZIP</small>
              </div>
            </div>
          </div>
          <div className="col-6 col-md-4">
            <div className="card bg-dark border-secondary h-100">
              <div className="card-body text-center">
                <i className="bi bi-people text-warning fs-3 mb-2 d-block" />
                <div className="h4 mb-0">{(r.unique_clients || 0).toLocaleString()}</div>
                <small className="text-muted">Unique Users</small>
              </div>
            </div>
          </div>
          <div className="col-6 col-md-4">
            <div className="card bg-dark border-secondary h-100">
              <div className="card-body text-center">
                <i className="bi bi-calendar-week text-danger fs-3 mb-2 d-block" />
                <div className="h4 mb-0">{r.active_days || 0}</div>
                <small className="text-muted">Days Active</small>
              </div>
            </div>
          </div>
          {r.busiest_day && (
            <div className="col-6 col-md-4">
              <div className="card bg-dark border-secondary h-100">
                <div className="card-body text-center">
                  <i className="bi bi-fire text-danger fs-3 mb-2 d-block" />
                  <div className="h4 mb-0">{r.busiest_day.zips}</div>
                  <small className="text-muted">
                    Busiest Day
                    <br />
                    <span className="text-muted small">
                      {new Date(r.busiest_day.date).toLocaleDateString()}
                    </span>
                  </small>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
