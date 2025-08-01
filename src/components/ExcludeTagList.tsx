import React from 'react'

interface Props {
  patterns: string[]
  onRemove: (index: number) => void
}

const ExcludeTagList: React.FC<Props> = ({ patterns, onRemove }) => (
  <div className="d-flex flex-wrap gap-2 mb-2">
    {patterns.map((pattern, index) => (
      <span key={index} className="badge bg-secondary d-flex align-items-center">
        {pattern}
        <button
          type="button"
          className="btn-close btn-close-white ms-2"
          aria-label="Remove"
          style={{ fontSize: '0.6rem' }}
          onClick={() => onRemove(index)}
        />
      </span>
    ))}
  </div>
)

export default ExcludeTagList
