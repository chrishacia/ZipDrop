import { useEffect, useState, useId, useCallback, type FC, type JSX } from 'react'
import type { Minimatch } from 'minimatch'

interface ZipPreviewTreeProps {
  root: FileSystemDirectoryHandle | null
  matchers: Minimatch[]
  onExcludePathsChange?: (paths: string[], rawSize?: number, fileCount?: number) => void
}

interface TreeNode {
  path: string
  name: string
  kind: 'file' | 'directory'
  size?: number
  children?: TreeNode[]
}

const formatSize = (bytes: number): string => {
  const sizes = ['B', 'KB', 'MB', 'GB']
  if (bytes === 0) return '0 B'
  const i = Math.floor(Math.log(bytes) / Math.log(1024))
  return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${sizes[i]}`
}

const ZipPreviewTree: FC<ZipPreviewTreeProps> = ({ root, matchers, onExcludePathsChange }) => {
  const [tree, setTree] = useState<TreeNode | null>(null)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [excludedPaths, setExcludedPaths] = useState<Set<string>>(new Set())
  const [isLoading, setIsLoading] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const treeId = useId()

  const isExcluded = useCallback((path: string) => matchers.some(m => m.match(path)), [matchers])

  const readTree = useCallback(async (dir: FileSystemDirectoryHandle, path = ''): Promise<TreeNode | null> => {
    const fullPath = path || dir.name
    const name = fullPath.split('/').pop() || dir.name
    const node: TreeNode = { name, path: fullPath, kind: 'directory', children: [] }

    for await (const [, handle] of dir as unknown as AsyncIterable<[string, FileSystemHandle]>) {
      const subPath = path ? `${path}/${handle.name}` : handle.name
      if (isExcluded(subPath)) continue

      if (handle.kind === 'directory') {
        const subHandle = await dir.getDirectoryHandle(handle.name)
        const child = await readTree(subHandle, subPath)
        if (child) node.children!.push(child)
      } else {
        const file = await (await dir.getFileHandle(handle.name)).getFile()
        node.children!.push({ name: handle.name, path: subPath, kind: 'file', size: file.size })
      }
    }

    return node.children!.length ? node : null
  }, [isExcluded])

  useEffect(() => {
    if (!root) {
      setTree(null)
      return
    }
    
    setIsLoading(true)
    readTree(root).then(tree => {
      if (tree) {
        setTree(tree)
        setExpanded(new Set([tree.path]))
      } else {
        setTree(null)
      }
      setIsLoading(false)
    }).catch(() => {
      setIsLoading(false)
    })
  }, [root, matchers, readTree])

  useEffect(() => {
    const stats = tree ? countStats(tree) : { size: 0, files: 0 }
    onExcludePathsChange?.([...excludedPaths], stats.size, stats.files)
  }, [excludedPaths, tree, onExcludePathsChange])

  const collectPaths = (n: TreeNode): string[] =>
    [n.path, ...(n.children?.flatMap(collectPaths) ?? [])]

  const toggleCheckbox = (node: TreeNode) => {
    const all = collectPaths(node)
    const next = new Set(excludedPaths)
    const isRemoving = excludedPaths.has(node.path)
    for (const p of all) {
      if (isRemoving) {
        next.delete(p)
      } else {
        next.add(p)
      }
    }
    setExcludedPaths(next)
  }

  const toggleExpand = (path: string) => {
    const next = new Set(expanded)
    next.has(path) ? next.delete(path) : next.add(path)
    setExpanded(next)
  }

  const expandAll = () => {
    if (!tree) return
    const allPaths: string[] = []
    const collect = (n: TreeNode) => {
      if (n.kind === 'directory') {
        allPaths.push(n.path)
        n.children?.forEach(collect)
      }
    }
    collect(tree)
    setExpanded(new Set(allPaths))
  }

  const collapseAll = () => {
    if (!tree) return
    setExpanded(new Set([tree.path]))
  }

  const selectAll = () => {
    setExcludedPaths(new Set())
  }

  const deselectAll = () => {
    if (!tree) return
    setExcludedPaths(new Set(collectPaths(tree)))
  }

  const countStats = (n: TreeNode, stats = { files: 0, folders: 0, size: 0 }): typeof stats => {
    if (excludedPaths.has(n.path)) return stats
    if (n.kind === 'file') {
      stats.files++
      stats.size += n.size || 0
    } else {
      stats.folders++
      if (n.children) {
        for (const c of n.children) {
          countStats(c, stats)
        }
      }
    }
    return stats
  }

  const matchesSearch = (node: TreeNode): boolean => {
    if (!searchQuery) return true
    const query = searchQuery.toLowerCase()
    if (node.name.toLowerCase().includes(query)) return true
    if (node.children) {
      return node.children.some(matchesSearch)
    }
    return false
  }

  const getFileIcon = (name: string): string => {
    const ext = name.split('.').pop()?.toLowerCase()
    const iconMap: Record<string, string> = {
      'js': 'bi-filetype-js', 'jsx': 'bi-filetype-jsx', 'ts': 'bi-filetype-tsx', 'tsx': 'bi-filetype-tsx',
      'json': 'bi-filetype-json', 'md': 'bi-filetype-md', 'html': 'bi-filetype-html', 'css': 'bi-filetype-css',
      'scss': 'bi-filetype-scss', 'sass': 'bi-filetype-sass', 'less': 'bi-filetype-css',
      'png': 'bi-filetype-png', 'jpg': 'bi-filetype-jpg', 'jpeg': 'bi-filetype-jpg', 'gif': 'bi-filetype-gif', 'svg': 'bi-filetype-svg', 'ico': 'bi-image',
      'pdf': 'bi-filetype-pdf', 'doc': 'bi-filetype-doc', 'docx': 'bi-filetype-docx', 'txt': 'bi-file-text',
      'zip': 'bi-file-zip', 'tar': 'bi-file-zip', 'gz': 'bi-file-zip', '7z': 'bi-file-zip',
      'mp3': 'bi-filetype-mp3', 'wav': 'bi-filetype-wav', 'mp4': 'bi-filetype-mp4', 'mov': 'bi-filetype-mov',
      'py': 'bi-filetype-py', 'rb': 'bi-filetype-rb', 'go': 'bi-file-code', 'rs': 'bi-file-code',
      'java': 'bi-filetype-java', 'kt': 'bi-file-code', 'swift': 'bi-file-code',
      'sh': 'bi-filetype-sh', 'bash': 'bi-filetype-sh', 'zsh': 'bi-filetype-sh',
      'yml': 'bi-filetype-yml', 'yaml': 'bi-filetype-yml', 'toml': 'bi-file-code', 'env': 'bi-file-lock',
      'lock': 'bi-file-lock', 'log': 'bi-file-text',
    }
    return iconMap[ext || ''] || 'bi-file-earmark'
  }

  const renderTree = (n: TreeNode, depth = 0): JSX.Element | null => {
    if (!matchesSearch(n)) return null
    
    const isOpen = expanded.has(n.path)
    const isChecked = !excludedPaths.has(n.path)
    const checkboxId = `${treeId}-${n.path.replace(/[^a-zA-Z0-9]/g, '-')}`

    const visibleChildren = n.children?.filter(matchesSearch) || []

    return (
      <li 
        key={n.path} 
        className="tree-item"
        role="treeitem"
        aria-expanded={n.kind === 'directory' ? isOpen : undefined}
        aria-selected={isChecked}
      >
        <div 
          className={`tree-item-content d-flex align-items-center py-1 px-2 rounded ${isChecked ? '' : 'opacity-50'}`}
          style={{ marginLeft: `${depth * 1.25}rem` }}
        >
          <input 
            type="checkbox" 
            id={checkboxId}
            className="form-check-input me-2 flex-shrink-0" 
            checked={isChecked} 
            onChange={() => toggleCheckbox(n)}
            aria-label={`${isChecked ? 'Exclude' : 'Include'} ${n.name}`}
          />
          
          {n.kind === 'directory' ? (
            <button 
              className="btn btn-link p-0 me-1 text-decoration-none flex-shrink-0 tree-folder-toggle" 
              type="button" 
              onClick={() => toggleExpand(n.path)}
              aria-label={isOpen ? `Collapse ${n.name} folder` : `Expand ${n.name} folder`}
              aria-expanded={isOpen}
            >
              <i className={`bi ${isOpen ? 'bi-folder2-open text-warning' : 'bi-folder2 text-secondary'}`} aria-hidden="true"></i>
            </button>
          ) : (
            <i className={`bi ${getFileIcon(n.name)} me-1 flex-shrink-0 text-secondary`} aria-hidden="true"></i>
          )}
          
          <label 
            htmlFor={checkboxId}
            className="tree-item-name mb-0 text-truncate flex-grow-1"
            title={n.path}
          >
            {n.name}
          </label>
          
          {n.kind === 'file' && n.size !== undefined && (
            <span className="badge bg-secondary ms-2 flex-shrink-0">
              {formatSize(n.size)}
            </span>
          )}
          
          {n.kind === 'directory' && n.children && (
            <span className="badge bg-dark text-muted ms-2 flex-shrink-0">
              {n.children.length} item{n.children.length !== 1 ? 's' : ''}
            </span>
          )}
        </div>
        
        {n.children && isOpen && visibleChildren.length > 0 && (
          <ul 
            className="list-unstyled mb-0"
            role="group"
          >
            {visibleChildren
              .sort((a, b) => {
                if (a.kind !== b.kind) return a.kind === 'directory' ? -1 : 1
                return a.name.localeCompare(b.name)
              })
              .map(child => renderTree(child, depth + 1))}
          </ul>
        )}
      </li>
    )
  }

  const stats = tree ? countStats(tree) : { files: 0, folders: 0, size: 0 }

  if (isLoading) {
    return (
      <div className="card bg-dark border-secondary">
        <div className="card-body text-center py-5">
          <div className="spinner-border text-primary mb-3" role="status">
            <span className="visually-hidden">Loading folder contents...</span>
          </div>
          <p className="mb-0 text-muted">Scanning folder contents...</p>
        </div>
      </div>
    )
  }

  if (!root) {
    return (
      <div className="card bg-dark border-secondary">
        <div className="card-body text-center py-5">
          <i className="bi bi-folder-plus display-4 mb-3 d-block text-secondary" aria-hidden="true"></i>
          <h3 className="h5 mb-2">No Folder Selected</h3>
          <p className="text-muted mb-0">
            Click "Select Folder" to choose a directory to zip
          </p>
        </div>
      </div>
    )
  }

  if (!tree) {
    return (
      <div className="card bg-dark border-secondary">
        <div className="card-body text-center py-5">
          <i className="bi bi-funnel display-4 mb-3 d-block text-secondary" aria-hidden="true"></i>
          <h3 className="h5 mb-2">No Files to Display</h3>
          <p className="text-muted mb-0">
            All files in this folder match your exclusion patterns
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="card bg-dark border-secondary">
      <div className="card-header py-3">
        <div className="d-flex flex-wrap justify-content-between align-items-center gap-2">
          <h3 className="h5 mb-0">
            <i className="bi bi-folder-symlink me-2" aria-hidden="true"></i>
            File Preview
          </h3>
          
          <div className="d-flex flex-wrap gap-2">
            <div 
              className="btn-group btn-group-sm" 
              role="group" 
              aria-label="Tree expansion controls"
            >
              <button 
                type="button" 
                className="btn btn-outline-light"
                onClick={expandAll}
                aria-label="Expand all folders"
              >
                <i className="bi bi-arrows-expand me-1" aria-hidden="true"></i>
                Expand
              </button>
              <button 
                type="button" 
                className="btn btn-outline-light"
                onClick={collapseAll}
                aria-label="Collapse all folders"
              >
                <i className="bi bi-arrows-collapse me-1" aria-hidden="true"></i>
                Collapse
              </button>
            </div>
            
            <div 
              className="btn-group btn-group-sm" 
              role="group" 
              aria-label="File selection controls"
            >
              <button 
                type="button" 
                className="btn btn-outline-success"
                onClick={selectAll}
                aria-label="Select all files"
              >
                <i className="bi bi-check-all me-1" aria-hidden="true"></i>
                All
              </button>
              <button 
                type="button" 
                className="btn btn-outline-danger"
                onClick={deselectAll}
                aria-label="Deselect all files"
              >
                <i className="bi bi-x-lg me-1" aria-hidden="true"></i>
                None
              </button>
            </div>
          </div>
        </div>
        
        <div className="mt-3">
          <label htmlFor={`${treeId}-search`} className="visually-hidden">
            Search files and folders
          </label>
          <div className="input-group input-group-sm">
            <span className="input-group-text bg-dark border-secondary" aria-hidden="true">
              <i className="bi bi-search"></i>
            </span>
            <input
              type="search"
              id={`${treeId}-search`}
              className="form-control bg-dark border-secondary text-white"
              placeholder="Search files and folders..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              aria-describedby={`${treeId}-search-hint`}
            />
            {searchQuery && (
              <button
                type="button"
                className="btn btn-outline-secondary"
                onClick={() => setSearchQuery('')}
                aria-label="Clear search"
              >
                <i className="bi bi-x-lg"></i>
              </button>
            )}
          </div>
          <span id={`${treeId}-search-hint`} className="visually-hidden">
            Type to filter the file tree
          </span>
        </div>
      </div>
      
      <div className="card-body p-0">
        <div 
          className="tree-stats d-flex flex-wrap gap-3 px-3 py-2 border-bottom border-secondary bg-dark-subtle"
          role="status"
          aria-live="polite"
        >
          <span>
            <strong className="text-success">{stats.files}</strong> files
          </span>
          <span>
            <strong className="text-info">{stats.folders}</strong> folders
          </span>
          <span>
            <strong className="text-warning">{formatSize(stats.size)}</strong> total
          </span>
        </div>
        
        <div 
          className="tree-container p-3" 
          style={{ maxHeight: '400px', overflowY: 'auto' }}
          role="tree"
          aria-label="File tree"
        >
          <ul className="list-unstyled mb-0" role="group">
            {renderTree(tree)}
          </ul>
        </div>
      </div>
    </div>
  )
}

export default ZipPreviewTree
