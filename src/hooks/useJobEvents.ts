import { useEffect, useRef, useCallback } from 'react';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import type {
    ProgressEvent,
    StatsEvent,
    DoneEvent,
    ErrorEvent,
    StatusEvent,
    WarningEvent,
    ChartDataPoint,
    LogEntry,
} from '../types';

const MAX_LOG_ENTRIES = 200;
const MAX_CHART_POINTS = 120; // 2 minutes of data

interface UseJobEventsCallbacks {
    onProgress: (event: ProgressEvent) => void;
    onStats: (event: StatsEvent) => void;
    onDone: (event: DoneEvent) => void;
    onError: (event: ErrorEvent) => void;
    onStatus: (event: StatusEvent) => void;
    onWarning: (event: WarningEvent) => void;
    onStarted: (event: { job_id: string; pid: number }) => void;
}

export function useJobEvents(callbacks: UseJobEventsCallbacks) {
    const unlisteners = useRef<UnlistenFn[]>([]);
    // Store latest callbacks in a ref to avoid stale closures
    const callbacksRef = useRef(callbacks);
    useEffect(() => {
        callbacksRef.current = callbacks;
    });

    useEffect(() => {
        const setup = async () => {
            const u1 = await listen<ProgressEvent>('job:progress', (e) => callbacksRef.current.onProgress(e.payload));
            const u2 = await listen<StatsEvent>('job:stats', (e) => callbacksRef.current.onStats(e.payload));
            const u3 = await listen<DoneEvent>('job:done', (e) => callbacksRef.current.onDone(e.payload));
            const u4 = await listen<ErrorEvent>('job:error', (e) => callbacksRef.current.onError(e.payload));
            const u5 = await listen<StatusEvent>('job:status', (e) => callbacksRef.current.onStatus(e.payload));
            const u6 = await listen<WarningEvent>('job:warning', (e) => callbacksRef.current.onWarning(e.payload));
            const u7 = await listen<{ job_id: string; pid: number }>('job:started', (e) => callbacksRef.current.onStarted(e.payload));
            unlisteners.current = [u1, u2, u3, u4, u5, u6, u7];
        };
        setup();
        return () => {
            unlisteners.current.forEach(u => u());
        };
    }, []); // intentionally empty — listeners registered once, callbacks via ref
}

// ── Helpers ─────────────────────────────────────────────────────────────────

export function formatDuration(seconds: number): string {
    if (!seconds || seconds < 0) return '0:00';
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    if (h > 0) {
        return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    }
    return `${m}:${s.toString().padStart(2, '0')}`;
}

/** Format ETA; pass t from useTranslation for localized units (time.seconds, time.minutes, time.hours, time.dash). */
export function formatEta(seconds: number, t?: (key: string) => string): string {
    const dash = t ? t('time.dash') : '—';
    const sec = t ? t('time.seconds') : 'с';
    const min = t ? t('time.minutes') : 'мин';
    const hr = t ? t('time.hours') : 'ч';
    if (!seconds || seconds <= 0) return dash;
    if (seconds < 60) return `~${Math.ceil(seconds)}${sec}`;
    if (seconds < 3600) return `~${Math.ceil(seconds / 60)}${min}`;
    const h = Math.floor(seconds / 3600);
    const m = Math.ceil((seconds % 3600) / 60);
    return `~${h}${hr} ${m}${min}`;
}

export function addChartPoint(
    points: ChartDataPoint[],
    stats: StatsEvent,
): ChartDataPoint[] {
    const newPoint: ChartDataPoint = {
        time: Date.now(),
        cpuSystem: Math.round(stats.cpu_system * 10) / 10,
        ramSystemPct: Math.round(stats.ram_system_pct * 10) / 10,
        cpuProc: Math.round(stats.cpu_proc * 10) / 10,
        ramProcMb: stats.ram_proc_mb,
    };
    const updated = [...points, newPoint];
    return updated.length > MAX_CHART_POINTS
        ? updated.slice(-MAX_CHART_POINTS)
        : updated;
}

export function addLogEntry(
    entries: LogEntry[],
    type: LogEntry['type'],
    message: string,
): LogEntry[] {
    const entry: LogEntry = { timestamp: Date.now(), type, message };
    const updated = [...entries, entry];
    return updated.length > MAX_LOG_ENTRIES
        ? updated.slice(-MAX_LOG_ENTRIES)
        : updated;
}
