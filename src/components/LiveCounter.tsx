import { useEffect, useState, useRef } from 'react'
import { useLiveStats } from '../hooks/useFunFeatures'

const formatSize = (bytes: number): string => {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB', 'PB']
  const i = Math.floor(Math.log(Math.abs(bytes)) / Math.log(k))
  return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`
}

const formatTimeAgo = (seconds: number): string => {
  if (seconds < 60) return `${seconds}s ago`
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`
  return `${Math.floor(seconds / 86400)}d ago`
}

export default function LiveCounter() {
  const { liveStats, isLoading } = useLiveStats(10000) // Poll every 10 seconds
  const [displayZips, setDisplayZips] = useState(0)
  const [displayBytes, setDisplayBytes] = useState(0)
  const [isAnimating, setIsAnimating] = useState(false)
  const prevZipsRef = useRef(0)

  // Animate counter when values change
  useEffect(() => {
    if (!liveStats) return

    const targetZips = liveStats.all_time.zips
    const targetBytes = liveStats.all_time.bytes_saved
    const prevZips = prevZipsRef.current

    if (prevZips === 0) {
      // Initial load - set directly
      setDisplayZips(targetZips)
      setDisplayBytes(targetBytes)
      prevZipsRef.current = targetZips
      return
    }

    if (targetZips > prevZips) {
      // Animate the increase
      setIsAnimating(true)
      const startZips = prevZips
      const startBytes = displayBytes
      const zipDiff = targetZips - startZips
      const bytesDiff = targetBytes - startBytes
      const steps = 20
      const stepTime = 50

      let currentStep = 0
      const interval = setInterval(() => {
        currentStep++
        const progress = currentStep / steps
        setDisplayZips(Math.floor(startZips + zipDiff * progress))
        setDisplayBytes(Math.floor(startBytes + bytesDiff * progress))

        if (currentStep >= steps) {
          clearInterval(interval)
          setDisplayZips(targetZips)
          setDisplayBytes(targetBytes)
          prevZipsRef.current = targetZips
          setTimeout(() => setIsAnimating(false), 200)
        }
      }, stepTime)

      return () => clearInterval(interval)
    } else {
      prevZipsRef.current = targetZips
    }
  }, [liveStats, displayBytes])

  if (isLoading && !liveStats) {
    return (
      <div className="card bg-dark border-secondary">
        <div className="card-body text-center py-4">
          <div className="spinner-border spinner-border-sm text-primary" />
        </div>
      </div>
    )
  }

  return (
    <div className="card bg-dark border-secondary overflow-hidden mb-4">
      <div className="card-header d-flex justify-content-between align-items-center">
        <h5 className="mb-0">
          <i className="bi bi-broadcast me-2 text-danger" />
          Live Activity
          <span className="ms-2">
            <span 
              className="badge bg-danger rounded-circle"
              style={{ 
                width: '10px', 
                height: '10px', 
                padding: 0,
                animation: 'pulse 2s infinite',
              }}
            />
          </span>
        </h5>
        {liveStats?.last_event && (
          <small className="text-muted">
            Last zip: {formatTimeAgo(liveStats.last_event.seconds_ago)}
          </small>
        )}
      </div>
      <div className="card-body">
        {/* Main counter display */}
        <div className="text-center mb-4">
          <div 
            className={`display-4 fw-bold text-success ${isAnimating ? 'scale-animation' : ''}`}
            style={{ fontFamily: 'monospace' }}
          >
            {displayZips.toLocaleString()}
          </div>
          <div className="text-muted">Total ZIPs Created</div>
        </div>

        {/* Bytes saved counter */}
        <div className="text-center mb-4">
          <div className="h3 text-info" style={{ fontFamily: 'monospace' }}>
            {formatSize(displayBytes)}
          </div>
          <div className="text-muted">Total Space Saved</div>
        </div>

        {/* Last hour stats */}
        <div className="row g-3">
          <div className="col-4">
            <div className="text-center p-2 bg-dark bg-opacity-50 rounded">
              <div className="h5 mb-0 text-warning">
                {liveStats?.last_hour.zips || 0}
              </div>
              <small className="text-muted">Last Hour</small>
            </div>
          </div>
          <div className="col-4">
            <div className="text-center p-2 bg-dark bg-opacity-50 rounded">
              <div className="h5 mb-0 text-primary">
                {(liveStats?.last_hour.files || 0).toLocaleString()}
              </div>
              <small className="text-muted">Files</small>
            </div>
          </div>
          <div className="col-4">
            <div className="text-center p-2 bg-dark bg-opacity-50 rounded">
              <div className="h5 mb-0 text-success">
                {formatSize(liveStats?.last_hour.bytes_saved || 0)}
              </div>
              <small className="text-muted">Saved</small>
            </div>
          </div>
        </div>

        {/* Recent activity feed */}
        {liveStats?.last_event && (
          <div className="mt-3 p-2 bg-success bg-opacity-10 rounded border border-success border-opacity-25">
            <div className="d-flex align-items-center">
              <div className="me-2">
                <i className="bi bi-lightning-charge text-warning fs-5" />
              </div>
              <div>
                <small className="text-success">Latest ZIP created</small>
                <div className="text-muted small">
                  {liveStats.last_event.files} files • {formatSize(liveStats.last_event.bytes_saved)} saved
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      <style>{`
        @keyframes pulse {
          0% { opacity: 1; }
          50% { opacity: 0.3; }
          100% { opacity: 1; }
        }
        .scale-animation {
          animation: scale-up 0.3s ease-out;
        }
        @keyframes scale-up {
          0% { transform: scale(1); }
          50% { transform: scale(1.05); }
          100% { transform: scale(1); }
        }
      `}</style>
    </div>
  )
}
