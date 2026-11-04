import type { Schedule } from './types';

/** Interval choices offered in the process form, in minutes. */
export const INTERVAL_OPTIONS = [2, 3, 5, 10, 15, 30, 60];

/**
 * Epoch ms of the next run strictly after `now`, in the local timezone.
 * Interval schedules align to the local clock (every 5 minutes runs at :00, :05, :10, ...).
 * Mirrors computeNextRun in electron/main.ts.
 */
export function computeNextRun(schedule: Schedule, now: number = Date.now()): number {
	if (schedule.kind === 'daily') {
		const [hours, minutes] = parseTime(schedule.time);
		const next = new Date(now);
		next.setHours(hours, minutes, 0, 0);
		if (next.getTime() <= now) {
			next.setDate(next.getDate() + 1);
			next.setHours(hours, minutes, 0, 0);
		}
		return next.getTime();
	}

	const intervalMs = Math.max(1, Math.round(schedule.minutes)) * 60_000;
	const startOfDay = new Date(now);
	startOfDay.setHours(0, 0, 0, 0);
	const elapsed = now - startOfDay.getTime();
	return startOfDay.getTime() + (Math.floor(elapsed / intervalMs) + 1) * intervalMs;
}

/** Human-readable summary, e.g. "Every 5 minutes" or "Daily at 9:00 AM". */
export function describeSchedule(schedule: Schedule): string {
	if (schedule.kind === 'daily') {
		return `Daily at ${formatTimeOfDay(schedule.time)}`;
	}
	if (schedule.minutes === 60) return 'Every hour';
	if (schedule.minutes === 1) return 'Every minute';
	return `Every ${schedule.minutes} minutes`;
}

/** Format a "HH:MM" string using the locale's time format. */
export function formatTimeOfDay(time: string): string {
	const [hours, minutes] = parseTime(time);
	const date = new Date();
	date.setHours(hours, minutes, 0, 0);
	return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

/** Short countdown like "4m 12s" or "13h 5m". */
export function formatCountdown(ms: number): string {
	const seconds = Math.max(0, Math.floor(ms / 1000));
	const minutes = Math.floor(seconds / 60);
	const hours = Math.floor(minutes / 60);
	const days = Math.floor(hours / 24);

	if (days > 0) return `${days}d ${hours % 24}h`;
	if (hours > 0) return `${hours}h ${minutes % 60}m`;
	if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
	return `${seconds}s`;
}

function parseTime(time: string): [number, number] {
	const [h, m] = time.split(':').map((part) => parseInt(part, 10));
	return [Number.isFinite(h) ? h : 0, Number.isFinite(m) ? m : 0];
}
