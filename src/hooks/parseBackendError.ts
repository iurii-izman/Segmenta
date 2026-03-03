/**
 * Parse backend error string (validation or access_denied JSON).
 * Used by useInvokeWithToast and tests.
 */
export type ParsedBackendError =
    | { type: 'validation'; code: string; params?: Record<string, string> }
    | { type: 'access_denied' }
    | null;

export function parseBackendErrorMessage(raw: string): ParsedBackendError {
    try {
        const o = JSON.parse(raw);
        if (o?.validation && typeof o?.code === 'string') {
            return { type: 'validation', code: o.code, params: o.params as Record<string, string> | undefined };
        }
        if (o?.error === 'access_denied') {
            return { type: 'access_denied' };
        }
    } catch {
        // not JSON
    }
    return null;
}
