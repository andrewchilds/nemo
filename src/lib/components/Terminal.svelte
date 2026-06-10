<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { browser } from '$app/environment';
	import type { Terminal as XtermTerminal } from 'xterm';
	import type { FitAddon as XtermFitAddon } from 'xterm-addon-fit';

	interface Props {
		processId: string;
		running: boolean;
	}

	let { processId, running }: Props = $props();

	let terminalContainer: HTMLDivElement;
	let terminal: XtermTerminal | null = null;
	let fitAddon: XtermFitAddon | null = null;
	let unsubscribe: (() => void) | null = null;
	let resizeObserver: ResizeObserver | null = null;
	let destroyed = false;

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
			if (window.nemo) {
				void window.nemo.resize(processId, nextTerminal.cols, nextTerminal.rows);
			}
		}, 100);

		// Load existing output buffer
		if (window.nemo) {
			const buffer = await window.nemo.getOutputBuffer(processId);
			if (buffer && !destroyed) {
				nextTerminal.write(buffer);
			}
		}

		nextTerminal.onData((data: string) => {
			if (running && window.nemo) {
				void window.nemo.sendInput(processId, data);
			}
		});

		if (window.nemo) {
			unsubscribe = window.nemo.onProcessOutput((id, data) => {
				if (id === processId && terminal) {
					terminal.write(data);
				}
			});
		}

		resizeObserver = new ResizeObserver(() => {
			if (fitAddon && terminal) {
				fitAddon.fit();
				if (window.nemo) {
					void window.nemo.resize(processId, terminal.cols, terminal.rows);
				}
			}
		});
		resizeObserver.observe(terminalContainer);
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

	let wasRunning = $state(running);

	$effect(() => {
		if (terminal && !running) {
			terminal.write('\r\n\x1b[90m[Process not running]\x1b[0m\r\n');
		}
		// Clear terminal when process starts (transition from stopped to running)
		if (terminal && running && !wasRunning) {
			terminal.clear();
		}
		wasRunning = running;
	});
</script>

<svelte:head>
	<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/xterm@5.3.0/css/xterm.css" />
</svelte:head>

<div class="terminal-wrapper" class:stopped={!running}>
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

	:global(.xterm) {
		height: 100% !important;
	}

	:global(.xterm-viewport) {
		overflow-y: auto !important;
	}
</style>
