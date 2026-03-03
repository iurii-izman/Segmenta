import { useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { useTranslation } from 'react-i18next';
import { parseBackendErrorMessage } from './parseBackendError';

type ToastAdder = (toast: { id: string; type: 'success' | 'error'; message: string }) => void;

/**
 * Returns a wrapper around Tauri invoke that on error logs to console and adds an error toast.
 * Use for commands where the user should see a notification on failure.
 */
export function useInvokeWithToast(addToast: ToastAdder) {
    const { t } = useTranslation();

    const invokeSafe = useCallback(
        async <T>(cmd: string, args?: Record<string, unknown>): Promise<T | null> => {
            try {
                const result = await invoke<T>(cmd, args);
                return result;
            } catch (e: unknown) {
                const raw = e instanceof Error ? e.message : String(e);
                console.error(`[${cmd}]`, e);
                let displayMsg = raw;
                const parsed = parseBackendErrorMessage(raw);
                if (parsed?.type === 'validation') {
                    displayMsg = t(`validation.${parsed.code}`, parsed.params || {});
                } else if (parsed?.type === 'access_denied') {
                    displayMsg = t('errors.accessDenied');
                }
                addToast({
                    id: `err-${cmd}-${Date.now()}`,
                    type: 'error',
                    message: `${t('queue.status.error')}: ${displayMsg.slice(0, 120)}`,
                });
                return null;
            }
        },
        [addToast, t]
    );

    return { invokeSafe };
}
