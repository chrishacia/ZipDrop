import { useState, useMemo, useCallback, useEffect, type FC } from 'react'
import { Minimatch } from 'minimatch'
import { usePersistedPatterns } from '../hooks/usePersistedPatterns'
import { useZipStats } from '../hooks/useZipStats'
import { useGlobalStats } from '../hooks/useGlobalStats'
import { useToast } from '../components/ToastProvider'
import ExcludeInput from '../components/ExcludeInput'
import ExcludeTagList from '../components/ExcludeTagList'
import ZipPreviewTree from '../components/ZipPreviewTree'
import StatsCard from '../components/StatsCard'
import GlobalStatsCard from '../components/GlobalStatsCard'
import DropZone from '../components/DropZone'
import PatternPresets from '../components/PatternPresets'
import { computeMD5FromBlob } from '../utils/md5'
import type JSZipType from 'jszip'

const formatSize = (bytes: number): string => {
    const units = ['B', 'KB', 'MB', 'GB']
    if (bytes === 0) return '0 B'
    const i = Math.floor(Math.log(bytes) / Math.log(1024))
    return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${units[i]}`
}

const generateMetadataContent = (params: {
    folderName: string
    zipFileName: string
    filesCount: number
    rawSize: number
    zippedSize: number
    md5Hash: string
    createdAt: Date
}): string => {
    const { folderName, zipFileName, filesCount, rawSize, zippedSize, md5Hash, createdAt } = params
    const compressionRatio = rawSize > 0 ? (((rawSize - zippedSize) / rawSize) * 100).toFixed(1) : '0'
    
    return `================================================================================
                              ZIPDROP ARCHIVE MANIFEST
================================================================================

This ZIP archive was created with ZipDrop
https://github.com/chrishacia/ZipDrop

================================================================================
                                ARCHIVE DETAILS
================================================================================

Archive Name:        ${zipFileName}
Source Folder:       ${folderName}
Created:             ${createdAt.toISOString()}
                     ${createdAt.toLocaleString()}

================================================================================
                                  METRICS
================================================================================

Files Included:      ${filesCount.toLocaleString()}
Original Size:       ${formatSize(rawSize)} (${rawSize.toLocaleString()} bytes)
Compressed Size:     ${formatSize(zippedSize)} (${zippedSize.toLocaleString()} bytes)
Space Saved:         ${formatSize(rawSize - zippedSize)} (${compressionRatio}%)

================================================================================
                                INTEGRITY
================================================================================

MD5 Hash:            ${md5Hash}

Note: This hash is calculated from the ZIP content BEFORE this manifest file
was added. Use it to verify the integrity of your archived files.

================================================================================
                                  CREDITS
================================================================================

ZipDrop - A privacy-first browser-based ZIP creator
• GitHub:  https://github.com/chrishacia/ZipDrop
• Author:  https://chrishacia.com

All processing happens locally in your browser.
No files are ever uploaded to any server.

================================================================================
`
}

const ZipDrop: FC = () => {
    const [directoryHandle, setDirectoryHandle] = useState<FileSystemDirectoryHandle | null>(null)
    const [unselectedPaths, setUnselectedPaths] = useState<string[]>([])
    const [rawSize, setRawSize] = useState<number>(0)
    const [fileCount, setFileCount] = useState<number>(0)
    const [isZipping, setIsZipping] = useState(false)
    const [progress, setProgress] = useState<{ current: number; total: number } | null>(null)
    const [zipFileName, setZipFileName] = useState<string>('')

    const { patterns: excludePatterns, setPatterns: setExcludePatterns } = usePersistedPatterns()
    const { stats, history, recordZipCreation, clearStats, getTotalSaved, getAverageCompressionRatio } = useZipStats()
    const { 
        stats: globalStats, 
        todayStats: globalTodayStats, 
        periodStats: globalPeriodStats,
        isLoading: globalStatsLoading,
        isEnabled: globalStatsEnabled,
        recordEvent: recordGlobalEvent,
        loadPeriodStats: loadGlobalPeriodStats,
    } = useGlobalStats()
    const { showToast } = useToast()

    // Update zip filename when folder changes
    useEffect(() => {
        if (directoryHandle) {
            setZipFileName(directoryHandle.name)
        } else {
            setZipFileName('')
        }
    }, [directoryHandle])

    const matchers = useMemo(() => {
        return excludePatterns.map(p => {
            const normalized = p.startsWith('**/') || p.includes('/') ? p : `**/${p}`
            return new Minimatch(normalized, { dot: true })
        })
    }, [excludePatterns])

    const isExcludedByPattern = useCallback((path: string) => matchers.some(m => m.match(path)), [matchers])
    const isUncheckedManually = useCallback((path: string) => unselectedPaths.includes(path), [unselectedPaths])

    const handleFolderSelected = useCallback((handle: FileSystemDirectoryHandle) => {
        setDirectoryHandle(handle)
        setUnselectedPaths([])
        showToast(`Folder "${handle.name}" selected`, 'success')
    }, [showToast])

    const selectFolder = async () => {
        try {
            const handle = await (window as unknown as { showDirectoryPicker: () => Promise<FileSystemDirectoryHandle> }).showDirectoryPicker()
            handleFolderSelected(handle)
        } catch {
            showToast('Folder selection was cancelled', 'warning')
        }
    }

    const resetViewState = () => {
        setDirectoryHandle(null)
        setUnselectedPaths([])
        setRawSize(0)
        setFileCount(0)
        setProgress(null)
        setZipFileName('')
        showToast('View reset', 'info')
    }

    const createZip = async () => {
        if (!directoryHandle) {
            showToast('Please select a folder first', 'warning')
            return
        }

        const finalFileName = zipFileName.trim() || directoryHandle.name
        const JSZip = (await import('jszip')).default
        const zip = new JSZip()
        let filesAdded = 0
        let totalSizeAdded = 0

        const countFiles = async (dir: FileSystemDirectoryHandle, relPath = ''): Promise<number> => {
            let count = 0
            for await (const [, entry] of (dir as unknown as AsyncIterable<[string, FileSystemHandle]>)) {
                const path = relPath ? `${relPath}/${entry.name}` : entry.name
                if (isExcludedByPattern(path) || isUncheckedManually(path)) continue
                if (entry.kind === 'directory') {
                    const subHandle = await dir.getDirectoryHandle(entry.name)
                    count += await countFiles(subHandle, path)
                } else {
                    count++
                }
            }
            return count
        }

        const traverse = async (
            dir: FileSystemDirectoryHandle,
            zipFolder: JSZipType,
            relPath = ''
        ) => {
            for await (const [, entry] of (dir as unknown as AsyncIterable<[string, FileSystemHandle]>)) {
                const path = relPath ? `${relPath}/${entry.name}` : entry.name
                if (isExcludedByPattern(path) || isUncheckedManually(path)) continue

                if (entry.kind === 'directory') {
                    const subDir = zipFolder.folder(entry.name)
                    if (subDir) {
                        const subHandle = await dir.getDirectoryHandle(entry.name)
                        await traverse(subHandle, subDir, path)
                    }
                } else if (entry.kind === 'file') {
                    const file = await (await dir.getFileHandle(entry.name)).getFile()
                    const buffer = await file.arrayBuffer()
                    zip.file(path, buffer)
                    filesAdded++
                    totalSizeAdded += file.size
                    setProgress(prev => prev ? { ...prev, current: filesAdded } : null)
                }
            }
        }

        try {
            setIsZipping(true)
            showToast('Counting files...', 'info')
            
            const totalFiles = await countFiles(directoryHandle)
            setProgress({ current: 0, total: totalFiles })
            
            showToast(`Zipping ${totalFiles} files...`, 'info')
            await traverse(directoryHandle, zip)
            
            showToast('Compressing...', 'info')
            
            // Generate initial ZIP to compute hash
            const contentBlob = await zip.generateAsync({ 
                type: 'blob', 
                compression: 'DEFLATE', 
                compressionOptions: { level: 9 }
            })
            
            showToast('Computing integrity hash...', 'info')
            const md5Hash = await computeMD5FromBlob(contentBlob)
            
            // Generate metadata content
            const createdAt = new Date()
            const metadataContent = generateMetadataContent({
                folderName: directoryHandle.name,
                zipFileName: `${finalFileName}.zip`,
                filesCount: filesAdded,
                rawSize: totalSizeAdded,
                zippedSize: contentBlob.size,
                md5Hash,
                createdAt
            })
            
            // Add metadata file to zip
            zip.file('_ZIPDROP_MANIFEST.txt', metadataContent)
            
            // Generate final ZIP with manifest
            showToast('Finalizing archive...', 'info')
            const finalBlob = await zip.generateAsync({ 
                type: 'blob', 
                compression: 'DEFLATE', 
                compressionOptions: { level: 9 }
            })
            
            const url = URL.createObjectURL(finalBlob)
            const link = document.createElement('a')
            link.href = url
            link.download = `${finalFileName}.zip`
            link.click()
            URL.revokeObjectURL(url)
            
            // Record local stats (use content blob size for accurate comparison)
            recordZipCreation({
                folderName: directoryHandle.name,
                filesCount: filesAdded,
                rawSizeBytes: totalSizeAdded,
                zippedSizeBytes: contentBlob.size,
            })
            
            // Record global stats (fire and forget)
            recordGlobalEvent({
                filesCount: filesAdded,
                rawSizeBytes: totalSizeAdded,
                zippedSizeBytes: contentBlob.size,
            })
            
            const savedPercent = totalSizeAdded > 0 
                ? (((totalSizeAdded - contentBlob.size) / totalSizeAdded) * 100).toFixed(0) 
                : '0'
            
            showToast(
                `ZIP created! ${formatSize(finalBlob.size)} (${savedPercent}% smaller)`,
                'success',
                6000
            )
        } catch (err) {
            console.error(err)
            showToast('Error creating ZIP file', 'error')
        } finally {
            setIsZipping(false)
            setProgress(null)
        }
    }

    const handleExcludePathsChange = useCallback((paths: string[], totalSize?: number, totalFiles?: number) => {
        setUnselectedPaths(paths)
        if (typeof totalSize === 'number') setRawSize(totalSize)
        if (typeof totalFiles === 'number') setFileCount(totalFiles)
    }, [])

    const handleAddPattern = useCallback((pattern: string) => {
        const trimmed = pattern.trim()
        if (trimmed && !excludePatterns.includes(trimmed)) {
            setExcludePatterns([...excludePatterns, trimmed])
            showToast(`Pattern "${trimmed}" added`, 'success')
        }
    }, [excludePatterns, setExcludePatterns, showToast])

    const handleRemovePattern = useCallback((index: number) => {
        const removed = excludePatterns[index]
        setExcludePatterns(excludePatterns.filter((_, i) => i !== index))
        showToast(`Pattern "${removed}" removed`, 'info')
    }, [excludePatterns, setExcludePatterns, showToast])

    const handleClearAllPatterns = useCallback(() => {
        setExcludePatterns([])
        showToast('All patterns cleared', 'info')
    }, [setExcludePatterns, showToast])

    const handleApplyPresetPatterns = useCallback((patterns: string[]) => {
        const next = new Set(excludePatterns)
        let added = 0
        for (const p of patterns) {
            if (!next.has(p)) {
                next.add(p)
                added++
            }
        }
        setExcludePatterns([...next])
        showToast(`${added} pattern${added !== 1 ? 's' : ''} added`, 'success')
    }, [excludePatterns, setExcludePatterns, showToast])

    // Calculate estimated zip size (rough estimation)
    const estimatedZipSize = rawSize * 0.7 // Assume ~30% compression

    const hasFolder = directoryHandle !== null
    const hasFiles = fileCount > 0
    const canCreateZip = hasFolder && hasFiles && !isZipping

    return (
        <main className="container py-4">
            {/* Header */}
            <header className="text-center mb-5">
                <h1 className="display-4 fw-bold mb-2">
                    <i className="bi bi-archive me-2" aria-hidden="true"></i>
                    ZipDrop
                </h1>
                <p className="lead text-muted mb-0">
                    Create ZIP archives from folders with customizable exclusion patterns
                </p>
            </header>

            {/* Global Community Stats */}
            <GlobalStatsCard
                stats={globalStats}
                todayStats={globalTodayStats}
                periodStats={globalPeriodStats}
                isLoading={globalStatsLoading}
                isEnabled={globalStatsEnabled}
                onLoadPeriod={loadGlobalPeriodStats}
            />

            {/* Personal Stats Card */}
            <StatsCard
                stats={stats}
                history={history}
                onClearStats={clearStats}
                getTotalSaved={getTotalSaved}
                getAverageCompressionRatio={getAverageCompressionRatio}
            />

            {/* Drop Zone for folder selection */}
            <div className="mb-4">
                <DropZone
                    onFolderSelected={handleFolderSelected}
                    onSelectClick={selectFolder}
                    isDisabled={isZipping}
                    hasFolder={hasFolder}
                    folderName={directoryHandle?.name}
                />
            </div>

            {/* Main Actions Card */}
            <div className="card bg-dark border-secondary mb-4">
                <div className="card-header py-3">
                    <h2 className="h5 mb-0">
                        <i className="bi bi-sliders me-2" aria-hidden="true"></i>
                        ZIP Options
                    </h2>
                </div>
                <div className="card-body">
                    {/* ZIP Filename Input */}
                    {hasFolder && (
                        <div className="mb-4">
                            <label htmlFor="zip-filename" className="form-label">
                                <i className="bi bi-pencil-square me-1" aria-hidden="true"></i>
                                Output Filename
                            </label>
                            <div className="input-group">
                                <input
                                    type="text"
                                    id="zip-filename"
                                    className="form-control bg-dark border-secondary text-white"
                                    value={zipFileName}
                                    onChange={(e) => setZipFileName(e.target.value)}
                                    placeholder="Enter filename"
                                    disabled={isZipping}
                                    aria-describedby="zip-filename-hint"
                                />
                                <span className="input-group-text bg-dark border-secondary text-muted">.zip</span>
                            </div>
                            <small id="zip-filename-hint" className="text-muted">
                                Customize the output ZIP filename (without extension)
                            </small>
                        </div>
                    )}

                    <div className="d-flex flex-wrap align-items-center gap-2 mb-4">
                        <button 
                            type="button"
                            className="btn btn-success"
                            onClick={createZip}
                            disabled={!canCreateZip}
                            aria-label={!hasFolder ? 'Select a folder first' : !hasFiles ? 'No files to zip' : 'Create ZIP archive'}
                            aria-busy={isZipping}
                        >
                            {isZipping ? (
                                <>
                                    <span className="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true" />
                                    {progress ? `${progress.current}/${progress.total}` : 'Processing...'}
                                </>
                            ) : (
                                <>
                                    <i className="bi bi-download me-1" aria-hidden="true"></i>
                                    Create ZIP
                                </>
                            )}
                        </button>
                        
                        <button 
                            type="button"
                            className="btn btn-outline-secondary"
                            onClick={resetViewState}
                            disabled={!hasFolder || isZipping}
                            aria-label="Reset and clear selection"
                        >
                            <i className="bi bi-arrow-counterclockwise me-1" aria-hidden="true"></i>
                            Reset
                        </button>
                        
                        <PatternPresets
                            onApplyPreset={handleApplyPresetPatterns}
                            existingPatterns={excludePatterns}
                            disabled={isZipping}
                        />

                        <a 
                            href="https://github.com/chrishacia/ZipDrop" 
                            target="_blank"
                            rel="noopener noreferrer"
                            className="btn btn-outline-light ms-auto"
                            aria-label="View ZipDrop source code on GitHub (opens in new tab)"
                        >
                            <i className="bi bi-github me-1" aria-hidden="true"></i>
                            GitHub
                        </a>
                    </div>

                    {/* Selected Folder Info */}
                    {hasFolder && (
                        <div 
                            className="alert alert-dark border-secondary mb-0" 
                            role="status"
                            aria-live="polite"
                        >
                            <div className="row g-3 align-items-center">
                                <div className="col-12 col-md-4">
                                    <div className="d-flex align-items-center gap-2">
                                        <i className="bi bi-folder-fill fs-4 text-warning" aria-hidden="true"></i>
                                        <div>
                                            <small className="text-muted d-block">Selected Folder</small>
                                            <strong className="text-truncate d-block" style={{ maxWidth: '200px' }}>
                                                {directoryHandle.name}
                                            </strong>
                                        </div>
                                    </div>
                                </div>
                                <div className="col-6 col-md-2">
                                    <small className="text-muted d-block">Files</small>
                                    <strong className="text-success">{fileCount.toLocaleString()}</strong>
                                </div>
                                <div className="col-6 col-md-2">
                                    <small className="text-muted d-block">Raw Size</small>
                                    <strong className="text-info">{formatSize(rawSize)}</strong>
                                </div>
                                <div className="col-6 col-md-2">
                                    <small className="text-muted d-block">Est. ZIP Size</small>
                                    <strong className="text-warning">{formatSize(estimatedZipSize)}</strong>
                                </div>
                                <div className="col-6 col-md-2">
                                    <small className="text-muted d-block">Est. Savings</small>
                                    <strong className="text-success">
                                        ~{rawSize > 0 ? '30' : '0'}%
                                    </strong>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Progress Bar */}
                    {isZipping && progress && (
                        <div className="mt-3" role="status" aria-live="polite">
                            <div className="d-flex justify-content-between mb-1">
                                <small>Processing files...</small>
                                <small>{progress.current} / {progress.total}</small>
                            </div>
                            <div className="progress" style={{ height: '8px' }}>
                                <div 
                                    className="progress-bar progress-bar-striped progress-bar-animated bg-success"
                                    role="progressbar"
                                    style={{ width: `${(progress.current / progress.total) * 100}%` }}
                                    aria-valuenow={progress.current}
                                    aria-valuemin={0}
                                    aria-valuemax={progress.total}
                                    aria-label={`Progress: ${progress.current} of ${progress.total} files`}
                                />
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* Exclusion Patterns */}
            <ExcludeInput onAdd={handleAddPattern} disabled={isZipping} />
            
            <ExcludeTagList
                patterns={excludePatterns}
                onRemove={handleRemovePattern}
                onClearAll={excludePatterns.length > 1 ? handleClearAllPatterns : undefined}
            />

            {/* File Tree Preview */}
            <ZipPreviewTree
                root={directoryHandle}
                matchers={matchers}
                onExcludePathsChange={handleExcludePathsChange}
            />

            {/* Footer */}
            <footer className="text-center mt-5 pt-4 border-top border-secondary">
                <p className="text-muted small mb-2">
                    <i className="bi bi-shield-lock me-1" aria-hidden="true"></i>
                    ZipDrop runs entirely in your browser. No files are uploaded to any server.
                </p>
                <p className="text-muted small mb-0">
                    <a 
                        href="https://github.com/chrishacia/ZipDrop" 
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-decoration-none"
                    >
                        <i className="bi bi-github me-1" aria-hidden="true"></i>
                        View source on GitHub
                    </a>
                </p>
            </footer>
        </main>
    )
}

export default ZipDrop
