import React, { createContext, useContext, useReducer, type ReactNode } from 'react';
import type {
    AppSettings,
    JobSummary,
    ProgressData,
    StatsData,
    ChartDataPoint,
    LogEntry,
} from '../types';
import { DEFAULT_SETTINGS } from '../types';

// ── State ───────────────────────────────────────────────────────────────────

interface JobState {
    jobs: JobSummary[];
    currentJobId: string | null;
    progress: ProgressData | null;
    stats: StatsData | null;
    chartData: ChartDataPoint[];
    logEntries: LogEntry[];
    settings: AppSettings;
    activeTab: 'new' | 'queue' | 'settings';
    statusMessage: string;
}

export const initialState: JobState = {
    jobs: [],
    currentJobId: null,
    progress: null,
    stats: null,
    chartData: [],
    logEntries: [],
    settings: loadSettings(),
    activeTab: 'new',
    statusMessage: '',
};

// ── Actions ─────────────────────────────────────────────────────────────────

type Action =
    | { type: 'SET_JOBS'; jobs: JobSummary[] }
    | { type: 'SET_CURRENT_JOB'; id: string | null }
    | { type: 'SET_PROGRESS'; data: ProgressData }
    | { type: 'SET_STATS'; data: StatsData }
    | { type: 'ADD_CHART_POINT'; point: ChartDataPoint }
    | { type: 'SET_CHART_DATA'; data: ChartDataPoint[] }
    | { type: 'ADD_LOG'; entry: LogEntry }
    | { type: 'SET_LOG'; entries: LogEntry[] }
    | { type: 'SET_SETTINGS'; settings: Partial<AppSettings> }
    | { type: 'SET_TAB'; tab: 'new' | 'queue' | 'settings' }
    | { type: 'SET_STATUS_MESSAGE'; message: string }
    | { type: 'CLEAR_PROGRESS' }
    | { type: 'UPDATE_JOB_STATUS'; id: string; status: string; error_message?: string; progress_pct?: number };

export function reducer(state: JobState, action: Action): JobState {
    switch (action.type) {
        case 'SET_JOBS':
            return { ...state, jobs: action.jobs };
        case 'SET_CURRENT_JOB':
            return {
                ...state,
                currentJobId: action.id,
                ...(action.id ? {} : { progress: null, stats: null, chartData: [], logEntries: [] }),
            };
        case 'SET_PROGRESS':
            return { ...state, progress: action.data };
        case 'SET_STATS':
            return { ...state, stats: action.data };
        case 'ADD_CHART_POINT':
            return {
                ...state,
                chartData: [...state.chartData, action.point].slice(-120),
            };
        case 'SET_CHART_DATA':
            return { ...state, chartData: action.data };
        case 'ADD_LOG':
            return {
                ...state,
                logEntries: [...state.logEntries, action.entry].slice(-200),
            };
        case 'SET_LOG':
            return { ...state, logEntries: action.entries };
        case 'SET_SETTINGS': {
            const newSettings = { ...state.settings, ...action.settings };
            saveSettings(newSettings);
            return { ...state, settings: newSettings };
        }
        case 'SET_TAB':
            return { ...state, activeTab: action.tab };
        case 'SET_STATUS_MESSAGE':
            return { ...state, statusMessage: action.message };
        case 'CLEAR_PROGRESS':
            return { ...state, progress: null, stats: null, chartData: [], logEntries: [] };
        case 'UPDATE_JOB_STATUS':
            return {
                ...state,
                jobs: state.jobs.map((j) =>
                    j.id === action.id
                        ? {
                            ...j,
                            status: action.status as any,
                            error_message: action.error_message ?? j.error_message,
                            progress_pct: action.progress_pct ?? j.progress_pct,
                        }
                        : j
                ),
            };
        default:
            return state;
    }
}

// ── Context ─────────────────────────────────────────────────────────────────

const JobContext = createContext<{
    state: JobState;
    dispatch: React.Dispatch<Action>;
} | null>(null);

export function JobProvider({ children }: { children: ReactNode }) {
    const [state, dispatch] = useReducer(reducer, initialState);
    return (
        <JobContext.Provider value= {{ state, dispatch }
}>
    { children }
    </JobContext.Provider>
    );
}

export function useJobStore() {
    const context = useContext(JobContext);
    if (!context) throw new Error('useJobStore must be used within JobProvider');
    return context;
}

// ── Settings persistence ────────────────────────────────────────────────────

function loadSettings(): AppSettings {
    try {
        const saved = localStorage.getItem('transkribator-settings');
        if (saved) {
            return { ...DEFAULT_SETTINGS, ...JSON.parse(saved) };
        }
    } catch { }
    return DEFAULT_SETTINGS;
}

function saveSettings(settings: AppSettings) {
    try {
        localStorage.setItem('transkribator-settings', JSON.stringify(settings));
    } catch { }
}
