import { useState, useRef, useCallback, useEffect } from 'react';
import { listen } from '@tauri-apps/api/event';
import { invoke } from '@tauri-apps/api/core';
import { open } from '@tauri-apps/plugin-dialog';
import { useJobStore } from '../stores/jobStore';
import ProgressPanel from './ProgressPanel';
import type { JobPayload, Preset } from '../types';
import { PRESETS, MODELS } from '../types';
import {
    FileVideo,
    FolderOpen,
    Play,
    AlertTriangle,
    Upload,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';

const PRESET_I18N_KEYS: Record<string, string> = {
    fast: 'presetFast',
    quality: 'presetQuality',
    subtitles: 'presetSubs',
};

export default function NewTaskTab() {
    const { state, dispatch } = useJobStore();
    const { t } = useTranslation();
    const settings = state.settings;

    // ── Form State ──────────────────────────────────────────────────────────

    const [inputPath, setInputPath] = useState('');
    const [outputDir, setOutputDir] = useState(settings.default_output_dir);
    const [outputBase, setOutputBase] = useState('');
    const [formats, setFormats] = useState<string[]>(settings.default_formats);
    const [model, setModel] = useState(settings.default_model);
    const [vad, setVad] = useState(settings.default_vad);
    const [beamSize, setBeamSize] = useState(settings.default_beam_size);
    const [language, setLanguage] = useState(settings.default_language);
    const [wordTimestamps, setWordTimestamps] = useState(settings.default_word_timestamps);
    const [threads, setThreads] = useState(settings.default_threads);
    const [computeType, setComputeType] = useState(settings.default_compute_type);
    const [activePreset, setActivePreset] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);

    const [dragOver, setDragOver] = useState(false);
    const dropRef = useRef<HTMLDivElement>(null);

    // ── File Pickers ────────────────────────────────────────────────────────

    const handleFileSelection = useCallback((path: string) => {
        const lowerPath = path.toLowerCase();
        const validExts = ['mp4', 'mkv', 'avi', 'webm', 'mov', 'mp3', 'wav', 'flac', 'ogg', 'm4a', 'aac', 'wma'];
        const isValid = validExts.some(ext => lowerPath.endsWith('.' + ext));

        if (!isValid) {
            setError(t('newTask.unsupportedFormat'));
            return;
        }

        setInputPath(path);

        // Auto-generate output base name
        const fileName = path.split(/[/\\]/).pop() || '';
        const baseName = fileName.replace(/\.[^.]+$/, '');
        const date = new Date().toISOString().slice(0, 10);
        setOutputBase(`${baseName}_${date}`);

        // Auto-fill output directory to be the parent directory of the input file
        const parentDir = path.substring(0, Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\')));
        if (parentDir) {
            setOutputDir(parentDir);
        }

        setError(null);
    }, [t]);

    // ── File Pickers ────────────────────────────────────────────────────────

    const pickInputFile = useCallback(async () => {
        try {
            const result = await open({
                multiple: false,
                filters: [
                    {
                        name: 'Media',
                        extensions: ['mp4', 'mkv', 'avi', 'webm', 'mov', 'mp3', 'wav', 'flac', 'ogg', 'm4a', 'aac', 'wma'],
                    },
                ],
            });
            if (result) {
                const resultObj = result as any;
                const path = typeof result === 'string' ? result : resultObj.path || result;
                handleFileSelection(path as string);
            }
        } catch (e) {
            console.error('File picker error:', e);
        }
    }, [handleFileSelection]);

    const pickOutputDir = useCallback(async () => {
        try {
            const result = await open({
                directory: true,
                multiple: false,
            });
            if (result) {
                setOutputDir(result as string);
            }
        } catch (e) {
            console.error('Folder picker error:', e);
        }
    }, []);

    // ── Drag & Drop ─────────────────────────────────────────────────────────

    const handleDragOver = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setDragOver(true);
    }, []);

    const handleDragLeave = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setDragOver(false);
    }, []);

    const handleDrop = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setDragOver(false);

        const files = e.dataTransfer.files;
        if (files.length > 0) {
            const file = files[0];
            // On Tauri, dropped files usually have their real path injected
            const path = (file as any).path || file.name;
            if (path) {
                handleFileSelection(path);
            }
        }
    }, [handleFileSelection]);



    useEffect(() => {
        // Fallback for native Tauri drag and drop (especially over the non-HTML areas)
        const unlistenDrop = listen('tauri://drop', (event: any) => {
            const paths = event.payload?.paths || event.payload;
            if (Array.isArray(paths) && paths.length > 0) {
                handleFileSelection(paths[0]);
            }
        });

        return () => {
            unlistenDrop.then(fn => fn());
        };
    }, [handleFileSelection]);

    // ── Presets ─────────────────────────────────────────────────────────────

    const applyPreset = useCallback((preset: Preset) => {
        setModel(preset.model);
        setBeamSize(preset.beam_size);
        setVad(preset.vad_filter);
        setWordTimestamps(preset.word_timestamps);
        setLanguage(preset.language);
        setActivePreset(preset.name);
    }, []);

    // ── Format Toggle ───────────────────────────────────────────────────────

    const toggleFormat = useCallback((fmt: string) => {
        setFormats((prev) =>
            prev.includes(fmt) ? prev.filter((f) => f !== fmt) : [...prev, fmt]
        );
    }, []);

    // ── Start Job ───────────────────────────────────────────────────────────

    const startJob = useCallback(async () => {
        if (!inputPath) {
            setError(t('newTask.selectInputFile'));
            return;
        }
        if (!outputDir) {
            setError(t('newTask.selectOutputDir'));
            return;
        }
        if (formats.length === 0) {
            setError(t('newTask.selectOneFormat'));
            return;
        }

        setError(null);

        const payload: JobPayload = {
            input_path: inputPath,
            output_dir: outputDir,
            output_base: outputBase || inputPath.split('/').pop()?.replace(/\.[^.]+$/, '') || 'output',
            formats,
            model,
            device: 'cpu',
            compute_type: computeType,
            vad_filter: vad,
            beam_size: beamSize,
            language,
            word_timestamps: wordTimestamps,
            threads,
        };

        try {
            await invoke('start_job', { payload });
            setInputPath(''); // Clear input so user can add another
            dispatch({ type: 'SET_TAB', tab: 'queue' }); // switch to queue
        } catch (e: unknown) {
            const raw = typeof e === 'string' ? e : (e as Error)?.message ?? t('newTask.fillRequired');
            try {
                const o = JSON.parse(raw);
                if (o?.validation && o.code) {
                    setError(t(`validation.${o.code}`, (o.params as Record<string, string>) || {}));
                    return;
                }
            } catch {
                // not JSON, use raw
            }
            setError(raw);
        }
    }, [inputPath, outputDir, outputBase, formats, model, computeType, vad, beamSize, language, wordTimestamps, threads, dispatch, t]);

    // ── Render ──────────────────────────────────────────────────────────────

    const selectedModel = MODELS.find(m => m.id === model);

    return (
        <div className="fade-in">
            {/* Error Banner */}
            {error && (
                <div className="error-banner">
                    <div className="error-banner-header">
                        <AlertTriangle size={16} />
                        {t('newTask.errorTitle')}
                    </div>
                    <div className="error-banner-message">{error}</div>
                    <div className="error-banner-actions">
                        <button
                            className="btn btn-sm btn-secondary"
                            onClick={() => navigator.clipboard.writeText(error)}
                        >
                            {t('newTask.copy')}
                        </button>
                        <button
                            className="btn btn-sm btn-secondary"
                            onClick={() => setError(null)}
                        >
                            {t('newTask.close')}
                        </button>
                    </div>
                </div>
            )}

            <div
                ref={dropRef}
                className={`drop-zone ${dragOver ? 'dragover' : ''}`}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
            >
                <div className="drop-zone-icon"><Upload /></div>
                <div className="drop-zone-text">
                    {t('newTask.dropFile')}
                </div>
            </div>

            {/* Input / Output */}
            <div className="card">
                <div className="form-group">
                    <label className="form-label" htmlFor="newtask-input-path">{t('newTask.file')}</label>
                    <div className="file-picker">
                        <input
                            id="newtask-input-path"
                            type="text"
                            value={inputPath}
                            onChange={(e) => setInputPath(e.target.value)}
                            placeholder={t('newTask.placeholderInputPath')}
                            aria-invalid={!inputPath.trim()}
                            aria-describedby={!inputPath.trim() ? 'newtask-input-hint' : undefined}
                        />
                        <button type="button" className="file-picker-btn" onClick={pickInputFile} aria-label={t('newTask.selectFile')}>
                            <FileVideo size={14} />
                            {t('newTask.selectFile')}
                        </button>
                    </div>
                    {!inputPath.trim() && (
                        <span id="newtask-input-hint" className="form-hint form-hint--error" role="alert">
                            {t('newTask.selectInputFile')}
                        </span>
                    )}
                </div>

                <div className="form-row">
                    <div className="form-group">
                        <label className="form-label" htmlFor="newtask-output-dir">{t('newTask.outputDir')}</label>
                        <div className="file-picker">
                            <input
                                id="newtask-output-dir"
                                type="text"
                                value={outputDir}
                                onChange={(e) => setOutputDir(e.target.value)}
                                placeholder={t('newTask.placeholderOutputDir')}
                                aria-invalid={!outputDir.trim()}
                                aria-describedby={!outputDir.trim() ? 'newtask-output-hint' : undefined}
                            />
                            <button type="button" className="file-picker-btn" onClick={pickOutputDir} aria-label={t('newTask.selectFolder')}>
                                <FolderOpen size={14} />
                                {t('newTask.selectFolder')}
                            </button>
                        </div>
                        {!outputDir.trim() && (
                            <span id="newtask-output-hint" className="form-hint form-hint--error" role="alert">
                                {t('newTask.selectOutputDir')}
                            </span>
                        )}
                    </div>
                    <div className="form-group">
                        <label className="form-label">{t('newTask.filename')}</label>
                        <input
                            type="text"
                            value={outputBase}
                            onChange={(e) => setOutputBase(e.target.value)}
                            placeholder={t('newTask.placeholderFilename')}
                        />
                    </div>
                </div>

                <div className="form-group" role="group" aria-labelledby="newtask-formats-label">
                    <label id="newtask-formats-label" className="form-label">{t('newTask.formats')}</label>
                    <div className="checkbox-group">
                        {['txt', 'srt', 'vtt', 'json'].map((fmt) => (
                            <div
                                key={fmt}
                                role="button"
                                tabIndex={0}
                                className={`checkbox ${formats.includes(fmt) ? 'checked' : ''}`}
                                onClick={() => toggleFormat(fmt)}
                                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleFormat(fmt); } }}
                                aria-pressed={formats.includes(fmt)}
                                aria-label={`${fmt.toUpperCase()}, ${formats.includes(fmt) ? t('newTask.formatsSelected') : t('newTask.formatsNotSelected')}`}
                            >
                                <div className="checkbox-mark">{formats.includes(fmt) ? '✓' : ''}</div>
                                {fmt.toUpperCase()}
                            </div>
                        ))}
                    </div>
                    {formats.length === 0 && (
                        <span className="form-hint form-hint--error" role="alert">
                            {t('newTask.selectOneFormat')}
                        </span>
                    )}
                </div>
            </div>

            {/* Presets */}
            <div className="card">
                <div className="card-title">⚙️ {t('newTask.presets')}</div>
                <div className="preset-grid">
                    {PRESETS.map((preset) => (
                        <div
                            key={preset.name}
                            className={`preset-card ${activePreset === preset.name ? 'active' : ''}`}
                            onClick={() => applyPreset(preset)}
                        >
                            <div className="preset-icon">{preset.icon}</div>
                            <div className="preset-name">{t(`newTask.${PRESET_I18N_KEYS[preset.name] ?? 'presetFast'}`)}</div>
                        </div>
                    ))}
                </div>
            </div>

            {/* Parameters */}
            <div className="card">
                <div className="card-title">🔧 {t('newTask.params')}</div>

                <div className="form-row">
                    <div className="form-group">
                        <label className="form-label">{t('newTask.model')}</label>
                        <select value={model} onChange={(e) => { setModel(e.target.value); setActivePreset(null); }}>
                            {MODELS.map((m) => (
                                <option key={m.id} value={m.id}>
                                    {m.label} — {t('newTask.sizeRam', { gb: m.ram_hint.replace('~', '').replace('GB', '').trim() })}
                                </option>
                            ))}
                        </select>
                        {selectedModel?.warning && (
                            <div className="warning-banner">
                                <AlertTriangle size={14} className="warning-banner-icon" />
                                <span className="warning-banner-text">{t('newTask.warningModel')}</span>
                            </div>
                        )}
                    </div>

                    <div className="form-group">
                        <label className="form-label">{t('newTask.language')}</label>
                        <select value={language} onChange={(e) => setLanguage(e.target.value)}>
                            <option value="ru">{t('newTask.ru')} (ru)</option>
                            <option value="auto">{t('newTask.autoDetect')}</option>
                            <option value="en">{t('newTask.en')} (en)</option>
                            <option value="uk">Українська (uk)</option>
                            <option value="kk">Қазақша (kk)</option>
                        </select>
                    </div>
                </div>

                <div className="form-row-3">
                    <div className="form-group">
                        <label className="form-label">{t('newTask.beamSize')}</label>
                        <div className="slider-container">
                            <input
                                type="range"
                                min={1}
                                max={10}
                                value={beamSize}
                                onChange={(e) => { setBeamSize(Number(e.target.value)); setActivePreset(null); }}
                            />
                            <span className="slider-value">{beamSize}</span>
                        </div>
                    </div>

                    <div className="form-group">
                        <label className="form-label">{t('newTask.threads')}</label>
                        <div className="slider-container">
                            <input
                                type="range"
                                min={1}
                                max={16}
                                value={threads}
                                onChange={(e) => setThreads(Number(e.target.value))}
                            />
                            <span className="slider-value">{threads}</span>
                        </div>
                    </div>

                    <div className="form-group">
                        <label className="form-label">{t('newTask.computeType')}</label>
                        <select value={computeType} onChange={(e) => setComputeType(e.target.value)}>
                            <option value="int8">INT8 (fast)</option>
                            <option value="float32">Float32</option>
                        </select>
                    </div>
                </div>

                <div className="toggle-group">
                    <div className="toggle" onClick={() => { setVad(!vad); setActivePreset(null); }}>
                        <div className={`toggle-track ${vad ? 'active' : ''}`} />
                        <span className="toggle-label">{t('newTask.vadFilter')}</span>
                    </div>
                    <div className="toggle" onClick={() => { setWordTimestamps(!wordTimestamps); setActivePreset(null); }}>
                        <div className={`toggle-track ${wordTimestamps ? 'active' : ''}`} />
                        <span className="toggle-label">{t('newTask.wordTimestamps')}</span>
                    </div>
                </div>
            </div>

            {/* Actions */}
            <div className="btn-group" style={{ marginTop: 8 }}>
                <button
                    type="button"
                    className="btn btn-primary"
                    onClick={startJob}
                    aria-label={t('newTask.addToQueue')}
                    disabled={!inputPath.trim() || !outputDir.trim() || formats.length === 0}
                >
                    <Play size={16} />
                    {t('newTask.addToQueue')}
                </button>
            </div>
        </div >
    );
}
