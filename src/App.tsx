import { useCallback, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { useJobStore } from './stores/jobStore';
import { useJobEvents } from './hooks/useJobEvents';
import NewTaskTab from './components/NewTaskTab';
import QueueTab from './components/QueueTab';
import SettingsTab from './components/SettingsTab';
import { useTranslation } from 'react-i18next';
import type { ProgressEvent, StatsEvent, DoneEvent, ErrorEvent, StatusEvent, WarningEvent } from './types';
import { Mic, ListTodo, Settings, Waves } from 'lucide-react';
import { APP_VERSION } from './version';

export default function App() {
    const { state, dispatch } = useJobStore();
    const { t } = useTranslation();

    // ── Global Mount Hooks ──────────────────────────────────────────────────
    useEffect(() => {
        // Sync the stored container configs with the Rust backend
        invoke('update_settings', {
            containerName: state.settings.container_name,
            venvPath: state.settings.venv_path,
        }).catch(err => console.error("Failed to sync startup settings:", err));
    }, [state.settings.container_name, state.settings.venv_path]);

    // ── Event Handlers ──────────────────────────────────────────────────────

    const refreshJobs = useCallback(async () => {
        try {
            const jobs = await invoke('list_jobs') as any[];
            dispatch({ type: 'SET_JOBS', jobs });
        } catch { }
    }, [dispatch]);

    useJobEvents({
        onStarted: useCallback((e: { job_id: string; pid: number }) => {
            dispatch({ type: 'SET_CURRENT_JOB', id: e.job_id });
            dispatch({
                type: 'ADD_LOG',
                entry: { timestamp: Date.now(), type: 'status', message: `Job started (PID: ${e.pid})` },
            });
            refreshJobs();
        }, [dispatch, refreshJobs]),

        onProgress: useCallback((e: ProgressEvent) => {
            if (e.job_id !== state.currentJobId) return;
            dispatch({
                type: 'SET_PROGRESS',
                data: {
                    pct: e.pct,
                    audio_done_sec: e.audio_done_sec,
                    audio_total_sec: e.audio_total_sec,
                    eta_sec: e.eta_sec,
                    rtf: e.rtf,
                    elapsed_sec: e.elapsed_sec,
                    segments_done: e.segments_done,
                    segment_preview: e.segment_preview,
                },
            });
            dispatch({ type: 'UPDATE_JOB_STATUS', id: e.job_id, status: 'running', progress_pct: e.pct });
            if (e.segment_preview) {
                dispatch({
                    type: 'ADD_LOG',
                    entry: {
                        timestamp: Date.now(),
                        type: 'progress',
                        message: `${e.pct.toFixed(1)}% — «${e.segment_preview.slice(0, 60)}${e.segment_preview.length > 60 ? '…' : ''}»`,
                    },
                });
            }
        }, [dispatch, state.currentJobId]),

        onStats: useCallback((e: StatsEvent) => {
            if (e.job_id !== state.currentJobId) return;
            dispatch({
                type: 'SET_STATS',
                data: {
                    cpu_system: e.cpu_system,
                    ram_system_pct: e.ram_system_pct,
                    ram_system_used_mb: e.ram_system_used_mb,
                    ram_system_total_mb: e.ram_system_total_mb,
                    cpu_proc: e.cpu_proc,
                    ram_proc_mb: e.ram_proc_mb,
                },
            });
            dispatch({
                type: 'ADD_CHART_POINT',
                point: {
                    time: Date.now(),
                    cpuSystem: Math.round(e.cpu_system * 10) / 10,
                    ramSystemPct: Math.round(e.ram_system_pct * 10) / 10,
                    cpuProc: Math.round(e.cpu_proc * 10) / 10,
                    ramProcMb: e.ram_proc_mb,
                },
            });
        }, [dispatch, state.currentJobId]),

        onDone: useCallback((e: DoneEvent) => {
            dispatch({
                type: 'ADD_LOG',
                entry: {
                    timestamp: Date.now(),
                    type: 'done',
                    message: `Done! ${e.outputs.length} files, ${e.stats.segments} segments, RTF=${e.stats.rtf.toFixed(2)}`,
                },
            });
            dispatch({ type: 'UPDATE_JOB_STATUS', id: e.job_id, status: 'done', progress_pct: 100 });
            refreshJobs();
        }, [dispatch, refreshJobs]),

        onError: useCallback((e: ErrorEvent) => {
            dispatch({
                type: 'ADD_LOG',
                entry: { timestamp: Date.now(), type: 'error', message: e.message },
            });
            dispatch({
                type: 'UPDATE_JOB_STATUS',
                id: e.job_id,
                status: 'error',
                error_message: `${e.message}${e.details ? ': ' + e.details : ''}`,
            });
            refreshJobs();
        }, [dispatch, refreshJobs]),

        onStatus: useCallback((e: StatusEvent) => {
            dispatch({ type: 'SET_STATUS_MESSAGE', message: e.message });
            dispatch({
                type: 'ADD_LOG',
                entry: { timestamp: Date.now(), type: 'status', message: e.message },
            });
        }, [dispatch]),

        onWarning: useCallback((e: WarningEvent) => {
            if (e.job_id !== state.currentJobId) return;
            dispatch({
                type: 'ADD_LOG',
                entry: { timestamp: Date.now(), type: 'warning', message: `⚠️ ${e.message}` },
            });
        }, [dispatch, state.currentJobId]),
    });

    // ── Render ──────────────────────────────────────────────────────────────

    const runningCount = state.jobs.filter((j) => j.status === 'running' || j.status === 'pending').length;

    return (
        <div className="app">
            {/* Header */}
            <header className="app-header">
                <div className="app-logo">
                    <div className="app-logo-icon">
                        <Waves size={16} color="#fff" />
                    </div>
                    <h1>Transkribator</h1>
                    <span className="app-version">v{APP_VERSION}</span>
                </div>
                {state.statusMessage && (
                    <span style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>
                        {state.statusMessage}
                    </span>
                )}
            </header>

            {/* Tab bar */}
            <nav className="tab-bar">
                <button
                    className={`tab-btn ${state.activeTab === 'new' ? 'active' : ''}`}
                    onClick={() => dispatch({ type: 'SET_TAB', tab: 'new' })}
                >
                    <Mic size={15} />
                    {t('tabs.newTask')}
                </button>
                <button
                    className={`tab-btn ${state.activeTab === 'queue' ? 'active' : ''}`}
                    onClick={() => dispatch({ type: 'SET_TAB', tab: 'queue' })}
                >
                    <ListTodo size={15} />
                    {t('tabs.queue')}
                    {runningCount > 0 && <span className="tab-badge">{runningCount}</span>}
                </button>
                <button
                    className={`tab-btn ${state.activeTab === 'settings' ? 'active' : ''}`}
                    onClick={() => dispatch({ type: 'SET_TAB', tab: 'settings' })}
                >
                    <Settings size={15} />
                    {t('tabs.settings')}
                </button>
            </nav>

            {/* Content */}
            <div className="tab-content">
                {state.activeTab === 'new' && <NewTaskTab />}
                {state.activeTab === 'queue' && <QueueTab />}
                {state.activeTab === 'settings' && <SettingsTab />}
            </div>
        </div>
    );
}
