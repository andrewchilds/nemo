import { app, BrowserWindow, ipcMain, Menu, nativeImage, Notification, Tray, type MenuItemConstructorOptions } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { execSync } from 'child_process';
import serve from 'electron-serve';
import * as pty from 'node-pty';
import pidusage from 'pidusage';

const isDev = process.env.NODE_ENV === 'development';
const loadURL = serve({ directory: 'build' });
const ANSI_COLOR_PATTERN = new RegExp(String.raw`\x1b\[[0-9;]*m`, 'g');
const MACOS_DEFAULT_PATH_SEGMENTS = [
	'/opt/homebrew/bin',
	'/opt/homebrew/sbin',
	'/usr/local/bin',
	'/usr/local/sbin',
	'/usr/bin',
	'/bin',
	'/usr/sbin',
	'/sbin'
];

interface Category {
	id: string;
	name: string;
	cwd?: string;
	collapsed?: boolean;
}

type ProcessType = 'server' | 'job' | 'scheduled';

type Schedule =
	| { kind: 'interval'; minutes: number }
	| { kind: 'daily'; time: string }; // "HH:MM" local time

interface ProcessConfig {
	id: string;
	name: string;
	description: string;
	command: string;
	cwd: string;
	type: ProcessType;
	autoRestart?: boolean;
	port?: number;
	categoryId?: string;
	schedule?: Schedule;
}

type RunTrigger = 'manual' | 'scheduled' | 'auto-restart';
type RunOutcome = 'success' | 'failed' | 'stopped' | 'interrupted';

// Mirrors RunRecord in src/lib/types.ts
interface RunRecord {
	id: string;
	startedAt: number;
	endedAt?: number;
	exitCode?: number;
	outcome?: RunOutcome;
	trigger: RunTrigger;
	bytes: number;
	truncated?: boolean;
}

interface ProcessState {
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

interface ManagedProcess {
	pty: pty.IPty;
	state: ProcessState;
	outputBuffer: string;
	run: RunRecord;
	logStream: fs.WriteStream | null;
	// Set by stopProcess so onExit can tell a user stop from a crash
	stopRequested: boolean;
}

const DATA_DIR = path.join(app.getPath('userData'), 'nemo-data');
const CONFIG_FILE = path.join(DATA_DIR, 'processes.json');
const CATEGORIES_FILE = path.join(DATA_DIR, 'categories.json');
const METRICS_FILE = path.join(DATA_DIR, 'metrics.json');
const PORT_HISTORY_FILE = path.join(DATA_DIR, 'port-history.json');
// Run history: runs/<processId>/index.json plus one <runId>.log per run
const RUNS_DIR = path.join(DATA_DIR, 'runs');
const MAX_RUNS_PER_PROCESS = 100;
const MAX_RUN_LOG_BYTES = 10 * 1024 * 1024;

const processes = new Map<string, ManagedProcess>();
// Process config ID -> its run index, oldest first. Loaded lazily from disk.
const runIndexes = new Map<string, RunRecord[]>();
// Scheduled task ID -> epoch ms of its next automatic run
const nextRuns = new Map<string, number>();
let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let isQuitting = false;

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

function loadCategories(): Category[] {
	try {
		if (fs.existsSync(CATEGORIES_FILE)) {
			return JSON.parse(fs.readFileSync(CATEGORIES_FILE, 'utf-8'));
		}
	} catch (e) {
		console.error('Failed to load categories:', e);
	}
	return [];
}

function saveCategories(categories: Category[]) {
	fs.writeFileSync(CATEGORIES_FILE, JSON.stringify(categories, null, 2));
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

// --- Run history ---------------------------------------------------------------

function runDir(processId: string): string {
	return path.join(RUNS_DIR, processId);
}

function runLogPath(processId: string, runId: string): string {
	return path.join(runDir(processId), `${runId}.log`);
}

function runIndexPath(processId: string): string {
	return path.join(runDir(processId), 'index.json');
}

function loadRunIndex(processId: string): RunRecord[] {
	const cached = runIndexes.get(processId);
	if (cached) return cached;
	let runs: RunRecord[] = [];
	try {
		const file = runIndexPath(processId);
		if (fs.existsSync(file)) {
			runs = JSON.parse(fs.readFileSync(file, 'utf-8'));
		}
	} catch (e) {
		console.error('Failed to load run index:', e);
	}
	runIndexes.set(processId, runs);
	return runs;
}

function saveRunIndex(processId: string, runs: RunRecord[]) {
	runIndexes.set(processId, runs);
	try {
		fs.mkdirSync(runDir(processId), { recursive: true });
		fs.writeFileSync(runIndexPath(processId), JSON.stringify(runs, null, 2));
	} catch (e) {
		console.error('Failed to save run index:', e);
	}
}

function deleteRunLog(processId: string, runId: string) {
	try {
		fs.rmSync(runLogPath(processId, runId), { force: true });
	} catch (e) {
		console.error('Failed to delete run log:', e);
	}
}

function notifyRunUpdate(processId: string) {
	mainWindow?.webContents.send('run:update', processId);
}

// Register a new run, prune history to the cap, and open its log file for writing.
function beginRun(config: ProcessConfig, trigger: RunTrigger, startedAt: number): {
	run: RunRecord;
	logStream: fs.WriteStream | null;
} {
	const run: RunRecord = {
		id: new Date(startedAt).toISOString().replace(/:/g, '-'),
		startedAt,
		trigger,
		bytes: 0
	};

	const runs = loadRunIndex(config.id);
	while (runs.length >= MAX_RUNS_PER_PROCESS) {
		const oldest = runs.shift();
		if (oldest) deleteRunLog(config.id, oldest.id);
	}
	runs.push(run);
	saveRunIndex(config.id, runs);

	let logStream: fs.WriteStream | null = null;
	try {
		logStream = fs.createWriteStream(runLogPath(config.id, run.id));
		logStream.on('error', (e) => console.error('Run log write failed:', e));
	} catch (e) {
		console.error('Failed to open run log:', e);
	}

	notifyRunUpdate(config.id);
	return { run, logStream };
}

// Append output to the run's log until it hits the size cap, then drop the rest.
function appendRunOutput(managed: ManagedProcess, data: string) {
	if (!managed.logStream) return;
	const chunk = Buffer.from(data, 'utf-8');
	const remaining = MAX_RUN_LOG_BYTES - managed.run.bytes;
	if (chunk.length >= remaining) {
		managed.logStream.write(chunk.subarray(0, remaining));
		managed.run.bytes += remaining;
		managed.run.truncated = true;
		managed.logStream.end();
		managed.logStream = null;
		return;
	}
	managed.logStream.write(chunk);
	managed.run.bytes += chunk.length;
}

function finishRun(managed: ManagedProcess, exitCode: number, endedAt: number) {
	const { run, state } = managed;
	run.endedAt = endedAt;
	run.exitCode = exitCode;
	run.outcome = managed.stopRequested ? 'stopped' : exitCode === 0 ? 'success' : 'failed';
	managed.logStream?.end();
	managed.logStream = null;
	saveRunIndex(state.config.id, loadRunIndex(state.config.id));
	notifyRunUpdate(state.config.id);
}

// Runs left open by a previous Nemo session can never finish; mark them interrupted.
function markInterruptedRuns() {
	if (!fs.existsSync(RUNS_DIR)) return;
	for (const processId of fs.readdirSync(RUNS_DIR)) {
		const runs = loadRunIndex(processId);
		let modified = false;
		for (const run of runs) {
			if (run.endedAt !== undefined) continue;
			let endedAt = run.startedAt;
			try {
				endedAt = Math.max(endedAt, fs.statSync(runLogPath(processId, run.id)).mtimeMs);
			} catch {
				// Log may be missing
			}
			run.endedAt = endedAt;
			run.outcome = 'interrupted';
			modified = true;
		}
		if (modified) saveRunIndex(processId, runs);
	}
}

function deleteRunHistory(processId: string) {
	runIndexes.delete(processId);
	try {
		fs.rmSync(runDir(processId), { recursive: true, force: true });
	} catch (e) {
		console.error('Failed to delete run history:', e);
	}
}

function createTrayStatusIcon(isRunning: boolean) {
	const fill = isRunning ? '#30d158' : '#8e8e93';
	const svg = `
		<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 18 18">
			<circle cx="9" cy="9" r="4.5" fill="${fill}"/>
		</svg>
	`;
	const icon = nativeImage.createFromDataURL(
		`data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`
	);
	return icon;
}

function getRunningProcesses(): ManagedProcess[] {
	return Array.from(processes.values()).filter((managed) => (
		managed.state.status === 'running'
	));
}

function showMainWindow() {
	if (!mainWindow || mainWindow.isDestroyed()) {
		createWindow();
		return;
	}
	mainWindow.show();
	if (process.platform === 'darwin') {
		app.dock?.show();
	}
	mainWindow.focus();
}

function updateTray() {
	if (process.platform !== 'darwin') return;

	const runningProcesses = getRunningProcesses();
	const totalProcesses = loadProcessConfigs().length;
	const count = runningProcesses.length;
	const processLabel = count === 1 ? 'process' : 'processes';
	const countLabel = count > 99 ? '99+' : String(count);
	app.dock?.setBadge(count > 0 ? countLabel : '');

	if (!tray) return;

	const processItems: MenuItemConstructorOptions[] = runningProcesses.map((managed) => {
		const port = managed.state.port ?? managed.state.config.port;
		return {
			label: `${managed.state.config.name}${port ? ` :${port}` : ''}`,
			enabled: false
		};
	});
	const template: MenuItemConstructorOptions[] = [
		{
			label: `${count} of ${totalProcesses} ${totalProcesses === 1 ? 'process' : 'processes'} running`,
			enabled: false
		},
		...(processItems.length > 0
			? [
					{ type: 'separator' as const },
					...processItems
				]
			: []),
		{ type: 'separator' },
		{
			label: mainWindow?.isVisible() ? 'Hide Nemo' : 'Show Nemo',
			click: () => {
				if (mainWindow?.isVisible()) {
					mainWindow.hide();
				} else {
					showMainWindow();
				}
				updateTray();
			}
		},
		{
			label: 'Quit Nemo',
			accelerator: 'Command+Q',
			click: () => {
				isQuitting = true;
				app.quit();
			}
		}
	];

	tray.setImage(createTrayStatusIcon(count > 0));
	tray.setTitle(countLabel);
	tray.setToolTip(`Nemo: ${count} ${processLabel} running`);
	tray.setContextMenu(Menu.buildFromTemplate(template));
}

// Jobs and once-a-day scheduled tasks notify when they finish. Interval tasks run
// too often to be worth a notification each time.
function shouldNotifyOnExit(config: ProcessConfig): boolean {
	if (config.type === 'job') return true;
	if (config.type === 'scheduled') return config.schedule?.kind === 'daily';
	return false;
}

function showTaskFinishedNotification(config: ProcessConfig, exitCode: number) {
	if (!shouldNotifyOnExit(config) || !Notification.isSupported()) return;

	const succeeded = exitCode === 0;
	const notification = new Notification({
		title: succeeded ? 'Task finished' : 'Task failed',
		body: `${config.name} ${succeeded ? 'completed successfully.' : `exited with code ${exitCode}.`}`,
		silent: false
	});

	notification.on('click', () => {
		showMainWindow();
	});

	notification.show();
}

function createTray() {
	if (process.platform !== 'darwin' || tray) return;

	tray = new Tray(createTrayStatusIcon(false));
	tray.on('click', () => {
		showMainWindow();
		updateTray();
	});
	updateTray();
}

function getManagedProcessEnv(): NodeJS.ProcessEnv {
	const existingPath = process.env.PATH?.split(path.delimiter).filter(Boolean) ?? [];
	const pathSegments = process.platform === 'darwin'
		? [...MACOS_DEFAULT_PATH_SEGMENTS, ...existingPath]
		: existingPath;

	return {
		...process.env,
		PATH: Array.from(new Set(pathSegments)).join(path.delimiter),
		TERM: 'xterm-256color'
	};
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

	mainWindow.on('close', (event) => {
		if (process.platform === 'darwin' && !isQuitting) {
			event.preventDefault();
			mainWindow?.hide();
			updateTray();
		}
	});

	mainWindow.on('closed', () => {
		mainWindow = null;
		updateTray();
	});

	if (isDev) {
		mainWindow.loadURL('http://localhost:5199');
		mainWindow.webContents.openDevTools();
	} else {
		loadURL(mainWindow);
	}
}

function expandHome(p: string): string {
	if (p === '~') return os.homedir();
	if (p.startsWith('~/')) return path.join(os.homedir(), p.slice(2));
	return p;
}

// Resolve the directory a process should run in. An absolute cwd is used as-is;
// a relative (or empty) cwd is resolved against the category's directory when it has one.
function resolveProcessCwd(config: ProcessConfig): string {
	const cwd = expandHome(config.cwd.trim());
	if (path.isAbsolute(cwd)) return cwd;
	const category = config.categoryId
		? loadCategories().find((c) => c.id === config.categoryId)
		: undefined;
	const base = category?.cwd ? expandHome(category.cwd.trim()) : '';
	if (base) return path.resolve(base, cwd);
	return cwd ? path.resolve(os.homedir(), cwd) : os.homedir();
}

function parseTime(time: string): [number, number] {
	const [h, m] = time.split(':').map((part) => parseInt(part, 10));
	return [Number.isFinite(h) ? h : 0, Number.isFinite(m) ? m : 0];
}

// Epoch ms of the next run strictly after `now`, in local time. Interval schedules
// align to the local clock (every 5 minutes runs at :00, :05, :10, ...).
// Mirrors computeNextRun in src/lib/schedule.ts.
function computeNextRun(schedule: Schedule, now: number = Date.now()): number {
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

// (Re)compute the next run for one config, or drop it if it is no longer scheduled.
function scheduleProcess(config: ProcessConfig) {
	if (config.type === 'scheduled' && config.schedule) {
		nextRuns.set(config.id, computeNextRun(config.schedule));
	} else {
		nextRuns.delete(config.id);
	}
}

function scheduleAllProcesses() {
	nextRuns.clear();
	for (const config of loadProcessConfigs()) {
		scheduleProcess(config);
	}
}

// Called every second. Starts any scheduled task whose time has come, skipping a run
// if the previous one is still going. After sleep/wake a missed task runs once.
function runDueScheduledTasks() {
	const now = Date.now();
	let configs: ProcessConfig[] | null = null;

	for (const [id, dueAt] of nextRuns) {
		if (dueAt > now) continue;
		configs ??= loadProcessConfigs();
		const config = configs.find((c) => c.id === id);
		if (!config || config.type !== 'scheduled' || !config.schedule) {
			nextRuns.delete(id);
			continue;
		}
		nextRuns.set(id, computeNextRun(config.schedule, now));
		if (processes.get(id)?.state.status === 'running') continue;
		startProcess(config, 'scheduled');
	}
}

function startProcess(config: ProcessConfig, trigger: RunTrigger = 'manual'): ManagedProcess | null {
	if (processes.has(config.id)) {
		const existing = processes.get(config.id)!;
		if (existing.state.status === 'running') {
			return existing;
		}
		// For jobs and scheduled tasks, remove the old process entry so we start fresh
		if (config.type !== 'server') {
			processes.delete(config.id);
		}
	}

	const shell = process.platform === 'win32' ? 'powershell.exe' : process.env.SHELL || '/bin/zsh';
	const shellArgs = process.platform === 'win32'
		? ['-Command', config.command]
		: ['-l', '-i', '-c', config.command];

	try {
		// Use an interactive login shell so Finder-launched builds can load shell-managed tools.
		const ptyProcess = pty.spawn(shell, shellArgs, {
			name: 'xterm-256color',
			cols: 120,
			rows: 30,
			cwd: resolveProcessCwd(config),
			env: getManagedProcessEnv()
		});

		const startedAt = Date.now();
		const state: ProcessState = {
			config,
			status: 'running',
			pid: ptyProcess.pid,
			port: config.type === 'server' ? config.port : undefined,
			startedAt,
			metrics: []
		};

		const { run, logStream } = beginRun(config, trigger, startedAt);
		const managed: ManagedProcess = {
			pty: ptyProcess,
			state,
			outputBuffer: '',
			run,
			logStream,
			stopRequested: false
		};

		ptyProcess.onData((data) => {
			// Keep last 100KB of output in buffer
			managed.outputBuffer += data;
			if (managed.outputBuffer.length > 100000) {
				managed.outputBuffer = managed.outputBuffer.slice(-100000);
			}
			appendRunOutput(managed, data);
			// Try to detect port from new output if not already set (only for servers)
			if (!managed.state.port && config.type === 'server') {
				const detectedPort = detectPortFromOutput(data);
				if (detectedPort) {
					managed.state.port = detectedPort;
					managed.state.config.port = detectedPort;
					recordPortForProcess(config.id, detectedPort);
					updateTray();
				}
			}
			mainWindow?.webContents.send('process:output', config.id, data);
		});

		ptyProcess.onExit(({ exitCode }) => {
			const endedAt = Date.now();
			managed.state.status = exitCode === 0 || managed.stopRequested ? 'stopped' : 'error';
			managed.state.pid = undefined;
			managed.state.stoppedAt = endedAt;
			finishRun(managed, exitCode, endedAt);
			if (!managed.stopRequested) showTaskFinishedNotification(config, exitCode);
			mainWindow?.webContents.send('process:exit', config.id, exitCode);
			updateTray();

			if (config.autoRestart && config.type === 'server' && exitCode !== 0 && !managed.stopRequested) {
				setTimeout(() => startProcess(config, 'auto-restart'), 3000);
			}
		});

		processes.set(config.id, managed);
		updateTray();
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
		managed.stopRequested = true;
		managed.pty.kill();
		managed.state.status = 'stopped';
		managed.state.pid = undefined;
		managed.state.stoppedAt = Date.now();
		updateTray();
		return true;
	} catch (e) {
		console.error('Failed to stop process:', e);
		return false;
	}
}

function detectPortFromOutput(output: string): number | undefined {
	// Strip ANSI escape codes for cleaner matching
	const cleanOutput = output.replace(ANSI_COLOR_PATTERN, '');

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
						updateTray();
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
	updateTray();
}

function withRuntimeInfo(state: ProcessState): ProcessState {
	const id = state.config.id;
	state.nextRunAt = nextRuns.get(id);
	const runs = loadRunIndex(id);
	state.lastRun = runs[runs.length - 1];
	state.runCount = runs.length;
	return state;
}

function getProcessStates(): ProcessState[] {
	return Array.from(processes.values()).map((p) => withRuntimeInfo(p.state));
}

// IPC Handlers
ipcMain.handle('process:list', () => {
	const configs = loadProcessConfigs();
	const states: ProcessState[] = [];

	for (const config of configs) {
		const managed = processes.get(config.id);
		if (managed) {
			states.push(withRuntimeInfo(managed.state));
		} else {
			states.push(withRuntimeInfo({
				config,
				status: 'stopped',
				metrics: []
			}));
		}
	}
	return states;
});

ipcMain.handle('process:add', (_event, config: ProcessConfig) => {
	const configs = loadProcessConfigs();
	configs.push(config);
	saveProcessConfigs(configs);
	scheduleProcess(config);
	updateTray();
	return { success: true };
});

ipcMain.handle('process:update', (_event, config: ProcessConfig) => {
	const configs = loadProcessConfigs();
	const index = configs.findIndex((c) => c.id === config.id);
	if (index >= 0) {
		const previous = configs[index];
		configs[index] = config;
		saveProcessConfigs(configs);
		if (
			previous.type !== config.type ||
			JSON.stringify(previous.schedule) !== JSON.stringify(config.schedule)
		) {
			scheduleProcess(config);
		}
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
	updateTray();
	return { success: true };
});

ipcMain.handle('process:delete', (_event, id: string) => {
	stopProcess(id);
	const configs = loadProcessConfigs();
	const filtered = configs.filter((c) => c.id !== id);
	saveProcessConfigs(filtered);
	processes.delete(id);
	nextRuns.delete(id);
	deleteRunHistory(id);
	updateTray();
	return { success: true };
});

ipcMain.handle('process:reorder', (_event, orderedIds: string[]) => {
	const configs = loadProcessConfigs();
	const reordered = orderedIds
		.map((id) => configs.find((c) => c.id === id))
		.filter((c): c is ProcessConfig => c !== undefined);
	saveProcessConfigs(reordered);
	updateTray();
	return { success: true };
});

// Category handlers
ipcMain.handle('category:list', () => {
	return loadCategories();
});

ipcMain.handle('category:add', (_event, category: Category) => {
	const categories = loadCategories();
	categories.push(category);
	saveCategories(categories);
	return { success: true };
});

ipcMain.handle('category:update', (_event, category: Category) => {
	const categories = loadCategories();
	const index = categories.findIndex((c) => c.id === category.id);
	if (index >= 0) {
		categories[index] = category;
		saveCategories(categories);
	}
	return { success: true };
});

ipcMain.handle('category:delete', (_event, id: string) => {
	const categories = loadCategories();
	const filtered = categories.filter((c) => c.id !== id);
	saveCategories(filtered);
	// Remove categoryId from processes that were in this category
	const configs = loadProcessConfigs();
	let modified = false;
	for (const config of configs) {
		if (config.categoryId === id) {
			config.categoryId = undefined;
			modified = true;
		}
	}
	if (modified) {
		saveProcessConfigs(configs);
	}
	return { success: true };
});

ipcMain.handle('category:reorder', (_event, orderedIds: string[]) => {
	const categories = loadCategories();
	const reordered = orderedIds
		.map((id) => categories.find((c) => c.id === id))
		.filter((c): c is Category => c !== undefined);
	saveCategories(reordered);
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

// Run history handlers
const SAFE_ID_PATTERN = /^[A-Za-z0-9._-]+$/;

ipcMain.handle('run:list', (_event, processId: string): RunRecord[] => {
	if (!SAFE_ID_PATTERN.test(processId)) return [];
	return [...loadRunIndex(processId)];
});

ipcMain.handle('run:output', (_event, processId: string, runId: string): string => {
	if (!SAFE_ID_PATTERN.test(processId) || !SAFE_ID_PATTERN.test(runId)) return '';
	try {
		return fs.readFileSync(runLogPath(processId, runId), 'utf-8');
	} catch {
		return '';
	}
});

// Drop every finished run; a run still in progress keeps its record and log.
ipcMain.handle('run:clear', (_event, processId: string) => {
	if (!SAFE_ID_PATTERN.test(processId)) return { success: false };
	const runs = loadRunIndex(processId);
	const activeRun = processes.get(processId)?.run;
	const kept: RunRecord[] = [];
	for (const run of runs) {
		if (run === activeRun && run.endedAt === undefined) {
			kept.push(run);
		} else {
			deleteRunLog(processId, run.id);
		}
	}
	saveRunIndex(processId, kept);
	notifyRunUpdate(processId);
	return { success: true };
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
	markInterruptedRuns();
	createWindow();
	createTray();

	scheduleAllProcesses();
	setInterval(collectMetrics, 5000);
	setInterval(updateTray, 2000);
	setInterval(runDueScheduledTasks, 1000);

	app.on('activate', () => {
		if (BrowserWindow.getAllWindows().length === 0) {
			createWindow();
		}
	});
});

app.on('window-all-closed', () => {
	if (process.platform !== 'darwin') {
		app.quit();
	}
});

app.on('before-quit', () => {
	isQuitting = true;
	for (const [, managed] of processes) {
		try {
			managed.stopRequested = true;
			managed.pty.kill();
		} catch {
			// Ignore
		}
	}
});
