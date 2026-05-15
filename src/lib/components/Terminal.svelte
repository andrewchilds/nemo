<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { browser } from '$app/environment';

	interface Props {
		processId: string;
		running: boolean;
	}

	let { processId, running }: Props = $props();

	let terminalContainer: HTMLDivElement;
	let terminal: any = null;
	let fitAddon: any = null;
	let unsubscribe: (() => void) | null = null;

	onMount(async () => {
		if (!browser) return;

		const { Terminal } = await import('xterm');
		const { FitAddon } = await import('xterm-addon-fit');

		terminal = new Terminal({
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

		fitAddon = new FitAddon();
		terminal.loadAddon(fitAddon);
		terminal.open(terminalContainer);

		setTimeout(() => {
			fitAddon.fit();
			if (window.nemo) {
				window.nemo.resize(processId, terminal.cols, terminal.rows);
			}
		}, 100);

		// Load existing output buffer
		if (window.nemo) {
			const buffer = await window.nemo.getOutputBuffer(processId);
			if (buffer && terminal) {
				terminal.write(buffer);
			}
		}

		terminal.onData((data: string) => {
			if (running && window.nemo) {
				window.nemo.sendInput(processId, data);
			}
		});

		if (window.nemo) {
			unsubscribe = window.nemo.onProcessOutput((id, data) => {
				if (id === processId && terminal) {
					terminal.write(data);
				}
			});
		}

		const resizeObserver = new ResizeObserver(() => {
			if (fitAddon) {
				fitAddon.fit();
				if (window.nemo && terminal) {
					window.nemo.resize(processId, terminal.cols, terminal.rows);
				}
			}
		});
		resizeObserver.observe(terminalContainer);

		return () => {
			resizeObserver.disconnect();
		};
	});

	onDestroy(() => {
		if (unsubscribe) unsubscribe();
		if (terminal) terminal.dispose();
	});

	$effect(() => {
		if (terminal && !running) {
			terminal.write('\r\n\x1b[90m[Process not running]\x1b[0m\r\n');
		}
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
