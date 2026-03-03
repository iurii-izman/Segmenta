import { useCallback, useEffect, useRef, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { useJobStore } from '../stores/jobStore';
import type { JobSummary, JobDetail } from '../types';
import ProgressPanel from './ProgressPanel';
import ResultViewer from './ResultViewer';
import { useInvokeWithToast } from '../hooks/useInvokeWithToast';
import {
    Trash2,
    FolderOpen,
    XCircle,
    Loader2,
    Eye,
    RotateCw,
    ChevronDown,
    ChevronRight,
    Trash,
    Download,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';

export default function QueueTab() {
    const { state, dispatch } = useJobStore();
    const { t, i18n } = useTranslation();

    const [viewerJob, setViewerJob] = useState<JobDetail | null>(null);
    const [toasts, setToasts] = useState<Array<{ id: string; type: 'success' | 'error'; message: string }>>([]);
    const [expandedErrorId, setExpandedErrorId] = useState<string | null>(null);
    const [errorDetailsCache, setErrorDetailsCache] = useState<Record<string, JobDetail>>({});

    const addToast = useCallback((toast: { id: string; type: 'success' | 'error'; message: string }) => {
        setToasts(prev => [...prev, toast]);
    }, []);
    const { invokeSafe } = useInvokeWithToast(addToast);

    // Track previous job statuses to detect transitions
    const prevStatuses = useRef<Record<string, string>>({});

    // Adaptive polling: 3s when there are running/pending jobs, 15s when idle (list still updated by job:done/job:error/job:started)
    const QUEUE_DISPLAY_LIMIT = 50;
    const hasActiveJobs = state.jobs.some(j => j.status === 'running' || j.status === 'pending');
    const pollIntervalMs = hasActiveJobs ? 3000 : 15000;
    const [showAllJobs, setShowAllJobs] = useState(false);
    const jobsToShow = state.jobs.length > QUEUE_DISPLAY_LIMIT && !showAllJobs
        ? state.jobs.slice(0, QUEUE_DISPLAY_LIMIT)
        : state.jobs;
    useEffect(() => {
        const fetchJobs = async () => {
            try {
                const jobs = await invoke('list_jobs') as JobSummary[];
                dispatch({ type: 'SET_JOBS', jobs });
            } catch { }
        };
        fetchJobs();
        const interval = setInterval(fetchJobs, pollIntervalMs);
        return () => clearInterval(interval);
    }, [dispatch, pollIntervalMs]);

    // Toast notifications on job status transitions
    useEffect(() => {
        state.jobs.forEach(j => {
            const prev = prevStatuses.current[j.id];
            if (prev === 'running' && j.status === 'done') {
                const name = j.output_base || j.input_path.split('/').pop() || t('queue.fileNameFallback');
                setToasts(prevToasts => [...prevToasts, { id: j.id + Date.now(), type: 'success', message: `✅ ${t('queue.toastDone', { name })}` }]);
            }
            if (prev === 'running' && j.status === 'error') {
                const msg = j.error_message?.slice(0, 60) || '';
                setToasts(prevToasts => [...prevToasts, { id: j.id + Date.now(), type: 'error', message: `❌ ${t('queue.toastError', { message: msg })}` }]);
            }
            prevStatuses.current[j.id] = j.status as string;
        });
    }, [state.jobs, t]);

    // Auto-dismiss oldest toast after 4s
    useEffect(() => {
        if (toasts.length === 0) return;
        const t = setTimeout(() => setToasts(p => p.slice(1)), 4000);
        return () => clearTimeout(t);
    }, [toasts]);

    const cancelJob = useCallback(async (jobId: string) => {
        const _ = await invokeSafe('cancel_job', { jobId });
        if (_ !== null) {
            const jobs = await invoke('list_jobs') as JobSummary[];
            dispatch({ type: 'SET_JOBS', jobs });
        }
    }, [dispatch, invokeSafe]);

    const removeJob = useCallback(async (jobId: string) => {
        const _ = await invokeSafe('remove_job', { jobId });
        if (_ !== null) {
            const jobs = await invoke('list_jobs') as JobSummary[];
            dispatch({ type: 'SET_JOBS', jobs });
        }
    }, [dispatch, invokeSafe]);

    const openFolder = useCallback(async (job: JobSummary) => {
        const dir = job.output_dir || job.input_path.split('/').slice(0, -1).join('/');
        await invokeSafe('open_folder', { path: dir });
    }, [invokeSafe]);

    const openViewer = useCallback(async (jobId: string) => {
        const detail = await invokeSafe<JobDetail>('get_job', { jobId });
        if (detail) setViewerJob(detail);
    }, [invokeSafe]);

    const retryJob = useCallback(async (jobId: string) => {
        const _ = await invokeSafe('retry_job', { jobId });
        if (_ !== null) {
            const jobs = await invoke('list_jobs') as JobSummary[];
            dispatch({ type: 'SET_JOBS', jobs });
        }
    }, [dispatch, invokeSafe]);

    const toggleErrorDetails = useCallback(async (jobId: string) => {
        setExpandedErrorId(prev => prev === jobId ? null : jobId);
        if (!errorDetailsCache[jobId]) {
            try {
                const detail = await invoke('get_job', { jobId }) as JobDetail;
                setErrorDetailsCache(c => ({ ...c, [jobId]: detail }));
            } catch {
                // ignore
            }
        }
    }, [errorDetailsCache]);

    const completedCount = state.jobs.filter(j => ['done', 'error', 'canceled'].includes(j.status)).length;
    const clearCompleted = useCallback(async () => {
        if (completedCount === 0) return;
        if (!window.confirm(t('queue.clearCompletedConfirm'))) return;
        const n = await invokeSafe<number>('clear_completed_jobs');
        if (n != null && n > 0) {
            const jobs = await invoke('list_jobs') as JobSummary[];
            dispatch({ type: 'SET_JOBS', jobs });
        }
    }, [completedCount, invokeSafe, dispatch, t]);

    const exportList = useCallback(() => {
        const data = JSON.stringify(state.jobs, null, 2);
        const blob = new Blob([data], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${t('queue.exportListFilename')}-${new Date().toISOString().slice(0, 10)}.json`;
        a.click();
        URL.revokeObjectURL(url);
    }, [state.jobs, t]);



    const getStatusLabel = (status: string) => {
        switch (status) {
            case 'pending': return t('queue.status.pending');
            case 'running': return t('queue.status.running');
            case 'done': return t('queue.status.done');
            case 'error': return t('queue.status.error');
            case 'canceled': return t('queue.status.canceled');
            default: return status;
        }
    };

    const runningJob = state.jobs.find(j => j.status === 'running');
    const showProgressPanel = runningJob && runningJob.id === state.currentJobId;

    return (
        <div className="fade-in">
            {/* Inline progress panel for active job */}
            {showProgressPanel && (
                <div className="queue-progress-panel">
                    <div className="queue-running-badge">
                        <Loader2 size={12} className="spinning" />
                        {t('queue.nowRunning')}
                    </div>
                    <ProgressPanel />
                </div>
            )}

            {/* Jobs list */}
            {state.jobs.length === 0 ? (
                <div className="empty-state">
                    <div className="empty-state-icon">📋</div>
                    <div className="empty-state-title">{t('queue.empty')}</div>
                    <div className="empty-state-desc">
                        {t('queue.emptyDesc')}
                    </div>
                </div>
            ) : (
                <div className="queue-list">
                    <div className="queue-list-toolbar">
                        {completedCount > 0 && (
                            <button type="button" className="btn btn-sm btn-secondary" onClick={clearCompleted} title={t('queue.clearCompleted')}>
                                <Trash size={14} />
                                {t('queue.clearCompleted')}
                            </button>
                        )}
                        <button type="button" className="btn btn-sm btn-secondary" onClick={exportList} title={t('queue.exportList')}>
                            <Download size={14} />
                            {t('queue.exportList')}
                        </button>
                    </div>
                    {state.jobs.length > QUEUE_DISPLAY_LIMIT && !showAllJobs && (
                        <div className="queue-list-header">
                            <span className="queue-list-count">
                                {t('queue.showingFirst', { count: QUEUE_DISPLAY_LIMIT, total: state.jobs.length })}
                            </span>
                            <button type="button" className="btn btn-sm btn-secondary" onClick={() => setShowAllJobs(true)}>
                                {t('queue.showAll')}
                            </button>
                        </div>
                    )}
                    {jobsToShow.map((job, index) => (
                        <div
                            key={job.id}
                            className="queue-item slide-in"
                            style={{ animationDelay: `${index * 50}ms` }}
                        >
                            {/* Status Badge */}
                            <div className={`status-badge ${job.status}`}>
                                <span className="status-dot" />
                                {getStatusLabel(job.status)}
                            </div>

                            {/* Info */}
                            <div className="queue-item-info">
                                <div className="queue-item-name" title={job.input_path}>
                                    {job.output_base || job.input_path.split('/').pop()}
                                </div>
                                <div className="queue-item-meta">
                                    <span>🏷️ {job.model}</span>
                                    <span>📅 {new Date(job.created_at).toLocaleString(i18n.language === 'ru' ? 'ru-RU' : 'en-US')}</span>
                                    {job.error_message && (
                                        <span style={{ color: 'var(--error)' }}>
                                            ⚠️ {job.error_message.slice(0, 80)}
                                        </span>
                                    )}
                                </div>
                            </div>

                            {/* Expandable error details (stderr) for failed jobs */}
                            {job.status === 'error' && (
                                <div className="queue-item-error-details">
                                    <button
                                        type="button"
                                        className="queue-error-details-toggle"
                                        onClick={() => toggleErrorDetails(job.id)}
                                        aria-expanded={expandedErrorId === job.id}
                                    >
                                        {expandedErrorId === job.id ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                                        {t('queue.errorDetails')}
                                    </button>
                                    {expandedErrorId === job.id && (() => {
                                        const detail = errorDetailsCache[job.id];
                                        if (!detail) return <div className="queue-error-details-loading">…</div>;
                                        const stderr = detail.stderr_tail?.length ? detail.stderr_tail.join('\n') : '';
                                        return (
                                            <div className="queue-error-details-body">
                                                {detail.error_message && (
                                                    <p className="queue-error-details-message">{detail.error_message}</p>
                                                )}
                                                {stderr && (
                                                    <>
                                                        <div className="queue-error-details-label">{t('queue.stderr')}</div>
                                                        <pre className="queue-error-details-pre">{stderr}</pre>
                                                    </>
                                                )}
                                            </div>
                                        );
                                    })()}
                                </div>
                            )}

                            {/* Mini progress bar */}
                            {(job.status === 'running' || job.status === 'done') && (
                                <div className="queue-item-progress">
                                    <div className="queue-mini-bar">
                                        <div
                                            className="queue-mini-fill"
                                            style={{
                                                width: `${Math.min(job.progress_pct, 100)}%`,
                                                background: job.status === 'done' ? 'var(--success)' : undefined,
                                            }}
                                        />
                                    </div>
                                    <span style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>
                                        {job.progress_pct.toFixed(0)}%
                                    </span>
                                </div>
                            )}

                            {/* Actions */}
                            <div className="queue-item-actions">
                                {job.status === 'running' && (
                                    <button className="btn btn-sm btn-icon btn-danger" onClick={() => cancelJob(job.id)} title={t('queue.cancel')}>
                                        <XCircle size={14} />
                                    </button>
                                )}
                                {job.status === 'done' && (
                                    <button className="btn btn-sm btn-icon btn-secondary" onClick={() => openFolder(job)} title={t('queue.openFolder')}>
                                        <FolderOpen size={14} />
                                    </button>
                                )}
                                {job.status === 'done' && (
                                    <button className="btn btn-sm btn-icon btn-secondary" onClick={() => openViewer(job.id)} title={t('queue.view')}>
                                        <Eye size={14} />
                                    </button>
                                )}
                                {(job.status === 'error' || job.status === 'canceled') && (
                                    <button className="btn btn-sm btn-icon btn-secondary" onClick={() => retryJob(job.id)} title={t('queue.retry')}>
                                        <RotateCw size={14} />
                                    </button>
                                )}
                                {(job.status === 'done' || job.status === 'error' || job.status === 'canceled') && (
                                    <button className="btn btn-sm btn-icon btn-secondary" onClick={() => removeJob(job.id)} title={t('queue.remove')}>
                                        <Trash2 size={14} />
                                    </button>
                                )}
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* Result Viewer Modal */}
            {viewerJob && (
                <ResultViewer job={viewerJob} onClose={() => setViewerJob(null)} />
            )}

            {/* Toast notifications */}
            <div className="toast-container">
                {toasts.map(toast => (
                    <div key={toast.id} className={`toast ${toast.type}`}>{toast.message}</div>
                ))}
            </div>
        </div>
    );
}
