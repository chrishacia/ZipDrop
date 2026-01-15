import { useState, useId, type FC } from 'react'

interface Props {
  onAdd: (pattern: string) => void
  disabled?: boolean
}

const ExcludeInput: FC<Props> = ({ onAdd, disabled = false }) => {
  const [value, setValue] = useState('')
  const [showHelp, setShowHelp] = useState(false)
  const inputId = useId()
  const helpId = useId()

  const handleAdd = () => {
    const trimmed = value.trim()
    if (trimmed) {
      onAdd(trimmed)
      setValue('')
    }
  }

  const canAdd = value.trim().length > 0 && !disabled

  return (
    <div className="card bg-dark border-secondary mb-4">
      <div className="card-header d-flex justify-content-between align-items-center py-3">
        <h3 className="h5 mb-0">
          <i className="bi bi-funnel me-2" aria-hidden="true"></i>
          Exclusion Patterns
        </h3>
        <button
          type="button"
          className="btn btn-sm btn-outline-light"
          onClick={() => setShowHelp(!showHelp)}
          aria-expanded={showHelp}
          aria-controls={helpId}
        >
          <i className={`bi ${showHelp ? 'bi-x-lg' : 'bi-question-circle'} me-1`} aria-hidden="true"></i>
          {showHelp ? 'Close' : 'Help'}
        </button>
      </div>
      
      <div className="card-body">
        {showHelp && (
          <section 
            id={helpId}
            className="alert alert-info mb-3" 
            aria-labelledby={`${helpId}-title`}
          >
            <h4 id={`${helpId}-title`} className="h6 mb-2">Pattern Syntax</h4>
            <ul className="mb-0 small">
              <li><code>node_modules</code> - Matches folder/file with exact name</li>
              <li><code>*.log</code> - Matches all .log files</li>
              <li><code>**/*.test.js</code> - Matches .test.js files in any directory</li>
              <li><code>.git</code> - Matches hidden files/folders</li>
              <li><code>dist/**</code> - Matches everything inside dist folder</li>
            </ul>
          </section>
        )}
        
        <div className="input-group">
          <label htmlFor={inputId} className="visually-hidden">
            Enter exclusion pattern
          </label>
          <input
            type="text"
            id={inputId}
            className="form-control bg-dark border-secondary text-white"
            placeholder="e.g. node_modules, *.log, .git"
            value={value}
            onChange={e => setValue(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter' && canAdd) handleAdd()
            }}
            disabled={disabled}
            aria-describedby={`${inputId}-hint`}
          />
          <button 
            type="button"
            className="btn btn-primary" 
            onClick={handleAdd}
            disabled={!canAdd}
            aria-label="Add exclusion pattern"
          >
            <i className="bi bi-plus-lg me-1" aria-hidden="true"></i>
            Add
          </button>
        </div>
        <small id={`${inputId}-hint`} className="text-muted mt-1 d-block">
          Press Enter or click Add to add a new exclusion pattern
        </small>
      </div>
    </div>
  )
}

export default ExcludeInput
