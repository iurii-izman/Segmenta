import { describe, it, expect } from 'vitest';
import { parseBackendErrorMessage } from './parseBackendError';

describe('parseBackendErrorMessage', () => {
    it('returns null for non-JSON', () => {
        expect(parseBackendErrorMessage('plain text')).toBeNull();
        expect(parseBackendErrorMessage('')).toBeNull();
    });

    it('parses validation error without params', () => {
        const s = JSON.stringify({ validation: true, code: 'inputPathRequired' });
        const r = parseBackendErrorMessage(s);
        expect(r).toEqual({ type: 'validation', code: 'inputPathRequired', params: undefined });
    });

    it('parses validation error with params', () => {
        const s = JSON.stringify({ validation: true, code: 'invalidFormat', params: { format: 'pdf' } });
        const r = parseBackendErrorMessage(s);
        expect(r).toEqual({ type: 'validation', code: 'invalidFormat', params: { format: 'pdf' } });
    });

    it('parses access_denied', () => {
        const s = JSON.stringify({ error: 'access_denied' });
        const r = parseBackendErrorMessage(s);
        expect(r).toEqual({ type: 'access_denied' });
    });

    it('returns null for JSON without known shape', () => {
        expect(parseBackendErrorMessage(JSON.stringify({ foo: 1 }))).toBeNull();
        expect(parseBackendErrorMessage(JSON.stringify({ validation: true }))).toBeNull();
    });
});
