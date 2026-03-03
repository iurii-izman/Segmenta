import { describe, it, expect } from 'vitest';
import { reducer, initialState } from './jobStore';
import type { JobSummary, LogEntry } from '../types';

describe('jobStore reducer', () => {
    it('SET_JOBS replaces jobs', () => {
        const jobs: JobSummary[] = [
            {
                id: '1',
                status: 'done',
                input_path: '/a.mp3',
                output_dir: '/out',
                output_base: 'a',
                model: 'small',
                progress_pct: 100,
                created_at: '2025-01-01T00:00:00Z',
                error_message: null,
            },
        ];
        const next = reducer(initialState, { type: 'SET_JOBS', jobs });
        expect(next.jobs).toHaveLength(1);
        expect(next.jobs[0].id).toBe('1');
        expect(next.jobs[0].status).toBe('done');
    });

    it('ADD_LOG appends and caps at 200', () => {
        const entry: LogEntry = { timestamp: Date.now(), type: 'status', message: 'test' };
        let state = initialState;
        for (let i = 0; i < 250; i++) {
            state = reducer(state, { type: 'ADD_LOG', entry: { ...entry, timestamp: entry.timestamp + i } });
        }
        expect(state.logEntries).toHaveLength(200);
    });

    it('SET_TAB updates activeTab', () => {
        const next = reducer(initialState, { type: 'SET_TAB', tab: 'queue' });
        expect(next.activeTab).toBe('queue');
    });
});
