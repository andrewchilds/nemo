export interface Category {
	id: string;
	name: string;
	/** Base directory. Processes in this category resolve a relative `cwd` against it. */
	cwd?: string;
	collapsed?: boolean;
}

export type ProcessType = 'server' | 'job' | 'scheduled';

/** When a scheduled task runs. Times are in the machine's local timezone. */
export type Schedule =
	| { kind: 'interval'; minutes: number }
	| { kind: 'daily'; time: string }; // "HH:MM", 24-hour

export interface ProcessConfig {
	id: string;
	name: string;
	description: string;
	command: string;
	/** Absolute path, or a path relative to the category's directory (empty = the category directory itself). */
	cwd: string;
	type: ProcessType;
	autoRestart?: boolean;
	port?: number;
	categoryId?: string;
	/** Required when type is 'scheduled'. */
	schedule?: Schedule;
}

export interface ProcessMetric {
	cpu: number;
	memory: number;
	timestamp: number;
}

export type RunTrigger = 'manual' | 'scheduled' | 'auto-restart';

/**
 * How a run ended. `stopped` means the user stopped it, `interrupted` means Nemo quit
 * while it was still running.
 */
export type RunOutcome = 'success' | 'failed' | 'stopped' | 'interrupted';

/** One recorded execution of a process. Output lives in `runs/<processId>/<id>.log`. */
export interface RunRecord {
	id: string;
	startedAt: number;
	/** Absent while the run is still going. */
	endedAt?: number;
	exitCode?: number;
	outcome?: RunOutcome;
	trigger: RunTrigger;
	/** Bytes of output written to the log file. */
	bytes: number;
	/** Set when output exceeded the per-run log cap and the rest was dropped. */
	truncated?: boolean;
}

export interface ProcessState {
	config: ProcessConfig;
	status: 'running' | 'stopped' | 'error';
	pid?: number;
	port?: number;
	startedAt?: number;
	stoppedAt?: number;
	/** Scheduled tasks only: epoch ms of the next automatic run. */
	nextRunAt?: number;
	/** The current run if running, otherwise the most recent recorded run. */
	lastRun?: RunRecord;
	/** Number of recorded runs, including the current one. */
	runCount?: number;
	metrics: ProcessMetric[];
}

export interface ListeningProcess {
	pid: number;
	port: number;
	command: string;
	cwd: string;
	conflictsWithProcessId?: string;
}

export interface NemoAPI {
	listProcesses: () => Promise<ProcessState[]>;
	addProcess: (config: ProcessConfig) => Promise<{ success: boolean }>;
	updateProcess: (config: ProcessConfig) => Promise<{ success: boolean }>;
	deleteProcess: (id: string) => Promise<{ success: boolean }>;
	reorderProcesses: (orderedIds: string[]) => Promise<{ success: boolean }>;
	startProcess: (id: string) => Promise<{ success: boolean; error?: string }>;
	stopProcess: (id: string) => Promise<{ success: boolean }>;
	restartProcess: (id: string) => Promise<{ success: boolean }>;
	sendInput: (id: string, data: string) => Promise<{ success: boolean }>;
	resize: (id: string, cols: number, rows: number) => Promise<{ success: boolean }>;
	getOutputBuffer: (id: string) => Promise<string>;
	getMetrics: (id: string) => Promise<ProcessMetric[]>;
	getListeningProcesses: () => Promise<ListeningProcess[]>;
	killProcess: (pid: number) => Promise<{ success: boolean }>;
	onProcessOutput: (callback: (id: string, data: string) => void) => () => void;
	onProcessExit: (callback: (id: string, exitCode: number) => void) => () => void;
	onMetricsUpdate: (callback: (states: ProcessState[]) => void) => () => void;
	// Run history
	listRuns: (processId: string) => Promise<RunRecord[]>;
	getRunOutput: (processId: string, runId: string) => Promise<string>;
	clearRuns: (processId: string) => Promise<{ success: boolean }>;
	onRunUpdate: (callback: (processId: string) => void) => () => void;
	// Categories
	listCategories: () => Promise<Category[]>;
	addCategory: (category: Category) => Promise<{ success: boolean }>;
	updateCategory: (category: Category) => Promise<{ success: boolean }>;
	deleteCategory: (id: string) => Promise<{ success: boolean }>;
	reorderCategories: (orderedIds: string[]) => Promise<{ success: boolean }>;
}

declare global {
	interface Window {
		nemo: NemoAPI;
	}
}
