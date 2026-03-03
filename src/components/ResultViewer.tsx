import React, { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import type { JobDetail } from '../types';
import { Eye, Save, X, FileText } from 'lucide-react';
import { useTranslation } from 'react-i18next';

interface ResultViewerProps {
    job: JobDetail;
    onClose: () => void;
}

export default function ResultViewer({ job, onClose }: ResultViewerProps) {
    const { t } = useTranslation();
    const [viewerContent, setViewerContent] = useState('');
    const [activeOutput, setActiveOutput] = useState('');
    const [isSaving, setIsSaving] = useState(false);
    const [isDirty, setIsDirty] = useState(false);
    const [saveStatus, setSaveStatus] = useState<'idle' | 'success' | 'error'>('idle');

    useEffect(() => {
        if (job.result?.outputs && job.result.outputs.length > 0) {
            loadFile(job.result.outputs[0]);
        }
    }, [job]);

    // Auto-clear save success status
    useEffect(() => {
        if (saveStatus === 'success') {
            const id = setTimeout(() => setSaveStatus('idle'), 3000);
            return () => clearTimeout(id);
        }
    }, [saveStatus]);

    const loadFile = async (path: string) => {
        if (isDirty) {
            if (!window.confirm(t('viewer.unsavedConfirm'))) return;
        }

        setActiveOutput(path);
        setIsDirty(false);
        setSaveStatus('idle');

        try {
            const text = await invoke('read_file', { path }) as string;
            setViewerContent(text);
        } catch (e: unknown) {
            const msg = e instanceof Error ? e.message : String(e);
            let display = msg;
            try {
                const o = JSON.parse(msg);
                if (o?.error === 'access_denied') display = t('errors.accessDenied');
            } catch { /* not JSON */ }
            setViewerContent(t('viewer.loadError') + ': ' + display);
        }
    };

    const handleSave = async () => {
        if (!activeOutput) return;
        setIsSaving(true);
        try {
            await invoke('save_file', { path: activeOutput, content: viewerContent });
            setIsDirty(false);
            setSaveStatus('success');
        } catch (e: unknown) {
            console.error(e);
            setSaveStatus('error');
            const msg = e instanceof Error ? e.message : String(e);
            let display = msg;
            try {
                const o = JSON.parse(msg);
                if (o?.error === 'access_denied') display = t('errors.accessDenied');
            } catch { /* not JSON */ }
            alert(t('viewer.saveError') + ': ' + display);
        } finally {
            setIsSaving(false);
        }
    };

    const handleClose = () => {
        if (isDirty) {
            if (!window.confirm(t('viewer.unsavedClose'))) return;
        }
        onClose();
    };

    useEffect(() => {
        const onKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                if (isDirty && !window.confirm(t('viewer.unsavedClose'))) return;
                onClose();
            }
        };
        window.addEventListener('keydown', onKeyDown);
        return () => window.removeEventListener('keydown', onKeyDown);
    }, [isDirty, onClose, t]);

    return (
        <div className="viewer-modal-backdrop" onClick={handleClose} role="presentation">
            <div className="viewer-modal card" onClick={e => e.stopPropagation()} role="dialog" aria-modal="true" aria-label={t('viewer.title')}>
                <div className="viewer-header">
                    <div className="card-title">
                        <FileText size={18} />
                        {t('viewer.title')}: {job.output_base || job.input_path.split('/').pop()}
                    </div>
                    <div style={{ display: 'flex', gap: '8px' }}>
                        <button
                            className={`btn btn-sm ${isDirty ? 'btn-primary' : 'btn-secondary'}`}
                            onClick={handleSave}
                            disabled={isSaving || !activeOutput}
                        >
                            <Save size={14} />
                            {isSaving ? t('viewer.saving') : saveStatus === 'success' ? t('viewer.saved') : t('viewer.save')}
                        </button>
                        <button className="btn btn-sm btn-icon btn-secondary" onClick={handleClose} title={t('viewer.close')}>
                            <X size={16} />
                        </button>
                    </div>
                </div>

                {job.result?.outputs && job.result.outputs.length > 0 ? (
                    <div className="viewer-layout">
                        <div className="viewer-sidebar">
                            <div className="form-label" style={{ marginBottom: 8 }}>{t('viewer.files')}</div>
                            {job.result.outputs.map(path => (
                                <button
                                    key={path}
                                    className={`viewer-file-btn ${path === activeOutput ? 'active' : ''}`}
                                    onClick={() => loadFile(path)}
                                >
                                    {path.split('/').pop()}
                                </button>
                            ))}
                        </div>
                        <div className="viewer-content">
                            <textarea
                                value={viewerContent}
                                onChange={(e) => {
                                    setViewerContent(e.target.value);
                                    setIsDirty(true);
                                }}
                                className="viewer-textarea editable"
                                spellCheck={false}
                            />
                        </div>
                    </div>
                ) : (
                    <div style={{ padding: 20, color: 'var(--text-secondary)' }}>{t('viewer.notFound')}</div>
                )}
            </div>
        </div>
    );
}
