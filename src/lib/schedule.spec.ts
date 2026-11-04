import { describe, expect, it } from 'vitest';
import { computeNextRun, describeSchedule, formatCountdown } from './schedule';

function local(y: number, mo: number, d: number, h: number, mi: number, s = 0): number {
	return new Date(y, mo - 1, d, h, mi, s).getTime();
}

describe('computeNextRun', () => {
	it('aligns interval runs to the local clock', () => {
		const now = local(2026, 11, 4, 10, 7, 30);
		expect(computeNextRun({ kind: 'interval', minutes: 5 }, now)).toBe(local(2026, 11, 4, 10, 10));
		expect(computeNextRun({ kind: 'interval', minutes: 60 }, now)).toBe(local(2026, 11, 4, 11, 0));
		expect(computeNextRun({ kind: 'interval', minutes: 3 }, now)).toBe(local(2026, 11, 4, 10, 9));
	});

	it('never returns the current instant for an interval', () => {
		const now = local(2026, 11, 4, 10, 10);
		expect(computeNextRun({ kind: 'interval', minutes: 5 }, now)).toBe(local(2026, 11, 4, 10, 15));
	});

	it('runs daily tasks later today when the time has not passed', () => {
		const now = local(2026, 11, 4, 8, 0);
		expect(computeNextRun({ kind: 'daily', time: '09:30' }, now)).toBe(local(2026, 11, 4, 9, 30));
	});

	it('rolls daily tasks to tomorrow once the time has passed', () => {
		const now = local(2026, 11, 4, 9, 30);
		expect(computeNextRun({ kind: 'daily', time: '09:30' }, now)).toBe(local(2026, 11, 5, 9, 30));
		expect(computeNextRun({ kind: 'daily', time: '00:00' }, now)).toBe(local(2026, 11, 5, 0, 0));
	});
});

describe('describeSchedule', () => {
	it('describes intervals', () => {
		expect(describeSchedule({ kind: 'interval', minutes: 5 })).toBe('Every 5 minutes');
		expect(describeSchedule({ kind: 'interval', minutes: 60 })).toBe('Every hour');
	});

	it('describes daily times', () => {
		expect(describeSchedule({ kind: 'daily', time: '09:30' })).toMatch(/^Daily at 9:30/);
	});
});

describe('formatCountdown', () => {
	it('picks the two most significant units', () => {
		expect(formatCountdown(45_000)).toBe('45s');
		expect(formatCountdown(4 * 60_000 + 12_000)).toBe('4m 12s');
		expect(formatCountdown(13 * 3_600_000 + 5 * 60_000)).toBe('13h 5m');
		expect(formatCountdown(-5)).toBe('0s');
	});
});
