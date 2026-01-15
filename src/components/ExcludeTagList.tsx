import { useId, type FC } from 'react'

interface Props {
  patterns: string[]
  onRemove: (index: number) => void
  onClearAll?: () => void
}

const ExcludeTagList: FC<Props> = ({ patterns, onRemove, onClearAll }) => {
  const listId = useId()
  
  if (patterns.length === 0) {
    return (
      <div className="text-muted small mb-4 p-3 border border-secondary rounded bg-dark">
        <i className="bi bi-lightbulb me-2" aria-hidden="true"></i>
        No exclusion patterns set. Add patterns above to exclude files from the ZIP.
      </div>
    )
  }

  return (
    <div className="mb-4">
      <div className="d-flex justify-content-between align-items-center mb-2">
        <span className="small text-muted">
          <i className="bi bi-check2-circle me-1" aria-hidden="true"></i>
          {patterns.length} pattern{patterns.length !== 1 ? 's' : ''} active
        </span>
        {onClearAll && patterns.length > 1 && (
          <button
            type="button"
            className="btn btn-sm btn-outline-danger"
            onClick={onClearAll}
            aria-label="Clear all exclusion patterns"
          >
            <i className="bi bi-x-circle me-1" aria-hidden="true"></i>
            Clear All
          </button>
        )}
      </div>
      
      <ul 
        id={listId}
        className="list-unstyled d-flex flex-wrap gap-2 mb-0"
        aria-label="Active exclusion patterns"
      >
        {patterns.map((pattern, index) => (
          <li key={`${pattern}-${index}`}>
            <span 
              className="badge bg-secondary d-inline-flex align-items-center gap-1 py-2 px-3"
              style={{ fontSize: '0.85rem' }}
            >
              <code className="text-light">{pattern}</code>
              <button
                type="button"
                className="btn-close btn-close-white ms-1"
                aria-label={`Remove pattern: ${pattern}`}
                style={{ fontSize: '0.5rem' }}
                onClick={() => onRemove(index)}
              />
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}

export default ExcludeTagList
