// ─── Job Types ──────────────────────────────────────────────────────────────

export type JobStatus = 'pending' | 'running' | 'done' | 'error' | 'canceled';

export interface JobPayload {
    input_path: string;
    output_dir: string;
    output_base: string;
    formats: string[];
    model: string;
    device: string;
    compute_type: string;
    vad_filter: boolean;
    beam_size: number;
    language: string;
    word_timestamps: boolean;
    threads: number;
}

export interface JobSummary {
    id: string;
    status: JobStatus;
    input_path: string;
    output_dir: string;
    output_base: string;
    model: string;
    progress_pct: number;
    created_at: string;
    error_message: string | null;
}

export interface JobDetail extends JobSummary {
    payload: JobPayload;
    progress: ProgressData;
    stats: StatsData;
    result: JobResult | null;
    stderr_tail: string[];
    started_at: string | null;
    finished_at: string | null;
    pid: number | null;
}

// ─── Event Payloads ─────────────────────────────────────────────────────────

export interface ProgressEvent {
    job_id: string;
    pct: number;
    audio_done_sec: number;
    audio_total_sec: number;
    eta_sec: number;
    rtf: number;
    elapsed_sec: number;
    segments_done: number;
    segment_preview: string;
}

export interface StatsEvent {
    job_id: string;
    cpu_system: number;
    ram_system_pct: number;
    ram_system_used_mb: number;
    ram_system_total_mb: number;
    cpu_proc: number;
    ram_proc_mb: number;
}

export interface DoneEvent {
    job_id: string;
    outputs: string[];
    stats: {
        duration_sec: number;
        elapsed_sec: number;
        rtf: number;
        segments: number;
        chars: number;
        words: number;
        model: string;
        model_load_sec: number;
        language_detected: string;
        language_probability: number;
    };
}

export interface ErrorEvent {
    job_id: string;
    message: string;
    details?: string;
    stderr_tail: string;
}

export interface StatusEvent {
    job_id: string;
    message: string;
}

// ─── Internal State Types ───────────────────────────────────────────────────

export interface ProgressData {
    pct: number;
    audio_done_sec: number;
    audio_total_sec: number;
    eta_sec: number;
    rtf: number;
    elapsed_sec: number;
    segments_done: number;
    segment_preview: string;
}

export interface StatsData {
    cpu_system: number;
    ram_system_pct: number;
    ram_system_used_mb: number;
    ram_system_total_mb: number;
    cpu_proc: number;
    ram_proc_mb: number;
}

export interface JobResult {
    outputs: string[];
    duration_sec: number;
    elapsed_sec: number;
    rtf: number;
    segments: number;
    chars: number;
    words: number;
    model: string;
    model_load_sec: number;
    language_detected: string;
    language_probability: number;
}

// ─── Settings ───────────────────────────────────────────────────────────────

export interface AppSettings {
    default_output_dir: string;
    default_model: string;
    default_beam_size: number;
    default_language: string;
    default_vad: boolean;
    default_word_timestamps: boolean;
    default_threads: number;
    default_compute_type: string;
    default_formats: string[];
    container_name: string;
    venv_path: string;
}

export const DEFAULT_SETTINGS: AppSettings = {
    default_output_dir: '',
    default_model: 'small',
    default_beam_size: 5,
    default_language: 'ru',
    default_vad: true,
    default_word_timestamps: false,
    default_threads: 4,
    default_compute_type: 'int8',
    default_formats: ['txt', 'srt', 'vtt', 'json'],
    container_name: 'asr',
    venv_path: '~/.venvs/faster-whisper',
};

// ─── Presets ────────────────────────────────────────────────────────────────

export interface Preset {
    name: string;
    label: string;
    description: string;
    icon: string;
    model: string;
    beam_size: number;
    vad_filter: boolean;
    word_timestamps: boolean;
    language: string;
}

export const PRESETS: Preset[] = [
    {
        name: 'fast',
        label: '⚡ Быстро',
        description: 'base модель, beam=1 — максимальная скорость',
        icon: '⚡',
        model: 'base',
        beam_size: 1,
        vad_filter: false,
        word_timestamps: false,
        language: 'ru',
    },
    {
        name: 'quality',
        label: '🎯 Качественно',
        description: 'small модель, beam=5, VAD — баланс скорости и качества',
        icon: '🎯',
        model: 'small',
        beam_size: 5,
        vad_filter: true,
        word_timestamps: false,
        language: 'ru',
    },
    {
        name: 'subtitles',
        label: '📝 Субтитры',
        description: 'small модель, beam=5, слова — для точных субтитров',
        icon: '📝',
        model: 'small',
        beam_size: 5,
        vad_filter: true,
        word_timestamps: true,
        language: 'ru',
    },
];

// ─── Model Info ─────────────────────────────────────────────────────────────

export interface ModelInfo {
    id: string;
    label: string;
    ram_hint: string;
    warning?: string;
}

export const MODELS: ModelInfo[] = [
    { id: 'base', label: 'Base', ram_hint: '~1 GB RAM' },
    { id: 'small', label: 'Small', ram_hint: '~2 GB RAM' },
    { id: 'medium', label: 'Medium', ram_hint: '~5 GB RAM', warning: 'Может быть медленно на 8 GB RAM' },
    { id: 'large-v3', label: 'Large v3', ram_hint: '~10 GB RAM', warning: 'Требует много RAM, может быть очень медленно' },
    { id: 'distil-large-v3', label: 'Distil Large v3', ram_hint: '~6 GB RAM', warning: 'Оптимизированная large, но всё ещё тяжёлая' },
];

// ─── Chart Data ─────────────────────────────────────────────────────────────

export interface ChartDataPoint {
    time: number;
    cpuSystem: number;
    ramSystemPct: number;
    cpuProc: number;
    ramProcMb: number;
}

// ─── Log Entry ──────────────────────────────────────────────────────────────

export interface LogEntry {
    timestamp: number;
    type: 'progress' | 'status' | 'error' | 'done' | 'warning';
    message: string;
}

export interface WarningEvent {
    job_id: string;
    message: string;
}
