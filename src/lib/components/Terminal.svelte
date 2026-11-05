<script lang="ts">
	import { onMount, onDestroy, untrack } from 'svelte';
	import { browser } from '$app/environment';
	import type { Terminal as XtermTerminal } from 'xterm';
	import type { FitAddon as XtermFitAddon } from 'xterm-addon-fit';

	interface Props {
		processId: string;
		running: boolean;
		/** When set, replays that recorded run instead of showing live output. */
		runId?: string | null;
	}

	let { processId, running, runId = null }: Props = $props();

	let terminalContainer: HTMLDivElement;
	let terminal: XtermTerminal | null = null;
	let fitAddon: XtermFitAddon | null = null;
	let unsubscribe: (() => void) | null = null;
	let resizeObserver: ResizeObserver | null = null;
	let destroyed = false;
	let ready = $state(false);
	// Bumped on every source change so a slow load for a previous source is discarded
	let loadToken = 0;

	const live = $derived(runId === null);

	async function initializeTerminal() {
		const { Terminal } = await import('xterm');
		const { FitAddon } = await import('xterm-addon-fit');

		if (destroyed) return;

		const nextTerminal = new Terminal({
			theme: {
				background: '#0d0d0d',
				foreground: '#e5e5e5',
				cursor: '#e5e5e5',
				cursorAccent: '#0d0d0d',
				selectionBackground: 'rgba(255,255,255,0.3)',
				black: '#000000',
				red: '#ff5555',
				green: '#50fa7b',
				yellow: '#f1fa8c',
				blue: '#6272a4',
				magenta: '#ff79c6',
				cyan: '#8be9fd',
				white: '#f8f8f2'
			},
			fontFamily: '"SF Mono", Monaco, Menlo, monospace',
			fontSize: 13,
			lineHeight: 1.2,
			cursorBlink: true,
			cursorStyle: 'bar'
		});

		const nextFitAddon = new FitAddon();
		terminal = nextTerminal;
		fitAddon = nextFitAddon;
		nextTerminal.loadAddon(nextFitAddon);
		nextTerminal.open(terminalContainer);

		setTimeout(() => {
			if (destroyed) return;
			nextFitAddon.fit();
			if (window.nemo && live) {
				void window.nemo.resize(processId, nextTerminal.cols, nextTerminal.rows);
			}
		}, 100);

		nextTerminal.onData((data: string) => {
			if (live && running && window.nemo) {
				void window.nemo.sendInput(processId, data);
			}
		});

		if (window.nemo) {
			unsubscribe = window.nemo.onProcessOutput((id, data) => {
				if (id === processId && live && terminal) {
					terminal.write(data);
				}
			});
		}

		resizeObserver = new ResizeObserver(() => {
			if (fitAddon && terminal) {
				fitAddon.fit();
				if (window.nemo && live) {
					void window.nemo.resize(processId, terminal.cols, terminal.rows);
				}
			}
		});
		resizeObserver.observe(terminalContainer);

		ready = true;
	}

	// Replace the terminal contents with the current source: the live buffer or a stored run log.
	async function loadSource(id: string | null) {
		if (!terminal || !window.nemo) return;
		const token = ++loadToken;
		terminal.reset();
		terminal.options.disableStdin = id !== null;

		const content = id === null
			? await window.nemo.getOutputBuffer(processId)
			: await window.nemo.getRunOutput(processId, id);
		if (destroyed || token !== loadToken || !terminal) return;

		if (content) terminal.write(content);
		if (id === null && !running) {
			terminal.write('\r\n\x1b[90m[Process not running]\x1b[0m\r\n');
		}
	}

	onMount(() => {
		if (!browser) return;
		void initializeTerminal();
	});

	onDestroy(() => {
		destroyed = true;
		resizeObserver?.disconnect();
		if (unsubscribe) unsubscribe();
		if (terminal) terminal.dispose();
	});

	$effect(() => {
		if (!ready) return;
		// Only the source should trigger a reload, not the running flag it reads
		const id = runId;
		untrack(() => void loadSource(id));
	});

	let wasRunning = $state(running);

	$effect(() => {
		if (ready && live && terminal) {
			if (!running && wasRunning) {
				terminal.write('\r\n\x1b[90m[Process not running]\x1b[0m\r\n');
			}
			// Clear terminal when process starts (transition from stopped to running)
			if (running && !wasRunning) {
				terminal.clear();
			}
		}
		wasRunning = running;
	});
</script>

<svelte:head>
	<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/xterm@5.3.0/css/xterm.css" />
</svelte:head>

<div class="terminal-wrapper" class:stopped={live && !running} class:replay={!live}>
	<div class="terminal" bind:this={terminalContainer}></div>
</div>

<style>
	.terminal-wrapper {
		height: 100%;
		padding: 8px;
		background: #0d0d0d;
		box-sizing: border-box;
	}

	.terminal {
		height: 100%;
		width: 100%;
	}

	.terminal-wrapper.stopped {
		opacity: 0.5;
	}

	.terminal-wrapper.replay {
		opacity: 0.85;
	}

	:global(.xterm) {
		height: 100% !important;
	}

	:global(.xterm-viewport) {
		overflow-y: auto !important;
	}
</style>
