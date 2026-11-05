import { contextBridge, ipcRenderer } from 'electron';

export interface Category {
	id: string;
	name: string;
	collapsed?: boolean;
}

export type Schedule =
	| { kind: 'interval'; minutes: number }
	| { kind: 'daily'; time: string };

export interface ProcessConfig {
	id: string;
	name: string;
	description: string;
	command: string;
	cwd: string;
	type: 'server' | 'job' | 'scheduled';
	autoRestart?: boolean;
	categoryId?: string;
	schedule?: Schedule;
}

export interface RunRecord {
	id: string;
	startedAt: number;
	endedAt?: number;
	exitCode?: number;
	outcome?: 'success' | 'failed' | 'stopped' | 'interrupted';
	trigger: 'manual' | 'scheduled' | 'auto-restart';
	bytes: number;
	truncated?: boolean;
}

export interface ProcessState {
	config: ProcessConfig;
	status: 'running' | 'stopped' | 'error';
	pid?: number;
	port?: number;
	startedAt?: number;
	stoppedAt?: number;
	nextRunAt?: number;
	lastRun?: RunRecord;
	runCount?: number;
	metrics: {
		cpu: number;
		memory: number;
		timestamp: number;
	}[];
}

const api = {
	// Process management
	listProcesses: (): Promise<ProcessState[]> => ipcRenderer.invoke('process:list'),
	addProcess: (config: ProcessConfig): Promise<{ success: boolean }> =>
		ipcRenderer.invoke('process:add', config),
	updateProcess: (config: ProcessConfig): Promise<{ success: boolean }> =>
		ipcRenderer.invoke('process:update', config),
	deleteProcess: (id: string): Promise<{ success: boolean }> =>
		ipcRenderer.invoke('process:delete', id),
	reorderProcesses: (orderedIds: string[]): Promise<{ success: boolean }> =>
		ipcRenderer.invoke('process:reorder', orderedIds),

	// Process control
	startProcess: (id: string): Promise<{ success: boolean; error?: string }> =>
		ipcRenderer.invoke('process:start', id),
	stopProcess: (id: string): Promise<{ success: boolean }> => ipcRenderer.invoke('process:stop', id),
	restartProcess: (id: string): Promise<{ success: boolean }> =>
		ipcRenderer.invoke('process:restart', id),

	// Terminal
	sendInput: (id: string, data: string): Promise<{ success: boolean }> =>
		ipcRenderer.invoke('process:input', id, data),
	resize: (id: string, cols: number, rows: number): Promise<{ success: boolean }> =>
		ipcRenderer.invoke('process:resize', id, cols, rows),
	getOutputBuffer: (id: string): Promise<string> =>
		ipcRenderer.invoke('process:output-buffer', id),

	// Metrics
	getMetrics: (id: string): Promise<{ cpu: number; memory: number; timestamp: number }[]> =>
		ipcRenderer.invoke('process:metrics', id),

	// System
	getListeningProcesses: (): Promise<{ pid: number; port: number; command: string; cwd: string }[]> =>
		ipcRenderer.invoke('system:listening-processes'),
	killProcess: (pid: number): Promise<{ success: boolean }> =>
		ipcRenderer.invoke('system:kill-process', pid),

	// Events
	onProcessOutput: (callback: (id: string, data: string) => void) => {
		const handler = (_event: Electron.IpcRendererEvent, id: string, data: string) =>
			callback(id, data);
		ipcRenderer.on('process:output', handler);
		return () => ipcRenderer.removeListener('process:output', handler);
	},
	onProcessExit: (callback: (id: string, exitCode: number) => void) => {
		const handler = (_event: Electron.IpcRendererEvent, id: string, exitCode: number) =>
			callback(id, exitCode);
		ipcRenderer.on('process:exit', handler);
		return () => ipcRenderer.removeListener('process:exit', handler);
	},
	onMetricsUpdate: (callback: (states: ProcessState[]) => void) => {
		const handler = (_event: Electron.IpcRendererEvent, states: ProcessState[]) => callback(states);
		ipcRenderer.on('metrics:update', handler);
		return () => ipcRenderer.removeListener('metrics:update', handler);
	},

	// Run history
	listRuns: (processId: string): Promise<RunRecord[]> => ipcRenderer.invoke('run:list', processId),
	getRunOutput: (processId: string, runId: string): Promise<string> =>
		ipcRenderer.invoke('run:output', processId, runId),
	clearRuns: (processId: string): Promise<{ success: boolean }> =>
		ipcRenderer.invoke('run:clear', processId),
	onRunUpdate: (callback: (processId: string) => void) => {
		const handler = (_event: Electron.IpcRendererEvent, processId: string) => callback(processId);
		ipcRenderer.on('run:update', handler);
		return () => ipcRenderer.removeListener('run:update', handler);
	},

	// Categories
	listCategories: (): Promise<Category[]> => ipcRenderer.invoke('category:list'),
	addCategory: (category: Category): Promise<{ success: boolean }> =>
		ipcRenderer.invoke('category:add', category),
	updateCategory: (category: Category): Promise<{ success: boolean }> =>
		ipcRenderer.invoke('category:update', category),
	deleteCategory: (id: string): Promise<{ success: boolean }> =>
		ipcRenderer.invoke('category:delete', id),
	reorderCategories: (orderedIds: string[]): Promise<{ success: boolean }> =>
		ipcRenderer.invoke('category:reorder', orderedIds)
};

contextBridge.exposeInMainWorld('nemo', api);
