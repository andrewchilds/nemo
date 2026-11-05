import { describe, expect, it } from 'vitest';
import { describeOutcome, formatBytes, formatDuration, formatRunTime, runDuration } from './runs';
import type { RunRecord } from './types';

const base: RunRecord = { id: 'r1', startedAt: 1_000, trigger: 'manual', bytes: 0 };

describe('runDuration', () => {
	it('uses now while the run is still going', () => {
		expect(runDuration(base, 5_000)).toBe(4_000);
	});

	it('uses endedAt once finished', () => {
		expect(runDuration({ ...base, endedAt: 3_500 }, 99_999)).toBe(2_500);
	});
});

describe('describeOutcome', () => {
	it('labels each outcome', () => {
		expect(describeOutcome({ outcome: 'success', exitCode: 0 })).toEqual({ label: 'EXIT 0', variant: 'green' });
		expect(describeOutcome({ outcome: 'failed', exitCode: 2 })).toEqual({ label: 'EXIT 2', variant: 'red' });
		expect(describeOutcome({ outcome: 'stopped', exitCode: 0 }).variant).toBe('default');
		expect(describeOutcome({ outcome: 'interrupted' }).variant).toBe('amber');
		expect(describeOutcome({})).toEqual({ label: 'RUNNING', variant: 'blue' });
	});
});

describe('formatDuration', () => {
	it('shows tenths of a second under ten seconds', () => {
		expect(formatDuration(830)).toBe('0.8s');
		expect(formatDuration(4_240)).toBe('4.2s');
	});

	it('switches to whole units past ten seconds', () => {
		expect(formatDuration(12_900)).toBe('12s');
		expect(formatDuration(125_000)).toBe('2m 5s');
		expect(formatDuration(3 * 3_600_000 + 12 * 60_000)).toBe('3h 12m');
		expect(formatDuration(26 * 3_600_000)).toBe('1d 2h');
	});

	it('never goes negative', () => {
		expect(formatDuration(-50)).toBe('0.0s');
	});
});

describe('formatRunTime', () => {
	const now = new Date(2026, 10, 5, 15, 0).getTime();
	const time = (d: Date) => d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

	it('shows only the time for today', () => {
		const at = new Date(2026, 10, 5, 14, 30);
		expect(formatRunTime(at.getTime(), now)).toBe(time(at));
	});

	it('includes seconds on request', () => {
		const at = new Date(2026, 10, 5, 14, 30, 7);
		expect(formatRunTime(at.getTime(), now, true)).toBe(
			at.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', second: '2-digit' })
		);
	});

	it('marks yesterday', () => {
		const at = new Date(2026, 10, 4, 23, 59);
		expect(formatRunTime(at.getTime(), now)).toBe(`Yesterday ${time(at)}`);
	});

	it('adds the date for older runs and the year across years', () => {
		const at = new Date(2026, 10, 1, 9, 0);
		expect(formatRunTime(at.getTime(), now)).toMatch(/^Nov 1, /);
		const lastYear = new Date(2025, 10, 1, 9, 0);
		expect(formatRunTime(lastYear.getTime(), now)).toMatch(/2025/);
	});
});

describe('formatBytes', () => {
	it('picks a unit', () => {
		expect(formatBytes(512)).toBe('512 B');
		expect(formatBytes(2_048)).toBe('2.0 KB');
		expect(formatBytes(10 * 1024 * 1024)).toBe('10.0 MB');
	});
});
