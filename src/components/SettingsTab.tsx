import { useCallback, useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { useJobStore } from '../stores/jobStore';
import { useTranslation } from 'react-i18next';
import { MODELS } from '../types';
import { APP_VERSION } from '../version';
import { Save, RotateCcw, Container, Check } from 'lucide-react';

export default function SettingsTab() {
    const { state, dispatch } = useJobStore();
    const { t, i18n } = useTranslation();
    const settings = state.settings;

    const [containerName, setContainerName] = useState(settings.container_name);
    const [venvPath, setVenvPath] = useState(settings.venv_path);
    const [isSaving, setIsSaving] = useState(false);

    useEffect(() => {
        setContainerName(settings.container_name);
        setVenvPath(settings.venv_path);
    }, [settings.container_name, settings.venv_path]);

    const updateSetting = useCallback(
        (key: string, value: any) => {
            dispatch({ type: 'SET_SETTINGS', settings: { [key]: value } });
        },
        [dispatch]
    );

    const syncBackendSettings = useCallback(async () => {
        try {
            await invoke('update_settings', {
                containerName: containerName,
                venvPath: venvPath,
            });
            updateSetting('container_name', containerName);
            updateSetting('venv_path', venvPath);
        } catch (e) {
            console.error('Failed to sync settings:', e);
        }
    }, [containerName, venvPath, updateSetting]);

    const resetSettings = useCallback(() => {
        dispatch({
            type: 'SET_SETTINGS',
            settings: {
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
            },
        });
    }, [dispatch]);

    const handleLanguageChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
        i18n.changeLanguage(e.target.value);
    };

    const saveSettings = useCallback(async () => {
        setIsSaving(true);
        try {
            await syncBackendSettings();
            // Optionally, save other settings to local storage or another persistent store
        } finally {
            setIsSaving(false);
        }
    }, [syncBackendSettings]);

    return (
        <div className="fade-in">
            {/* System variables */}
            <div className="card">
                <div className="card-title">
                    <Container size={18} />
                    {t('settings.titleVars')}
                </div>

                <div className="form-group">
                    <label className="form-label">{t('settings.language')}</label>
                    <select
                        value={i18n.language || 'ru'}
                        onChange={handleLanguageChange}
                    >
                        <option value="ru">{t('newTask.ru')}</option>
                        <option value="en">{t('newTask.en')}</option>
                    </select>
                </div>

                <div className="form-group">
                    <label className="form-label">{t('settings.containerName')}</label>
                    <input
                        type="text"
                        value={containerName}
                        onChange={e => setContainerName(e.target.value)}
                        placeholder="asr"
                    />
                    <div className="form-hint">
                        {t('settings.containerHint')}
                    </div>
                </div>
                <div className="form-group">
                    <label className="form-label">{t('settings.venvPath')}</label>
                    <input
                        type="text"
                        value={venvPath}
                        onChange={e => setVenvPath(e.target.value)}
                        placeholder="~/.venvs/faster-whisper"
                    />
                    <div className="form-hint">
                        {t('settings.venvHint')}
                    </div>
                </div>
            </div>

            {/* Default Parameters */}
            <div className="card">
                <div className="card-title">
                    <Container size={18} /> {/* Reusing Container icon for now, as Box was removed */}
                    {t('settings.titleDefaultParams')}
                </div>

                <div className="form-row">
                    <div className="form-group">
                        <label className="form-label">{t('settings.model')}</label>
                        <select
                            value={settings.default_model}
                            onChange={(e) => updateSetting('default_model', e.target.value)}
                        >
                            {MODELS.map((m) => (
                                <option key={m.id} value={m.id}>
                                    {m.label} — {m.ram_hint}
                                </option>
                            ))}
                        </select>
                    </div>

                    <div className="form-group">
                        <label className="form-label">{t('settings.language')}</label>
                        <select
                            value={settings.default_language}
                            onChange={(e) => updateSetting('default_language', e.target.value)}
                        >
                            <option value="ru">Русский (ru)</option>
                            <option value="auto">Авто-определение</option>
                            <option value="en">English (en)</option>
                        </select>
                    </div>
                </div>

                <div className="form-row-3">
                    <div className="form-group">
                        <label className="form-label">{t('settings.beamSize')}</label>
                        <div className="slider-container">
                            <input
                                type="range"
                                min={1}
                                max={10}
                                value={settings.default_beam_size}
                                onChange={(e) => updateSetting('default_beam_size', Number(e.target.value))}
                            />
                            <span className="slider-value">{settings.default_beam_size}</span>
                        </div>
                    </div>

                    <div className="form-group">
                        <label className="form-label">{t('settings.cpuThreads')}</label>
                        <div className="slider-container">
                            <input
                                type="range"
                                min={1}
                                max={16}
                                value={settings.default_threads}
                                onChange={(e) => updateSetting('default_threads', Number(e.target.value))}
                            />
                            <span className="slider-value">{settings.default_threads}</span>
                        </div>
                    </div>

                    <div className="form-group">
                        <label className="form-label">{t('settings.computeType')}</label>
                        <select
                            value={settings.default_compute_type}
                            onChange={(e) => updateSetting('default_compute_type', e.target.value)}
                        >
                            <option value="int8">INT8</option>
                            <option value="float32">Float32</option>
                        </select>
                    </div>
                </div>

                <div className="toggle-group" style={{ marginBottom: 16 }}>
                    <div
                        className="toggle"
                        onClick={() => updateSetting('default_vad', !settings.default_vad)}
                    >
                        <div className={`toggle-track ${settings.default_vad ? 'active' : ''}`} />
                        <span className="toggle-label">{t('settings.vadFilter')}</span>
                    </div>
                    <div
                        className="toggle"
                        onClick={() =>
                            updateSetting('default_word_timestamps', !settings.default_word_timestamps)
                        }
                    >
                        <div
                            className={`toggle-track ${settings.default_word_timestamps ? 'active' : ''}`}
                        />
                        <span className="toggle-label">{t('settings.wordTimestamps')}</span>
                    </div>
                </div>

                <div className="form-group">
                    <label className="form-label">{t('settings.defaultFormats')}</label>
                    <div className="checkbox-group">
                        {['txt', 'srt', 'vtt', 'json'].map((fmt) => (
                            <div
                                key={fmt}
                                className={`checkbox ${settings.default_formats.includes(fmt) ? 'checked' : ''}`}
                                onClick={() => {
                                    const newFormats = settings.default_formats.includes(fmt)
                                        ? settings.default_formats.filter((f) => f !== fmt)
                                        : [...settings.default_formats, fmt];
                                    updateSetting('default_formats', newFormats);
                                }}
                            >
                                <div className="checkbox-mark">
                                    {settings.default_formats.includes(fmt) ? '✓' : ''}
                                </div>
                                {fmt.toUpperCase()}
                            </div>
                        ))}
                    </div>
                </div>

                <div className="form-group">
                    <label className="form-label">{t('settings.defaultOutputDir')}</label>
                    <input
                        type="text"
                        value={settings.default_output_dir}
                        onChange={(e) => updateSetting('default_output_dir', e.target.value)}
                        placeholder={t('settings.defaultOutputDirPlaceholder')}
                    />
                </div>
            </div>

            {/* Actions */}
            <div className="btn-group">
                <button className="btn btn-secondary" onClick={resetSettings}>
                    <RotateCcw size={14} />
                    {t('settings.resetAll')}
                </button>
            </div>

            {/* Info */}
            <div className="card" style={{ marginTop: 16 }}>
                <div className="card-title">ℹ️ {t('settings.about')}</div>
                <div style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                    <p><strong>Transkribator</strong> v{APP_VERSION}</p>
                    <p>{t('settings.aboutDesc', { version: APP_VERSION })}</p>
                    <p style={{ marginTop: 8 }}>
                        {t('settings.aboutContainer', { container: settings.container_name, venv: settings.venv_path })}
                    </p>
                    <p style={{ marginTop: 8, color: 'var(--text-tertiary)', fontSize: 11 }}>
                        {t('settings.aboutPaths')}
                    </p>
                </div>
            </div>
        </div>
    );
}
