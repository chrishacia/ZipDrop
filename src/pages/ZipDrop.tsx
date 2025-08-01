import React, { useState, useMemo } from 'react'
import { Minimatch } from 'minimatch'
import { usePersistedPatterns } from '../hooks/usePersistedPatterns'
import ExcludeInput from '../components/ExcludeInput'
import ExcludeTagList from '../components/ExcludeTagList'
import ZipPreviewTree from '../components/ZipPreviewTree'
import { getDefaultExcludePatterns } from '../utils/getDefaultExcludePatterns'
import type JSZipType from 'jszip'

const formatSize = (bytes: number): string => {
    const units = ['B', 'KB', 'MB', 'GB']
    if (bytes === 0) return '0 B'
    const i = Math.floor(Math.log(bytes) / Math.log(1024))
    return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${units[i]}`
}

const ZipDrop: React.FC = () => {
    const [directoryHandle, setDirectoryHandle] = useState<FileSystemDirectoryHandle | null>(null)
    const [status, setStatus] = useState<string>('')
    const [unselectedPaths, setUnselectedPaths] = useState<string[]>([])
    const [rawSize, setRawSize] = useState<number>(0)

    const { patterns: excludePatterns, setPatterns: setExcludePatterns } = usePersistedPatterns()

    const matchers = useMemo(() => {
        return excludePatterns.map(p => {
            const normalized = p.startsWith('**/') || p.includes('/') ? p : `**/${p}`
            return new Minimatch(normalized, { dot: true })
        })
    }, [excludePatterns])

    const isExcludedByPattern = (path: string) => matchers.some(m => m.match(path))
    const isUncheckedManually = (path: string) => unselectedPaths.includes(path)

    const selectFolder = async () => {
        try {
            const handle = await (window as any).showDirectoryPicker()
            setDirectoryHandle(handle)
            setStatus('')
        } catch {
            setStatus('❌ Folder selection canceled.')
        }
    }

    const resetViewState = () => {
        setDirectoryHandle(null)
        setStatus('')
        setUnselectedPaths([])
        setRawSize(0)
    }

    const createZip = async () => {
        if (!directoryHandle) {
            alert('Pick a folder first!')
            return
        }

        const JSZip = (await import('jszip')).default
        const zip = new JSZip()

        const traverse = async (
            dir: FileSystemDirectoryHandle,
            zipFolder: JSZipType,
            relPath = ''
        ) => {
            for await (const [, entry] of (dir as unknown as AsyncIterable<[string, FileSystemHandle]>)) {
                const path = relPath ? `${relPath}/${entry.name}` : entry.name
                if (isExcludedByPattern(path) || isUncheckedManually(path)) continue

                if (entry.kind === 'directory') {
                    const subDir = zipFolder.folder(entry.name)!
                    const subHandle = await dir.getDirectoryHandle(entry.name)
                    await traverse(subHandle, subDir, path)
                } else if (entry.kind === 'file') {
                    const file = await (await dir.getFileHandle(entry.name)).getFile()
                    zip.file(path, await file.arrayBuffer())
                }
            }
        }

        try {
            setStatus('⚙️ Zipping files...')
            await traverse(directoryHandle, zip)
            const blob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 9 } })
            const url = URL.createObjectURL(blob)
            const link = document.createElement('a')
            link.href = url
            link.download = `${directoryHandle.name}.zip`
            link.click()
            setStatus('✅ ZIP created and downloaded!')
        } catch (err) {
            console.error(err)
            setStatus('❌ Error creating ZIP.')
        }
    }

    // Calculate estimated size based on raw size and compression ratio
    // assuming a typical compression ratio of 15% for text files
    const estimatedZipSize = rawSize * 0.85

    return (
        <div className="container mt-5">
            <h1 className="mb-4">📦 ZipDrop</h1>

            {directoryHandle && (
                <div className="alert alert-info" role="alert">
                    <strong>Selected folder:</strong> {directoryHandle.name} <br />
                    📁 Folder: <code>{directoryHandle.name}</code><br />
                    🧮 Estimated raw size: <strong>{formatSize(rawSize)}</strong><br />
                    📦 Estimated ZIP size: <strong>{formatSize(estimatedZipSize)}</strong>
                </div>
            )}

            <div className="mb-3">
                <p className="lead">
                    ZipDrop is a simple tool to create ZIP archives from selected folders, excluding specified patterns.
                    Use the controls below to select a folder and manage exclusion patterns.
                </p>
            </div>

            <div className="mb-3">
                <button className="btn btn-primary me-2" onClick={selectFolder}>Select Folder</button>
                <button className="btn btn-success me-2" onClick={createZip}>Create ZIP</button>
                <button className="btn btn-danger me-2" onClick={resetViewState}>Reset</button>
                <button
                    className="btn btn-outline-success me-2"
                    onClick={() => {
                        const next = new Set(excludePatterns)
                        for (const p of getDefaultExcludePatterns()) next.add(p)
                        setExcludePatterns([...next])
                    }}
                >
                    Load Example Exclude Patterns
                </button>

                <a href="https://github.com/chrishacia/ZipDrop" target="_blank" className="btn btn-outline-secondary float-end" onClick={resetViewState}>GitHub</a>

            </div>


            <ExcludeTagList
                patterns={excludePatterns}
                onRemove={(index) => {
                    setExcludePatterns(excludePatterns.filter((_, i) => i !== index))
                }}
            />

            {status && (<div className="alert alert-info" role="alert">{status}</div>)}

            <ExcludeInput
                onAdd={(pattern) => {
                    const trimmed = pattern.trim()
                    if (trimmed && !excludePatterns.includes(trimmed)) {
                        setExcludePatterns([...excludePatterns, trimmed])
                    }
                }}
            />

            <ZipPreviewTree
                root={directoryHandle}
                matchers={matchers}
                onExcludePathsChange={(paths: string[], totalSize?: number) => {
                    setUnselectedPaths(paths)
                    if (typeof totalSize === 'number') setRawSize(totalSize)
                }}
            />
        </div>
    )
}

export default ZipDrop
