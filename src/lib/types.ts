export interface ProcessConfig {
	id: string;
	name: string;
	description: string;
	command: string;
	cwd: string;
	type: 'server' | 'job';
	autoRestart?: boolean;
}

export interface ProcessMetric {
	cpu: number;
	memory: number;
	timestamp: number;
}

export interface ProcessState {
	config: ProcessConfig;
	status: 'running' | 'stopped' | 'error';
	pid?: number;
	port?: number;
	startedAt?: number;
	stoppedAt?: number;
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
}

declare global {
	interface Window {
		nemo: NemoAPI;
	}
}
