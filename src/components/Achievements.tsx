import { useAchievements } from '../hooks/useFunFeatures'

const formatSize = (bytes: number): string => {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.floor(Math.log(Math.abs(bytes)) / Math.log(k))
  return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`
}

const formatThreshold = (threshold: number, type: string): string => {
  if (type === 'bytes_saved' || type === 'single_zip_size') {
    return formatSize(threshold)
  }
  return threshold.toLocaleString()
}

export default function Achievements() {
  const { achievements, totalUnlocked, currentStreak, isLoading, error, refresh } = useAchievements()

  if (!localStorage.getItem('zipdrop_client_id')) {
    return (
      <div className="card bg-dark border-secondary">
        <div className="card-body text-center py-4">
          <i className="bi bi-award fs-1 text-muted d-block mb-2" />
          <p className="text-muted mb-0">Create your first zip to start earning achievements!</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="card bg-dark border-danger">
        <div className="card-body text-center">
          <p className="text-danger mb-2">Failed to load achievements</p>
          <button type="button" className="btn btn-outline-danger btn-sm" onClick={refresh}>
            Try Again
          </button>
        </div>
      </div>
    )
  }

  const unlockedAchievements = achievements.filter(a => a.unlocked)
  const lockedAchievements = achievements.filter(a => !a.unlocked)

  return (
    <div className="card bg-dark border-secondary">
      <div className="card-header d-flex justify-content-between align-items-center">
        <h5 className="mb-0">
          <i className="bi bi-award me-2 text-warning" />
          Achievements
        </h5>
        <div className="d-flex gap-3">
          {currentStreak > 0 && (
            <span className="badge bg-danger fs-6">
              🔥 {currentStreak} day streak
            </span>
          )}
          <span className="badge bg-success fs-6">
            {totalUnlocked}/{achievements.length} Unlocked
          </span>
        </div>
      </div>
      <div className="card-body">
        {isLoading ? (
          <div className="text-center py-4">
            <div className="spinner-border spinner-border-sm text-primary" />
          </div>
        ) : (
          <>
            {/* Unlocked Achievements */}
            {unlockedAchievements.length > 0 && (
              <div className="mb-4">
                <h6 className="text-success mb-3">
                  <i className="bi bi-unlock me-2" />
                  Unlocked ({unlockedAchievements.length})
                </h6>
                <div className="row g-3">
                  {unlockedAchievements.map((achievement) => (
                    <div key={achievement.id} className="col-md-6 col-lg-4">
                      <div className="card bg-success bg-opacity-10 border-success h-100">
                        <div className="card-body d-flex align-items-center">
                          <div className="fs-1 me-3">{achievement.icon}</div>
                          <div>
                            <h6 className="mb-1 text-success">{achievement.name}</h6>
                            <small className="text-muted">{achievement.description}</small>
                            {achievement.unlocked_at && (
                              <div className="mt-1">
                                <small className="text-muted">
                                  Unlocked {new Date(achievement.unlocked_at).toLocaleDateString()}
                                </small>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Locked Achievements with Progress */}
            {lockedAchievements.length > 0 && (
              <div>
                <h6 className="text-muted mb-3">
                  <i className="bi bi-lock me-2" />
                  In Progress ({lockedAchievements.length})
                </h6>
                <div className="row g-3">
                  {lockedAchievements.map((achievement) => (
                    <div key={achievement.id} className="col-md-6 col-lg-4">
                      <div className="card bg-dark border-secondary h-100 opacity-75">
                        <div className="card-body">
                          <div className="d-flex align-items-center mb-2">
                            <div className="fs-3 me-3 grayscale">{achievement.icon}</div>
                            <div>
                              <h6 className="mb-0">{achievement.name}</h6>
                              <small className="text-muted">{achievement.description}</small>
                            </div>
                          </div>
                          <div className="progress" style={{ height: '8px' }}>
                            <div 
                              className="progress-bar bg-primary" 
                              style={{ width: `${achievement.progress}%` }}
                            />
                          </div>
                          <small className="text-muted">
                            {achievement.type === 'bytes_saved' || achievement.type === 'single_zip_size'
                              ? `${formatSize(achievement.current)} / ${formatThreshold(achievement.threshold, achievement.type)}`
                              : `${achievement.current.toLocaleString()} / ${formatThreshold(achievement.threshold, achievement.type)}`
                            }
                            {' '}({achievement.progress}%)
                          </small>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
