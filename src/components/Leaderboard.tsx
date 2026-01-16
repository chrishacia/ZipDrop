import { useState } from 'react'
import { useLeaderboard } from '../hooks/useFunFeatures'

const formatSize = (bytes: number): string => {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`
}

const formatNumber = (num: number): string => {
  return num.toLocaleString()
}

const getRankEmoji = (rank: number): string => {
  switch (rank) {
    case 1: return '🥇'
    case 2: return '🥈'
    case 3: return '🥉'
    default: return `#${rank}`
  }
}

export default function Leaderboard() {
  const [sortBy, setSortBy] = useState<'zips' | 'files' | 'bytes_saved'>('zips')
  const { leaderboard, myRank, isLoading, error, refresh } = useLeaderboard(sortBy, 15)
  const clientId = typeof window !== 'undefined' ? localStorage.getItem('zipdrop:clientId') : null

  if (error) {
    return (
      <div className="card bg-dark border-danger">
        <div className="card-body text-center">
          <p className="text-danger mb-2">Failed to load leaderboard</p>
          <button type="button" className="btn btn-outline-danger btn-sm" onClick={refresh}>
            Try Again
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="card bg-dark border-secondary">
      <div className="card-header d-flex justify-content-between align-items-center">
        <h5 className="mb-0">
          <i className="bi bi-trophy me-2 text-warning" />
          Leaderboard
        </h5>
        <div className="btn-group btn-group-sm">
          <button 
            className={`btn ${sortBy === 'zips' ? 'btn-primary' : 'btn-outline-secondary'}`}
            onClick={() => setSortBy('zips')}
          >
            Zips
          </button>
          <button 
            className={`btn ${sortBy === 'files' ? 'btn-primary' : 'btn-outline-secondary'}`}
            onClick={() => setSortBy('files')}
          >
            Files
          </button>
          <button 
            className={`btn ${sortBy === 'bytes_saved' ? 'btn-primary' : 'btn-outline-secondary'}`}
            onClick={() => setSortBy('bytes_saved')}
          >
            Saved
          </button>
        </div>
      </div>
      <div className="card-body p-0">
        {isLoading ? (
          <div className="text-center py-4">
            <div className="spinner-border spinner-border-sm text-primary" />
          </div>
        ) : leaderboard.length === 0 ? (
          <div className="text-center py-4 text-muted">
            <i className="bi bi-emoji-neutral fs-1 d-block mb-2" />
            No data yet. Be the first!
          </div>
        ) : (
          <div className="table-responsive">
            <table className="table table-dark table-hover mb-0">
              <thead>
                <tr>
                  <th className="text-center" style={{ width: '60px' }}>Rank</th>
                  <th>User</th>
                  <th className="text-end">Zips</th>
                  <th className="text-end">Files</th>
                  <th className="text-end">Saved</th>
                  <th className="text-end d-none d-md-table-cell">Ratio</th>
                </tr>
              </thead>
              <tbody>
                {leaderboard.map((entry) => {
                  const isMe = clientId && entry.full_client_id === clientId
                  return (
                    <tr 
                      key={entry.full_client_id} 
                      className={isMe ? 'table-primary' : ''}
                    >
                      <td className="text-center fw-bold">
                        {getRankEmoji(entry.rank)}
                      </td>
                      <td>
                        <span className="font-monospace text-muted">
                          {entry.client_id}
                        </span>
                        {isMe && <span className="badge bg-success ms-2">You</span>}
                      </td>
                      <td className="text-end">{formatNumber(entry.total_zips)}</td>
                      <td className="text-end">{formatNumber(entry.total_files)}</td>
                      <td className="text-end text-success">{formatSize(entry.total_bytes_saved)}</td>
                      <td className="text-end d-none d-md-table-cell">
                        <span className="badge bg-info">{entry.compression_ratio}%</span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
        
        {/* Show user's rank if not in top list */}
        {myRank?.found && !leaderboard.some(e => e.full_client_id === clientId) && (
          <div className="border-top border-secondary p-3 bg-primary bg-opacity-10">
            <div className="d-flex justify-content-between align-items-center">
              <div>
                <strong>Your Rank:</strong>{' '}
                <span className="badge bg-primary fs-6">#{myRank.rank}</span>
                <span className="text-muted ms-2">
                  Top {100 - (myRank.percentile || 0)}% of {myRank.total_clients} users
                </span>
              </div>
              <div className="text-end">
                <small className="text-muted">
                  {formatNumber(myRank.stats?.total_zips || 0)} zips
                </small>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
