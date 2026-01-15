import React, { useState } from 'react'
import type { ZipStats, ZipHistoryItem } from '../hooks/useZipStats'

interface StatsCardProps {
  stats: ZipStats
  history: ZipHistoryItem[]
  onClearStats: () => void
  getTotalSaved: () => number
  getAverageCompressionRatio: () => number
}

const formatSize = (bytes: number): string => {
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  if (bytes === 0) return '0 B'
  const i = Math.floor(Math.log(Math.abs(bytes)) / Math.log(1024))
  return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${units[i]}`
}

const formatDate = (isoString: string | null): string => {
  if (!isoString) return 'Never'
  const date = new Date(isoString)
  return date.toLocaleDateString(undefined, { 
    month: 'short', 
    day: 'numeric', 
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  })
}

const formatRelativeTime = (isoString: string): string => {
  const date = new Date(isoString)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffMins = Math.floor(diffMs / 60000)
  const diffHours = Math.floor(diffMs / 3600000)
  const diffDays = Math.floor(diffMs / 86400000)

  if (diffMins < 1) return 'Just now'
  if (diffMins < 60) return `${diffMins}m ago`
  if (diffHours < 24) return `${diffHours}h ago`
  if (diffDays < 7) return `${diffDays}d ago`
  return formatDate(isoString)
}

const StatsCard: React.FC<StatsCardProps> = ({ 
  stats, 
  history,
  onClearStats,
  getTotalSaved,
  getAverageCompressionRatio
}) => {
  const [showHistory, setShowHistory] = useState(false)
  const [showClearConfirm, setShowClearConfirm] = useState(false)

  const hasStats = stats.totalZipsCreated > 0

  return (
    <div className="card bg-dark border-secondary mb-4">
      <div className="card-header d-flex justify-content-between align-items-center py-3">
        <h2 className="h5 mb-0 d-flex align-items-center gap-2">
          <i className="bi bi-bar-chart-fill" aria-hidden="true"></i>
          <span>Your ZipDrop Stats</span>
        </h2>
        <div className="d-flex gap-2">
          {history.length > 0 && (
            <button
              type="button"
              className="btn btn-sm btn-outline-light"
              onClick={() => setShowHistory(!showHistory)}
              aria-expanded={showHistory}
              aria-controls="history-panel"
            >
              <i className={`bi ${showHistory ? 'bi-eye-slash' : 'bi-clock-history'} me-1`} aria-hidden="true"></i>
              {showHistory ? 'Hide' : 'History'}
            </button>
          )}
          {hasStats && !showClearConfirm && (
            <button
              type="button"
              className="btn btn-sm btn-outline-danger"
              onClick={() => setShowClearConfirm(true)}
              aria-label="Clear all statistics"
            >
              <i className="bi bi-trash3 me-1" aria-hidden="true"></i>
              Clear
            </button>
          )}
          {showClearConfirm && (
            <div className="d-flex gap-1" role="group" aria-label="Confirm clear stats">
              <button
                type="button"
                className="btn btn-sm btn-danger"
                onClick={() => {
                  onClearStats()
                  setShowClearConfirm(false)
                }}
              >
                Confirm
              </button>
              <button
                type="button"
                className="btn btn-sm btn-secondary"
                onClick={() => setShowClearConfirm(false)}
              >
                Cancel
              </button>
            </div>
          )}
        </div>
      </div>
      
      <div className="card-body">
        {!hasStats ? (
          <p className="text-muted text-center mb-0">
            No zips created yet. Select a folder and create your first ZIP to start tracking stats!
          </p>
        ) : (
          <>
            <div className="row g-3">
              <div className="col-6 col-md-3">
                <div className="stat-item text-center p-3 rounded bg-dark-subtle">
                  <div className="stat-value h3 text-primary mb-1">
                    {stats.totalZipsCreated.toLocaleString()}
                  </div>
                  <div className="stat-label small text-muted">ZIPs Created</div>
                </div>
              </div>
              <div className="col-6 col-md-3">
                <div className="stat-item text-center p-3 rounded bg-dark-subtle">
                  <div className="stat-value h3 text-success mb-1">
                    {stats.totalFilesZipped.toLocaleString()}
                  </div>
                  <div className="stat-label small text-muted">Files Zipped</div>
                </div>
              </div>
              <div className="col-6 col-md-3">
                <div className="stat-item text-center p-3 rounded bg-dark-subtle">
                  <div className="stat-value h3 text-info mb-1">
                    {formatSize(stats.totalRawSizeBytes)}
                  </div>
                  <div className="stat-label small text-muted">Total Processed</div>
                </div>
              </div>
              <div className="col-6 col-md-3">
                <div className="stat-item text-center p-3 rounded bg-dark-subtle">
                  <div className="stat-value h3 text-warning mb-1">
                    {formatSize(getTotalSaved())}
                  </div>
                  <div className="stat-label small text-muted">Space Saved</div>
                </div>
              </div>
            </div>

            <div className="row mt-3">
              <div className="col-12">
                <div className="d-flex justify-content-between align-items-center p-2 rounded bg-dark-subtle">
                  <span className="small text-muted">
                    <strong>Average Compression:</strong> {getAverageCompressionRatio().toFixed(1)}%
                  </span>
                  <span className="small text-muted">
                    <strong>First Used:</strong> {formatDate(stats.firstUsedAt)}
                  </span>
                  <span className="small text-muted">
                    <strong>Last Used:</strong> {formatDate(stats.lastUsedAt)}
                  </span>
                </div>
              </div>
            </div>
          </>
        )}

        {showHistory && history.length > 0 && (
          <div id="history-panel" className="mt-3" role="region" aria-label="Recent ZIP history">
            <h3 className="h6 mb-2">Recent Activity</h3>
            <div className="table-responsive">
              <table className="table table-dark table-sm table-striped mb-0">
                <caption className="visually-hidden">Recent ZIP creation history</caption>
                <thead>
                  <tr>
                    <th scope="col">When</th>
                    <th scope="col">Folder</th>
                    <th scope="col" className="text-end">Files</th>
                    <th scope="col" className="text-end">Raw</th>
                    <th scope="col" className="text-end">Zipped</th>
                    <th scope="col" className="text-end">Saved</th>
                  </tr>
                </thead>
                <tbody>
                  {history.slice(0, 10).map(item => (
                    <tr key={item.id}>
                      <td>
                        <time dateTime={item.timestamp} title={formatDate(item.timestamp)}>
                          {formatRelativeTime(item.timestamp)}
                        </time>
                      </td>
                      <td className="text-truncate" style={{ maxWidth: '150px' }} title={item.folderName}>
                        {item.folderName}
                      </td>
                      <td className="text-end">{item.filesCount}</td>
                      <td className="text-end">{formatSize(item.rawSizeBytes)}</td>
                      <td className="text-end">{formatSize(item.zippedSizeBytes)}</td>
                      <td className="text-end text-success">{item.compressionRatio.toFixed(0)}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {history.length > 10 && (
              <p className="small text-muted text-center mt-2 mb-0">
                Showing 10 of {history.length} entries
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

export default StatsCard
