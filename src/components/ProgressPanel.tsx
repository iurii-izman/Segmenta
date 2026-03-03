import { useRef, useEffect } from 'react';
import { useJobStore } from '../stores/jobStore';
import { formatDuration, formatEta } from '../hooks/useJobEvents';
import {
    AreaChart,
    Area,
    XAxis,
    YAxis,
    ResponsiveContainer,
    Tooltip,
} from 'recharts';
import { Cpu, MemoryStick, Clock, Zap, Hash, MessageSquare } from 'lucide-react';
import { useTranslation } from 'react-i18next';

const CustomTooltip = ({ active, payload, label, t }: any) => {
    if (active && payload && payload.length) {
        return (
            <div className="chart-tooltip">
                <p style={{ margin: '0 0 4px', color: 'var(--text-secondary)' }}>
                    {new Date(label).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                </p>
                {payload.map((p: any) => (
                    <p key={p.dataKey} style={{ margin: 0, color: p.stroke || p.color }}>
                        {p.name === 'cpuProc' ? t('progress.process') : p.name === 'cpuSystem' ? t('progress.system') : p.name === 'ramProcMb' ? 'RAM ' : ''}
                        {p.value.toFixed(0)} {p.name.includes('cpu') ? '%' : 'MB'}
                    </p>
                ))}
            </div>
        );
    }
    return null;
};

export default function ProgressPanel() {
    const { state } = useJobStore();
    const { t, i18n } = useTranslation();
    const { progress, stats, chartData, logEntries } = state;
    const logEndRef = useRef<HTMLDivElement>(null);
    const activeJob = state.jobs.find((j) => j.id === state.currentJobId);

    // Auto-scroll log
    useEffect(() => {
        logEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [logEntries.length]);

    if (!progress) {
        return (
            <div className="card fade-in">
                <div className="card-title">
                    <Clock size={18} />
                    {t('progress.preparing')}
                </div>
                <div className="progress-bar-track">
                    <div className="progress-bar-fill" style={{ width: '5%' }} />
                </div>
                <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 10 }}>
                    {state.statusMessage || t('progress.loading')}
                </p>
            </div>
        );
    }

    const pct = Math.min(progress.pct, 100);
    const speed = progress.rtf > 0 ? (1 / progress.rtf).toFixed(1) : '—';

    return (
        <div className="fade-in">
            {/* Main Progress */}
            <div className="card">
                <div className="progress-container">
                    <div className="progress-header">
                        <span className="progress-pct">{pct.toFixed(1)}%</span>
                        <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
                            {formatDuration(progress.audio_done_sec)} / {formatDuration(progress.audio_total_sec)}
                        </span>
                    </div>
                    <div className="progress-bar-track">
                        <div className={`progress-bar-fill ${activeJob?.status === 'running' ? 'pulse' : ''}`} style={{ width: `${pct}%` }} />
                    </div>
                </div>

                {/* Stats Grid */}
                <div className="progress-meta">
                    <div className="progress-stat">
                        <span className="progress-stat-label">{t('progress.eta')}</span>
                        <span className="progress-stat-value">{formatEta(progress.eta_sec, t)}</span>
                    </div>
                    <div className="progress-stat">
                        <span className="progress-stat-label">{t('progress.elapsed')}</span>
                        <span className="progress-stat-value">{formatDuration(progress.elapsed_sec)}</span>
                    </div>
                    <div className="progress-stat">
                        <span className="progress-stat-label">{t('progress.speed')}</span>
                        <span className="progress-stat-value">{speed}×</span>
                    </div>
                    <div className="progress-stat">
                        <span className="progress-stat-label">RTF</span>
                        <span className="progress-stat-value">{progress.rtf.toFixed(2)}</span>
                    </div>
                    <div className="progress-stat">
                        <span className="progress-stat-label">{t('progress.segments')}</span>
                        <span className="progress-stat-value">{progress.segments_done}</span>
                    </div>
                </div>

                {/* Segment Preview */}
                {progress.segment_preview && (
                    <div className="segment-preview">
                        <MessageSquare size={14} style={{ marginRight: 8, color: 'var(--accent)', flexShrink: 0 }} />
                        «{progress.segment_preview}»
                    </div>
                )}
            </div>

            {/* CPU / RAM Charts */}
            {stats && (
                <div className="charts-grid">
                    <div className="chart-card">
                        <div className="chart-title">
                            <Cpu size={12} style={{ display: 'inline-block', marginRight: 4 }} />
                            CPU
                        </div>
                        <div className="chart-value cpu">
                            {stats.cpu_proc.toFixed(0)}%
                            <span style={{ fontSize: 11, color: 'var(--text-tertiary)', marginLeft: 8, fontWeight: 400 }}>
                                {t('progress.systemLabel')} {stats.cpu_system.toFixed(0)}%
                            </span>
                        </div>
                        <div style={{ height: 60 }}>
                            <ResponsiveContainer width="100%" height="100%">
                                <AreaChart data={chartData.slice(-60)}>
                                    <defs>
                                        <linearGradient id="cpuGrad" x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="0%" stopColor="#6366f1" stopOpacity={0.3} />
                                            <stop offset="100%" stopColor="#6366f1" stopOpacity={0} />
                                        </linearGradient>
                                    </defs>
                                    <XAxis dataKey="time" hide />
                                    <Tooltip content={<CustomTooltip t={t} />} />
                                    <Area
                                        type="monotone"
                                        dataKey="cpuProc"
                                        stroke="#6366f1"
                                        fill="url(#cpuGrad)"
                                        strokeWidth={1.5}
                                        dot={false}
                                        isAnimationActive={false}
                                    />
                                    <Area
                                        type="monotone"
                                        dataKey="cpuSystem"
                                        stroke="#4b5563"
                                        fill="none"
                                        strokeWidth={1}
                                        strokeDasharray="3 3"
                                        dot={false}
                                        isAnimationActive={false}
                                    />
                                </AreaChart>
                            </ResponsiveContainer>
                        </div>
                    </div>

                    <div className="chart-card">
                        <div className="chart-title">
                            <MemoryStick size={12} style={{ display: 'inline-block', marginRight: 4 }} />
                            RAM
                        </div>
                        <div className="chart-value ram">
                            {stats.ram_proc_mb} MB
                            <span style={{ fontSize: 11, color: 'var(--text-tertiary)', marginLeft: 8, fontWeight: 400 }}>
                                {t('progress.systemLabel')} {stats.ram_system_pct.toFixed(0)}%
                                ({stats.ram_system_used_mb}/{stats.ram_system_total_mb} MB)
                            </span>
                        </div>
                        <div style={{ height: 60 }}>
                            <ResponsiveContainer width="100%" height="100%">
                                <AreaChart data={chartData.slice(-60)}>
                                    <defs>
                                        <linearGradient id="ramGrad" x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="0%" stopColor="#a855f7" stopOpacity={0.3} />
                                            <stop offset="100%" stopColor="#a855f7" stopOpacity={0} />
                                        </linearGradient>
                                    </defs>
                                    <XAxis dataKey="time" hide />
                                    <Tooltip content={<CustomTooltip t={t} />} />
                                    <Area
                                        type="monotone"
                                        dataKey="ramProcMb"
                                        stroke="#a855f7"
                                        fill="url(#ramGrad)"
                                        strokeWidth={1.5}
                                        dot={false}
                                        isAnimationActive={false}
                                    />
                                </AreaChart>
                            </ResponsiveContainer>
                        </div>
                    </div>
                </div>
            )}

            {/* Event Log */}
            <div className="card">
                <div className="card-title">📋 {t('progress.logTitle')}</div>
                <div className="log-panel">
                    {logEntries.length === 0 ? (
                        <div style={{ color: 'var(--text-tertiary)', padding: 8 }}>{t('progress.waitingEvents')}</div>
                    ) : (
                        logEntries.map((entry, i) => (
                            <div key={i} className="log-entry">
                                <span className="log-time">
                                    {new Date(entry.timestamp).toLocaleTimeString(i18n.language === 'ru' ? 'ru-RU' : 'en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                                </span>
                                <span className={`log-type ${entry.type}`}>{entry.type}</span>
                                <span className="log-message">{entry.message}</span>
                            </div>
                        ))
                    )}
                    <div ref={logEndRef} />
                </div>
            </div>
        </div>
    );
}
