import { type FC, useState, useRef, useCallback, useId } from 'react'

interface DropZoneProps {
  onFolderSelected: (handle: FileSystemDirectoryHandle) => void
  onSelectClick: () => void
  isDisabled?: boolean
  hasFolder: boolean
  folderName?: string
}

const DropZone: FC<DropZoneProps> = ({
  onFolderSelected,
  onSelectClick,
  isDisabled = false,
  hasFolder,
  folderName
}) => {
  const [isDragging, setIsDragging] = useState(false)
  const [dragError, setDragError] = useState<string | null>(null)
  const dropZoneRef = useRef<HTMLDivElement>(null)
  const dropZoneId = useId()

  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (!isDisabled) {
      setIsDragging(true)
      setDragError(null)
    }
  }, [isDisabled])

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    // Only set dragging to false if we're leaving the drop zone entirely
    if (e.currentTarget === dropZoneRef.current && !dropZoneRef.current?.contains(e.relatedTarget as Node)) {
      setIsDragging(false)
    }
  }, [])

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
  }, [])

  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(false)

    if (isDisabled) return

    const items = e.dataTransfer.items
    if (!items || items.length === 0) {
      setDragError('No items dropped')
      return
    }

    // Try to get a directory handle from the dropped item
    const item = items[0]
    
    // Check if the browser supports getAsFileSystemHandle
    if ('getAsFileSystemHandle' in item) {
      try {
        const handle = await (item as DataTransferItem & { getAsFileSystemHandle(): Promise<FileSystemHandle> }).getAsFileSystemHandle()
        
        if (handle && handle.kind === 'directory') {
          onFolderSelected(handle as FileSystemDirectoryHandle)
          setDragError(null)
        } else {
          setDragError('Please drop a folder, not a file')
        }
      } catch (err) {
        console.error('Error getting file handle:', err)
        setDragError('Unable to access dropped folder. Try using the Select Folder button instead.')
      }
    } else {
      // Fallback for browsers that don't support getAsFileSystemHandle
      setDragError('Your browser doesn\'t support folder drag & drop. Please use the Select Folder button.')
    }
  }, [isDisabled, onFolderSelected])

  return (
    <div
      ref={dropZoneRef}
      id={dropZoneId}
      className={`drop-zone card border-2 ${isDragging ? 'drop-zone-active border-primary' : 'border-secondary border-dashed'} ${hasFolder ? 'drop-zone-has-folder' : ''}`}
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
      role="button"
      tabIndex={isDisabled ? -1 : 0}
      aria-label={hasFolder ? `Current folder: ${folderName}. Drop a new folder or click to change.` : 'Drop a folder here or click to select'}
      aria-disabled={isDisabled}
      onClick={() => !isDisabled && onSelectClick()}
      onKeyDown={(e) => {
        if (!isDisabled && (e.key === 'Enter' || e.key === ' ')) {
          e.preventDefault()
          onSelectClick()
        }
      }}
    >
      <div className="card-body text-center py-5">
        {isDragging ? (
          <>
            <i className="bi bi-box-arrow-in-down display-4 d-block mb-3 text-primary" aria-hidden="true"></i>
            <h3 className="h5 mb-2">Drop folder here</h3>
            <p className="text-muted mb-0">Release to select this folder</p>
          </>
        ) : hasFolder ? (
          <>
            <i className="bi bi-folder-check display-5 d-block mb-2 text-success" aria-hidden="true"></i>
            <h3 className="h5 mb-1 text-success">{folderName}</h3>
            <p className="text-muted small mb-0">
              Drop a different folder or click to change
            </p>
          </>
        ) : (
          <>
            <i className="bi bi-folder-plus display-4 d-block mb-3 text-secondary" aria-hidden="true"></i>
            <h3 className="h5 mb-2">Drag & Drop a Folder</h3>
            <p className="text-muted mb-2">
              or click to browse
            </p>
            <span className="badge bg-secondary">
              <i className="bi bi-info-circle me-1" aria-hidden="true"></i>
              Supports folder selection via drag & drop
            </span>
          </>
        )}
        
        {dragError && (
          <div className="alert alert-warning mt-3 mb-0 py-2" role="alert">
            <small>{dragError}</small>
          </div>
        )}
      </div>
    </div>
  )
}

export default DropZone
