// ZipPreviewTree.tsx
import React, { useEffect, useState, type JSX } from 'react'
import { Minimatch } from 'minimatch'

interface ZipPreviewTreeProps {
  root: FileSystemDirectoryHandle | null
  matchers: Minimatch[]
  onExcludePathsChange?: (paths: string[], rawSize?: number) => void
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

const ZipPreviewTree: React.FC<ZipPreviewTreeProps> = ({ root, matchers, onExcludePathsChange }) => {
  const [tree, setTree] = useState<TreeNode | null>(null)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [excludedPaths, setExcludedPaths] = useState<Set<string>>(new Set())

  const isExcluded = (path: string) => matchers.some(m => m.match(path))

  const readTree = async (dir: FileSystemDirectoryHandle, path = ''): Promise<TreeNode | null> => {
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
  }

  useEffect(() => {
    if (!root) return
    readTree(root).then(tree => {
      if (tree) {
        setTree(tree)
        setExpanded(new Set([tree.path]))
      } else {
        setTree(null)
      }
    })
  }, [root, matchers])

  useEffect(() => {
    const size = tree ? countStats(tree).size : 0
    onExcludePathsChange?.([...excludedPaths], size)
  }, [excludedPaths, tree])

  const collectPaths = (n: TreeNode): string[] =>
    [n.path, ...(n.children?.flatMap(collectPaths) ?? [])]

  const toggleCheckbox = (node: TreeNode) => {
    const all = collectPaths(node)
    const next = new Set(excludedPaths)
    const isRemoving = excludedPaths.has(node.path)
    all.forEach(p => isRemoving ? next.delete(p) : next.add(p))
    setExcludedPaths(next)
  }

  const toggleExpand = (path: string) => {
    const next = new Set(expanded)
    next.has(path) ? next.delete(path) : next.add(path)
    setExpanded(next)
  }

  const countStats = (n: TreeNode, stats = { files: 0, folders: 0, size: 0 }) => {
    if (excludedPaths.has(n.path)) return stats
    if (n.kind === 'file') {
      stats.files++
      stats.size += n.size || 0
    } else {
      stats.folders++
      n.children?.forEach(c => countStats(c, stats))
    }
    return stats
  }

  const renderTree = (n: TreeNode): JSX.Element => {
    const isOpen = expanded.has(n.path)
    const isChecked = !excludedPaths.has(n.path)
    return (
      <li key={n.path}>
        <label style={{ fontFamily: 'monospace' }}>
          <input type="checkbox" className="me-2" checked={isChecked} onChange={() => toggleCheckbox(n)} />
          {n.kind === 'directory' && (
            <button className="btn btn-sm btn-link p-0 me-2" type="button" onClick={() => toggleExpand(n.path)}>
              {isOpen ? '📂' : '📁'}
            </button>
          )}
          {n.name}
          {n.kind === 'file' && n.size !== undefined && (
            <span className="text-muted ms-2">({formatSize(n.size)})</span>
          )}
        </label>
        {n.children && isOpen && (
          <ul className="ms-4 mt-1">
            {n.children.sort((a, b) => a.kind.localeCompare(b.kind)).map(renderTree)}
          </ul>
        )}
      </li>
    )
  }

  return tree ? (
    <ul className="list-unstyled">{renderTree(tree)}</ul>
  ) : <div className="text-muted mt-2">No folder selected or no visible files</div>
}

export default ZipPreviewTree
