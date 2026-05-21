import { app, BrowserWindow, ipcMain } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import { execSync } from 'child_process';
import serve from 'electron-serve';
import * as pty from 'node-pty';
import pidusage from 'pidusage';

const isDev = process.env.NODE_ENV === 'development';
const loadURL = serve({ directory: 'build' });

interface ProcessConfig {
	id: string;
	name: string;
	description: string;
	command: string;
	cwd: string;
	type: 'server' | 'job';
	autoRestart?: boolean;
	port?: number;
}

interface ProcessState {
	config: ProcessConfig;
	status: 'running' | 'stopped' | 'error';
	pid?: number;
	port?: number;
	startedAt?: number;
	stoppedAt?: number;
	metrics: {
		cpu: number;
		memory: number;
		timestamp: number;
	}[];
}

interface ManagedProcess {
	pty: pty.IPty;
	state: ProcessState;
	outputBuffer: string;
}

const DATA_DIR = path.join(app.getPath('userData'), 'nemo-data');
const CONFIG_FILE = path.join(DATA_DIR, 'processes.json');
const METRICS_FILE = path.join(DATA_DIR, 'metrics.json');
const PORT_HISTORY_FILE = path.join(DATA_DIR, 'port-history.json');

const processes = new Map<string, ManagedProcess>();
let mainWindow: BrowserWindow | null = null;

function ensureDataDirs() {
	if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
}

function loadProcessConfigs(): ProcessConfig[] {
	try {
		if (fs.existsSync(CONFIG_FILE)) {
			return JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf-8'));
		}
	} catch (e) {
		console.error('Failed to load process configs:', e);
	}
	return [];
}

function saveProcessConfigs(configs: ProcessConfig[]) {
	fs.writeFileSync(CONFIG_FILE, JSON.stringify(configs, null, 2));
}

function loadMetricsHistory(): Record<string, ProcessState['metrics']> {
	try {
		if (fs.existsSync(METRICS_FILE)) {
			return JSON.parse(fs.readFileSync(METRICS_FILE, 'utf-8'));
		}
	} catch (e) {
		console.error('Failed to load metrics:', e);
	}
	return {};
}

function saveMetricsHistory(metrics: Record<string, ProcessState['metrics']>) {
	fs.writeFileSync(METRICS_FILE, JSON.stringify(metrics, null, 2));
}

// Port history maps process config ID to the port it typically uses
function loadPortHistory(): Record<string, number> {
	try {
		if (fs.existsSync(PORT_HISTORY_FILE)) {
			return JSON.parse(fs.readFileSync(PORT_HISTORY_FILE, 'utf-8'));
		}
	} catch (e) {
		console.error('Failed to load port history:', e);
	}
	return {};
}

function savePortHistory(history: Record<string, number>) {
	fs.writeFileSync(PORT_HISTORY_FILE, JSON.stringify(history, null, 2));
}

function recordPortForProcess(processId: string, port: number) {
	const history = loadPortHistory();
	history[processId] = port;
	savePortHistory(history);

	// Also save the port to the process config so it persists
	const configs = loadProcessConfigs();
	const index = configs.findIndex(c => c.id === processId);
	if (index >= 0 && configs[index].port !== port) {
		configs[index].port = port;
		saveProcessConfigs(configs);
	}
}

function getKnownPorts(): number[] {
	const history = loadPortHistory();
	return Object.values(history);
}

function createWindow() {
	mainWindow = new BrowserWindow({
		width: 1400,
		height: 900,
		minWidth: 800,
		minHeight: 600,
		webPreferences: {
			preload: path.join(__dirname, 'preload.cjs'),
			contextIsolation: true,
			nodeIntegration: false
		},
		titleBarStyle: 'hiddenInset',
		trafficLightPosition: { x: 15, y: 10 }
	});

	if (isDev) {
		mainWindow.loadURL('http://localhost:5199');
		mainWindow.webContents.openDevTools();
	} else {
		loadURL(mainWindow);
	}
}

function startProcess(config: ProcessConfig): ManagedProcess | null {
	if (processes.has(config.id)) {
		const existing = processes.get(config.id)!;
		if (existing.state.status === 'running') {
			return existing;
		}
		// For jobs, remove the old process entry so we start fresh
		if (config.type === 'job') {
			processes.delete(config.id);
		}
	}

	const shell = process.platform === 'win32' ? 'powershell.exe' : process.env.SHELL || '/bin/zsh';

	try {
		// Use login shell (-l) to source shell profile and get proper PATH
		const ptyProcess = pty.spawn(shell, ['-l', '-c', config.command], {
			name: 'xterm-256color',
			cols: 120,
			rows: 30,
			cwd: config.cwd,
			env: { ...process.env, TERM: 'xterm-256color' }
		});

		const state: ProcessState = {
			config,
			status: 'running',
			pid: ptyProcess.pid,
			port: config.type === 'server' ? config.port : undefined,
			startedAt: Date.now(),
			metrics: []
		};

		const managed: ManagedProcess = {
			pty: ptyProcess,
			state,
			outputBuffer: ''
		};

		ptyProcess.onData((data) => {
			// Keep last 100KB of output in buffer
			managed.outputBuffer += data;
			if (managed.outputBuffer.length > 100000) {
				managed.outputBuffer = managed.outputBuffer.slice(-100000);
			}
			// Try to detect port from new output if not already set (only for servers)
			if (!managed.state.port && config.type === 'server') {
				const detectedPort = detectPortFromOutput(data);
				if (detectedPort) {
					managed.state.port = detectedPort;
					managed.state.config.port = detectedPort;
					recordPortForProcess(config.id, detectedPort);
				}
			}
			mainWindow?.webContents.send('process:output', config.id, data);
		});

		ptyProcess.onExit(({ exitCode }) => {
			managed.state.status = exitCode === 0 ? 'stopped' : 'error';
			managed.state.pid = undefined;
			managed.state.stoppedAt = Date.now();
			mainWindow?.webContents.send('process:exit', config.id, exitCode);

			if (config.autoRestart && config.type === 'server' && exitCode !== 0) {
				setTimeout(() => startProcess(config), 3000);
			}
		});

		processes.set(config.id, managed);
		return managed;
	} catch (e) {
		console.error('Failed to start process:', e);
		return null;
	}
}

function stopProcess(id: string): boolean {
	const managed = processes.get(id);
	if (!managed || managed.state.status !== 'running') return false;

	try {
		managed.pty.kill();
		managed.state.status = 'stopped';
		managed.state.pid = undefined;
		managed.state.stoppedAt = Date.now();
		return true;
	} catch (e) {
		console.error('Failed to stop process:', e);
		return false;
	}
}

function detectPortFromOutput(output: string): number | undefined {
	// Strip ANSI escape codes for cleaner matching
	const cleanOutput = output.replace(/\x1b\[[0-9;]*m/g, '');

	// Common patterns dev servers use to announce their port
	const patterns = [
		/https?:\/\/(?:localhost|127\.0\.0\.1|0\.0\.0\.0):(\d{4})\b/i,
		/(?:localhost|127\.0\.0\.1|0\.0\.0\.0):(\d{4})\b/i,
		/listening (?:on|at)[:\s]*(\d{4})\b/i,
		/server (?:running|started) (?:on|at)[:\s]*(?:port\s*)?(\d{4})\b/i,
		/port[:\s]+(\d{4})\b/i,
	];

	for (const pattern of patterns) {
		const match = cleanOutput.match(pattern);
		if (match && match[1]) {
			return parseInt(match[1], 10);
		}
	}
	return undefined;
}

function getChildPids(parentPid: number): number[] {
	try {
		// Get all child processes of the parent PID
		const output = execSync(`pgrep -P ${parentPid} 2>/dev/null || true`, {
			encoding: 'utf-8'
		}).trim();
		if (!output) return [];
		return output.split('\n').map(p => parseInt(p, 10)).filter(p => !isNaN(p));
	} catch {
		return [];
	}
}

function getAllDescendantPids(pid: number): number[] {
	const descendants: number[] = [];
	const toCheck = [pid];

	while (toCheck.length > 0) {
		const current = toCheck.pop()!;
		const children = getChildPids(current);
		for (const child of children) {
			descendants.push(child);
			toCheck.push(child);
		}
	}

	return descendants;
}

async function collectMetrics() {
	const metricsHistory = loadMetricsHistory();

	for (const [id, managed] of processes) {
		if (managed.state.status === 'running' && managed.state.pid) {
			try {
				// Get the pty process and all its descendants
				const allPids = [managed.state.pid, ...getAllDescendantPids(managed.state.pid)];

				// Collect metrics for all processes in the tree
				const allStats = await pidusage(allPids);

				// Sum up CPU and memory across all processes
				let totalCpu = 0;
				let totalMemory = 0;

				for (const pid of allPids) {
					const stats = allStats[pid];
					if (stats) {
						totalCpu += stats.cpu;
						totalMemory += stats.memory;
					}
				}

				const metric = {
					cpu: totalCpu,
					memory: totalMemory,
					timestamp: Date.now()
				};
				managed.state.metrics.push(metric);
				if (managed.state.metrics.length > 360) {
					managed.state.metrics = managed.state.metrics.slice(-360);
				}

				// Detect port from output buffer if not already set (only for servers)
				if (!managed.state.port && managed.state.config.type === 'server') {
					const detectedPort = detectPortFromOutput(managed.outputBuffer);
					if (detectedPort) {
						managed.state.port = detectedPort;
						managed.state.config.port = detectedPort;
						recordPortForProcess(id, detectedPort);
					}
				}

				if (!metricsHistory[id]) metricsHistory[id] = [];
				metricsHistory[id].push(metric);
				if (metricsHistory[id].length > 1000) {
					metricsHistory[id] = metricsHistory[id].slice(-1000);
				}
			} catch {
				// Process may have exited
			}
		}
	}

	saveMetricsHistory(metricsHistory);
	mainWindow?.webContents.send('metrics:update', getProcessStates());
}

function getProcessStates(): ProcessState[] {
	return Array.from(processes.values()).map((p) => p.state);
}

// IPC Handlers
ipcMain.handle('process:list', () => {
	const configs = loadProcessConfigs();
	const states: ProcessState[] = [];

	for (const config of configs) {
		const managed = processes.get(config.id);
		if (managed) {
			states.push(managed.state);
		} else {
			states.push({
				config,
				status: 'stopped',
				metrics: []
			});
		}
	}
	return states;
});

ipcMain.handle('process:add', (_event, config: ProcessConfig) => {
	const configs = loadProcessConfigs();
	configs.push(config);
	saveProcessConfigs(configs);
	return { success: true };
});

ipcMain.handle('process:update', (_event, config: ProcessConfig) => {
	const configs = loadProcessConfigs();
	const index = configs.findIndex((c) => c.id === config.id);
	if (index >= 0) {
		configs[index] = config;
		saveProcessConfigs(configs);
		const managed = processes.get(config.id);
		if (managed) {
			managed.state.config = config;
			// Update the runtime port state if port was manually set (servers only)
			if (config.type === 'server' && config.port !== undefined) {
				managed.state.port = config.port;
				recordPortForProcess(config.id, config.port);
			}
		}
		// Also update port history even if not currently running (servers only)
		if (config.type === 'server' && config.port !== undefined) {
			recordPortForProcess(config.id, config.port);
		}
	}
	return { success: true };
});

ipcMain.handle('process:delete', (_event, id: string) => {
	stopProcess(id);
	const configs = loadProcessConfigs();
	const filtered = configs.filter((c) => c.id !== id);
	saveProcessConfigs(filtered);
	processes.delete(id);
	return { success: true };
});

ipcMain.handle('process:reorder', (_event, orderedIds: string[]) => {
	const configs = loadProcessConfigs();
	const reordered = orderedIds
		.map((id) => configs.find((c) => c.id === id))
		.filter((c): c is ProcessConfig => c !== undefined);
	saveProcessConfigs(reordered);
	return { success: true };
});

ipcMain.handle('process:start', (_event, id: string) => {
	const configs = loadProcessConfigs();
	const config = configs.find((c) => c.id === id);
	if (!config) return { success: false, error: 'Process not found' };

	const managed = startProcess(config);
	return { success: !!managed };
});

ipcMain.handle('process:stop', (_event, id: string) => {
	return { success: stopProcess(id) };
});

ipcMain.handle('process:restart', async (_event, id: string) => {
	stopProcess(id);
	await new Promise((r) => setTimeout(r, 500));
	const configs = loadProcessConfigs();
	const config = configs.find((c) => c.id === id);
	if (!config) return { success: false };
	return { success: !!startProcess(config) };
});

ipcMain.handle('process:input', (_event, id: string, data: string) => {
	const managed = processes.get(id);
	if (managed && managed.state.status === 'running') {
		managed.pty.write(data);
		return { success: true };
	}
	return { success: false };
});

ipcMain.handle('process:resize', (_event, id: string, cols: number, rows: number) => {
	const managed = processes.get(id);
	if (managed && managed.state.status === 'running') {
		managed.pty.resize(cols, rows);
		return { success: true };
	}
	return { success: false };
});

ipcMain.handle('process:metrics', (_event, id: string) => {
	const metricsHistory = loadMetricsHistory();
	return metricsHistory[id] || [];
});

ipcMain.handle('process:output-buffer', (_event, id: string) => {
	const managed = processes.get(id);
	return managed?.outputBuffer || '';
});

interface ListeningProcess {
	pid: number;
	port: number;
	command: string;
	cwd: string;
	conflictsWithProcessId?: string;
}

ipcMain.handle('system:listening-processes', async (): Promise<ListeningProcess[]> => {
	try {
		// Get processes listening on ports 5000-6000
		const lsofOutput = execSync(
			'lsof -iTCP:5000-6000 -sTCP:LISTEN -n -P 2>/dev/null || true',
			{ encoding: 'utf-8' }
		).trim();

		if (!lsofOutput) return [];

		const lines = lsofOutput.split('\n').slice(1); // Skip header
		const seen = new Set<number>();
		const results: ListeningProcess[] = [];

		for (const line of lines) {
			const parts = line.split(/\s+/);
			if (parts.length < 9) continue;

			const pid = parseInt(parts[1], 10);
			if (isNaN(pid) || seen.has(pid)) continue;
			seen.add(pid);

			// Extract port from the NAME column (e.g., "*:5173" or "127.0.0.1:5000")
			const nameCol = parts[8];
			const portMatch = nameCol.match(/:(\d+)$/);
			if (!portMatch) continue;
			const port = parseInt(portMatch[1], 10);

			// Skip processes managed by Nemo
			let isManaged = false;
			for (const [, managed] of processes) {
				if (managed.state.pid === pid || getAllDescendantPids(managed.state.pid!).includes(pid)) {
					isManaged = true;
					break;
				}
			}
			if (isManaged) continue;

			// Get command and cwd for this process
			let command = parts[0];
			let cwd = '';
			try {
				command = execSync(`ps -p ${pid} -o command= 2>/dev/null || true`, { encoding: 'utf-8' }).trim();
				cwd = execSync(`lsof -p ${pid} -Fn 2>/dev/null | grep '^n/' | grep 'cwd' | head -1 | cut -c2- || true`, { encoding: 'utf-8' }).trim();
				if (!cwd) {
					// Fallback: try to get cwd via pwdx or /proc on Linux, or lsof on macOS
					cwd = execSync(`lsof -p ${pid} 2>/dev/null | awk '$4=="cwd" {print $9}' || true`, { encoding: 'utf-8' }).trim();
				}
			} catch {
				// Ignore errors
			}

			// Check if this port conflicts with a known Nemo server process port (skip jobs)
			const portHistory = loadPortHistory();
			const configs = loadProcessConfigs();
			let conflictsWithProcessId: string | undefined;
			for (const [processId, knownPort] of Object.entries(portHistory)) {
				if (knownPort === port) {
					// Only flag as conflict if the process is a server, not a job
					const processConfig = configs.find(c => c.id === processId);
					if (processConfig && processConfig.type === 'server') {
						conflictsWithProcessId = processId;
						break;
					}
				}
			}

			results.push({ pid, port, command, cwd, conflictsWithProcessId });
		}

		return results;
	} catch {
		return [];
	}
});

ipcMain.handle('system:kill-process', async (_event, pid: number): Promise<{ success: boolean }> => {
	try {
		process.kill(pid, 'SIGTERM');
		return { success: true };
	} catch {
		return { success: false };
	}
});

app.whenReady().then(() => {
	ensureDataDirs();
	createWindow();

	setInterval(collectMetrics, 5000);

	app.on('activate', () => {
		if (BrowserWindow.getAllWindows().length === 0) {
			createWindow();
		}
	});
});

app.on('window-all-closed', () => {
	for (const [, managed] of processes) {
		try {
			managed.pty.kill();
		} catch {
			// Ignore
		}
	}
	if (process.platform !== 'darwin') {
		app.quit();
	}
});
