import type { RunOutcome, RunRecord, RunTrigger } from './types';

export type BadgeVariant = 'default' | 'blue' | 'green' | 'amber' | 'red' | 'purple';

/** Milliseconds the run has taken so far, or took in total once finished. */
export function runDuration(run: RunRecord, now: number = Date.now()): number {
	return Math.max(0, (run.endedAt ?? now) - run.startedAt);
}

/** Short label and badge color for a run's result. A run with no outcome is still going. */
export function describeOutcome(run: Pick<RunRecord, 'outcome' | 'exitCode'>): {
	label: string;
	variant: BadgeVariant;
} {
	switch (run.outcome) {
		case 'success':
			return { label: 'EXIT 0', variant: 'green' };
		case 'failed':
			return { label: `EXIT ${run.exitCode ?? '?'}`, variant: 'red' };
		case 'stopped':
			return { label: 'STOPPED', variant: 'default' };
		case 'interrupted':
			return { label: 'INTERRUPTED', variant: 'amber' };
		default:
			return { label: 'RUNNING', variant: 'blue' };
	}
}

export function describeTrigger(trigger: RunTrigger): string {
	switch (trigger) {
		case 'scheduled':
			return 'Scheduled';
		case 'auto-restart':
			return 'Auto-restart';
		default:
			return 'Manual';
	}
}

export function isFailure(outcome: RunOutcome | undefined): boolean {
	return outcome === 'failed' || outcome === 'interrupted';
}

/**
 * Elapsed time with sub-second precision for quick jobs: "0.8s", "4.2s", "2m 5s", "3h 12m".
 */
export function formatDuration(ms: number): string {
	const clamped = Math.max(0, ms);
	if (clamped < 10_000) return `${(clamped / 1000).toFixed(1)}s`;
	const seconds = Math.floor(clamped / 1000);
	const minutes = Math.floor(seconds / 60);
	const hours = Math.floor(minutes / 60);
	const days = Math.floor(hours / 24);

	if (days > 0) return `${days}d ${hours % 24}h`;
	if (hours > 0) return `${hours}h ${minutes % 60}m`;
	if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
	return `${seconds}s`;
}

/**
 * "2:30 PM" for today, "Yesterday 2:30 PM", otherwise "Nov 3, 2:30 PM" (with the year if not
 * this year). Pass `seconds` to tell apart runs that started in the same minute.
 */
export function formatRunTime(timestamp: number, now: number = Date.now(), seconds = false): string {
	const date = new Date(timestamp);
	const today = new Date(now);
	const time = date.toLocaleTimeString([], {
		hour: 'numeric',
		minute: '2-digit',
		...(seconds ? { second: '2-digit' } : {})
	});

	if (isSameDay(date, today)) return time;
	const yesterday = new Date(today);
	yesterday.setDate(today.getDate() - 1);
	if (isSameDay(date, yesterday)) return `Yesterday ${time}`;

	const day = date.toLocaleDateString([], {
		month: 'short',
		day: 'numeric',
		...(date.getFullYear() !== today.getFullYear() ? { year: 'numeric' } : {})
	});
	return `${day}, ${time}`;
}

export function formatBytes(bytes: number): string {
	if (bytes < 1024) return `${bytes} B`;
	if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
	return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function isSameDay(a: Date, b: Date): boolean {
	return (
		a.getFullYear() === b.getFullYear() &&
		a.getMonth() === b.getMonth() &&
		a.getDate() === b.getDate()
	);
}
