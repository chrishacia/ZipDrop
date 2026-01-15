import { useState, useRef, useEffect, useId, type FC } from 'react'

export interface PatternPreset {
  id: string
  name: string
  icon: string  // Bootstrap icon class
  description: string
  patterns: string[]
}

export const PATTERN_PRESETS: PatternPreset[] = [
  {
    id: 'web-dev',
    name: 'Web Development',
    icon: 'bi-globe',
    description: 'Node.js, npm, pnpm, build outputs',
    patterns: [
      'node_modules',
      '.pnpm',
      'dist',
      'build',
      '.next',
      '.nuxt',
      '.output',
      '.cache',
      '.parcel-cache',
      '*.log',
      'npm-debug.log*',
      'yarn-debug.log*',
      'yarn-error.log*',
      '.npm',
      '.yarn',
    ]
  },
  {
    id: 'git-vcs',
    name: 'Git & Version Control',
    icon: 'bi-git',
    description: 'Git history, hooks, and metadata',
    patterns: [
      '.git',
      '.gitignore',
      '.gitattributes',
      '.gitmodules',
      '.svn',
      '.hg',
    ]
  },
  {
    id: 'ide-editor',
    name: 'IDE & Editors',
    icon: 'bi-code-square',
    description: 'VS Code, JetBrains, Vim, etc.',
    patterns: [
      '.vscode',
      '.idea',
      '*.swp',
      '*.swo',
      '*~',
      '.project',
      '.classpath',
      '.settings',
      '*.sublime-*',
    ]
  },
  {
    id: 'os-system',
    name: 'OS & System Files',
    icon: 'bi-display',
    description: 'macOS, Windows, Linux system files',
    patterns: [
      '.DS_Store',
      'Thumbs.db',
      'Desktop.ini',
      '*.lnk',
      '.Spotlight-V100',
      '.Trashes',
      'ehthumbs.db',
    ]
  },
  {
    id: 'python',
    name: 'Python',
    icon: 'bi-filetype-py',
    description: 'Virtual envs, cache, bytecode',
    patterns: [
      '__pycache__',
      '*.py[cod]',
      '*$py.class',
      '.Python',
      'venv',
      '.venv',
      'env',
      '.env',
      'ENV',
      '.tox',
      '.pytest_cache',
      '.mypy_cache',
      '*.egg-info',
      'dist',
      'build',
    ]
  },
  {
    id: 'java',
    name: 'Java & JVM',
    icon: 'bi-cup-hot',
    description: 'Maven, Gradle, compiled classes',
    patterns: [
      'target',
      '*.class',
      '*.jar',
      '*.war',
      '*.ear',
      '.gradle',
      'build',
      'out',
      '.mvn',
    ]
  },
  {
    id: 'testing',
    name: 'Testing & Coverage',
    icon: 'bi-clipboard-check',
    description: 'Test outputs, coverage reports',
    patterns: [
      'coverage',
      '.nyc_output',
      '.coverage',
      'htmlcov',
      '*.lcov',
      'test-results',
      'jest-results',
      '.jest',
    ]
  },
  {
    id: 'my-defaults',
    name: "Chris's Favorites",
    icon: 'bi-star-fill',
    description: 'Quick preset for common dev projects',
    patterns: [
      'node_modules',
      '.git',
      'dist',
      '.next',
      '.vscode',
      '.pnpm',
      '.DS_Store',
      '*.log',
    ]
  },
]

interface Props {
  onApplyPreset: (patterns: string[]) => void
  existingPatterns: string[]
  disabled?: boolean
}

const PatternPresets: FC<Props> = ({ onApplyPreset, existingPatterns, disabled }) => {
  const [isOpen, setIsOpen] = useState(false)
  const [selectedPresets, setSelectedPresets] = useState<Set<string>>(new Set())
  const dropdownRef = useRef<HTMLDivElement>(null)
  const buttonId = useId()
  const menuId = useId()

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside)
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [isOpen])

  // Close on escape key
  useEffect(() => {
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && isOpen) {
        setIsOpen(false)
      }
    }

    document.addEventListener('keydown', handleEscape)
    return () => document.removeEventListener('keydown', handleEscape)
  }, [isOpen])

  const togglePreset = (presetId: string) => {
    setSelectedPresets(prev => {
      const next = new Set(prev)
      if (next.has(presetId)) {
        next.delete(presetId)
      } else {
        next.add(presetId)
      }
      return next
    })
  }

  const getNewPatternsCount = (patterns: string[]): number => {
    return patterns.filter(p => !existingPatterns.includes(p)).length
  }

  const getSelectedPatternsPreview = (): string[] => {
    const allPatterns = new Set<string>()
    selectedPresets.forEach(presetId => {
      const preset = PATTERN_PRESETS.find(p => p.id === presetId)
      if (preset) {
        preset.patterns.forEach(p => allPatterns.add(p))
      }
    })
    return [...allPatterns]
  }

  const handleApply = () => {
    const patterns = getSelectedPatternsPreview()
    if (patterns.length > 0) {
      onApplyPreset(patterns)
      setSelectedPresets(new Set())
      setIsOpen(false)
    }
  }

  const handleQuickApply = (preset: PatternPreset) => {
    onApplyPreset(preset.patterns)
    setIsOpen(false)
  }

  const selectedPatterns = getSelectedPatternsPreview()
  const newPatternsToAdd = selectedPatterns.filter(p => !existingPatterns.includes(p))

  return (
    <div className="dropdown" ref={dropdownRef}>
      <button
        id={buttonId}
        type="button"
        className="btn btn-outline-info dropdown-toggle"
        onClick={() => setIsOpen(!isOpen)}
        disabled={disabled}
        aria-expanded={isOpen}
        aria-haspopup="true"
        aria-controls={menuId}
        aria-label="Add common exclusion patterns from presets"
      >
        <i className="bi bi-collection me-1" aria-hidden="true"></i>
        Presets
      </button>

      {isOpen && (
        <div 
          id={menuId}
          className="dropdown-menu dropdown-menu-dark show p-0"
          style={{ 
            minWidth: '340px',
            maxHeight: '70vh',
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column'
          }}
          role="menu"
          aria-labelledby={buttonId}
        >
          {/* Header */}
          <div className="px-3 py-2 border-bottom border-secondary bg-dark sticky-top">
            <h6 className="mb-1 text-light">
              <i className="bi bi-lightning-charge me-1" aria-hidden="true"></i>
              Quick Add Patterns
            </h6>
            <small className="text-muted">
              Click to select, or use <i className="bi bi-lightning-fill" aria-hidden="true"></i> for instant add
            </small>
          </div>

          {/* Scrollable preset list */}
          <div style={{ overflowY: 'auto', flex: 1 }}>
            {PATTERN_PRESETS.map((preset) => {
              const isSelected = selectedPresets.has(preset.id)
              const newCount = getNewPatternsCount(preset.patterns)
              const allExist = newCount === 0

              return (
                <div
                  key={preset.id}
                  className={`px-3 py-2 border-bottom border-secondary ${isSelected ? 'bg-primary bg-opacity-25' : ''}`}
                  role="menuitem"
                >
                  <div className="d-flex align-items-start gap-2">
                    {/* Checkbox for multi-select */}
                    <div className="form-check mb-0 mt-1">
                      <input
                        type="checkbox"
                        className="form-check-input"
                        id={`preset-${preset.id}`}
                        checked={isSelected}
                        onChange={() => togglePreset(preset.id)}
                        disabled={allExist}
                        aria-describedby={`preset-desc-${preset.id}`}
                      />
                    </div>

                    {/* Preset info */}
                    <div className="flex-grow-1" style={{ minWidth: 0 }}>
                      <label 
                        htmlFor={`preset-${preset.id}`}
                        className={`mb-0 d-flex align-items-center gap-2 ${allExist ? 'text-muted' : 'text-light'}`}
                        style={{ cursor: allExist ? 'default' : 'pointer' }}
                      >
                        <i className={`bi ${preset.icon}`} aria-hidden="true"></i>
                        <strong>{preset.name}</strong>
                        {newCount > 0 && (
                          <span className="badge bg-success ms-auto">
                            +{newCount} new
                          </span>
                        )}
                        {allExist && (
                          <span className="badge bg-secondary ms-auto">
                            All added
                          </span>
                        )}
                      </label>
                      <small id={`preset-desc-${preset.id}`} className="text-muted d-block mt-1">
                        {preset.description}
                      </small>
                    </div>

                    {/* Quick apply button */}
                    {!allExist && (
                      <button
                        type="button"
                        className="btn btn-sm btn-outline-success flex-shrink-0"
                        onClick={(e) => {
                          e.stopPropagation()
                          handleQuickApply(preset)
                        }}
                        title={`Instantly add ${preset.name} patterns`}
                        aria-label={`Instantly add ${newCount} patterns from ${preset.name}`}
                      >
                        <i className="bi bi-lightning-fill" aria-hidden="true"></i>
                      </button>
                    )}
                  </div>
                </div>
              )
            })}
          </div>

          {/* Footer with apply button */}
          {selectedPresets.size > 0 && (
            <div className="px-3 py-2 border-top border-secondary bg-dark sticky-bottom">
              <div className="d-flex justify-content-between align-items-center mb-2">
                <small className="text-muted">
                  {selectedPresets.size} preset{selectedPresets.size !== 1 ? 's' : ''} selected
                </small>
                <small className="text-success">
                  +{newPatternsToAdd.length} new pattern{newPatternsToAdd.length !== 1 ? 's' : ''}
                </small>
              </div>
              <button
                type="button"
                className="btn btn-success w-100"
                onClick={handleApply}
                disabled={newPatternsToAdd.length === 0}
              >
                <i className="bi bi-plus-circle me-1" aria-hidden="true"></i>
                Add Selected Patterns
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default PatternPresets
