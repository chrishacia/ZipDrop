import React, { useState } from 'react'

interface Props {
  onAdd: (pattern: string) => void
}

const ExcludeInput: React.FC<Props> = ({ onAdd }) => {
  const [value, setValue] = useState('')

  const handleAdd = () => {
    const trimmed = value.trim()
    if (trimmed) {
      onAdd(trimmed)
      setValue('')
    }
  }

  return (
    <div className="input-group">
      <input
        type="text"
        className="form-control"
        placeholder="e.g. node_modules/**"
        value={value}
        onChange={e => setValue(e.target.value)}
        onKeyDown={e => {
          if (e.key === 'Enter') handleAdd()
        }}
      />
      <button className="btn btn-outline-primary" onClick={handleAdd}>Add</button>
    </div>
  )
}

export default ExcludeInput
