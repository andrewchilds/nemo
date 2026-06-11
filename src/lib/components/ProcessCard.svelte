<script lang="ts">
	import { onDestroy } from 'svelte';
	import type { ProcessState } from '$lib/types';
	import Button from './Button.svelte';
	import { Server, Cog } from 'lucide-svelte';

	interface Props {
		process: ProcessState;
		selected?: boolean;
		onClick: () => void;
		onStart: () => void;
		onStop: () => void;
	}

	let { process, selected = false, onClick, onStart, onStop }: Props = $props();

	let now = $state(Date.now());
	const interval = setInterval(() => (now = Date.now()), 1000);
	onDestroy(() => clearInterval(interval));

	let uptime = $derived.by(() => {
		if (!process.startedAt) return null;
		if (process.status === 'running') {
			return formatUptime(now - process.startedAt);
		}
		// For stopped/error processes, show the final duration
		if (process.stoppedAt) {
			return formatUptime(process.stoppedAt - process.startedAt);
		}
		return null;
	});
	let latestMetrics = $derived(process.metrics[process.metrics.length - 1]);

	// Get last 20 data points for charts (~1.5 minutes at 5s intervals)
	const MAX_BARS = 20;
	const chartBarIndexes = Array.from({ length: MAX_BARS }, (_value, index) => index);
	let recentMetrics = $derived(process.metrics.slice(-MAX_BARS));

	// Default max values: CPU 100%, RAM 512MB
	const CPU_MAX = 100;
	const RAM_MAX = 512 * 1024 * 1024; // 512MB default

	function formatUptime(ms: number): string {
		const seconds = Math.floor(ms / 1000);
		const minutes = Math.floor(seconds / 60);
		const hours = Math.floor(minutes / 60);
		const days = Math.floor(hours / 24);

		if (days > 0) return `${days}d ${hours % 24}h`;
		if (hours > 0) return `${hours}h ${minutes % 60}m`;
		if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
		return `${seconds}s`;
	}

	function formatMemory(bytes: number): string {
		if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
		if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
		return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
	}

	function handleStart(e: Event) {
		e.stopPropagation();
		onStart();
	}

	function handleStop(e: Event) {
		e.stopPropagation();
		onStop();
	}
</script>

<div class="card" class:selected onclick={onClick} onkeydown={(e) => e.key === 'Enter' && onClick()} role="button" tabindex="0">
	<div class="row">
		<div class="col-controls">
			<div class="status-dot" class:running={process.status === 'running'} class:error={process.status === 'error'}></div>
			{#if process.status === 'running'}
				<Button variant="danger" onclick={handleStop}>Stop</Button>
			{:else}
				<Button onclick={handleStart}>Start</Button>
			{/if}
		</div>
		<div class="col-name">
			{#if process.config.type === 'server'}
				<Server size={14} class="type-icon server" />
			{:else}
				<Cog size={14} class="type-icon job" />
			{/if}
			<span class="name">{process.config.name}</span>
		</div>

		<div class="col-port">
			{#if process.port || process.config.port}
				<span class="port">:{process.port || process.config.port}</span>
			{/if}
		</div>

		<div class="col-metrics" class:stopped={process.status !== 'running'}>
			<div class="metric">
				<span class="metric-value">{latestMetrics ? `${latestMetrics.cpu.toFixed(0)}%` : '-'}</span>
				<div class="chart">
						{#each chartBarIndexes as i (i)}
						{@const metric = recentMetrics[i - (MAX_BARS - recentMetrics.length)]}
						<div
							class="bar cpu"
							style="height: {metric ? Math.min((metric.cpu / CPU_MAX) * 100, 100) : 0}%"
						></div>
					{/each}
				</div>
			</div>
			<div class="metric">
				<span class="metric-value">{latestMetrics ? formatMemory(latestMetrics.memory) : '-'}</span>
				<div class="chart">
						{#each chartBarIndexes as i (i)}
						{@const metric = recentMetrics[i - (MAX_BARS - recentMetrics.length)]}
						<div
							class="bar ram"
							style="height: {metric ? Math.min((metric.memory / RAM_MAX) * 100, 100) : 0}%"
						></div>
					{/each}
				</div>
			</div>
		</div>

		<div class="col-status">
			{#if process.status === 'error'}
				<span class="status-text">error</span>
			{/if}
			{#if uptime}
				<span class="uptime" class:running={process.status === 'running'} class:stopped={process.status !== 'running'}>{uptime}</span>
			{/if}
		</div>

	</div>
</div>

<style>
	.card {
		width: 100%;
		padding: 10px 12px;
		margin-bottom: 4px;
		background: #252525;
		border: 1px solid #333;
		border-radius: 8px;
		cursor: pointer;
		transition: all 0.15s ease;
	}

	.card:hover {
		background: #2a2a2a;
	}

	.card.selected {
		border-color: #3b82f6;
		background: #1e3a5f;
	}

	.row {
		display: flex;
		align-items: center;
		gap: 8px;
	}

	.col-controls {
		display: flex;
		align-items: center;
		gap: 8px;
		flex-shrink: 0;
	}

	.col-name {
		display: flex;
		align-items: center;
		gap: 8px;
		flex: 1;
		min-width: 0;
		overflow: hidden;
	}

	.col-port {
		width: 45px;
		flex-shrink: 0;
		text-align: right;
	}

	.col-metrics {
		display: flex;
		gap: 12px;
	}

	.col-metrics.stopped {
		opacity: 0.5;
	}

	.col-status {
		display: flex;
		align-items: center;
		gap: 6px;
		width: 55px;
		flex-shrink: 0;
		justify-content: flex-end;
	}

	.status-dot {
		width: 8px;
		height: 8px;
		border-radius: 50%;
		background: #666;
		flex-shrink: 0;
	}

	.status-dot.running {
		background: #22c55e;
	}

	.status-dot.error {
		background: #ef4444;
	}

	.name {
		font-weight: 500;
		color: #fff;
		font-size: 13px;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.port {
		font-size: 12px;
		color: #3b82f6;
		font-weight: 500;
	}

	:global(.type-icon) {
		flex-shrink: 0;
	}

	:global(.type-icon.server) {
		color: #3b82f6;
	}

	:global(.type-icon.job) {
		color: #f59e0b;
	}

	.uptime {
		font-size: 11px;
		flex-shrink: 0;
		text-align: right;
	}

	.uptime.running {
		color: #22c55e;
	}

	.uptime.stopped {
		color: #666;
	}

	.status-text {
		font-size: 11px;
		color: #ef4444;
		text-transform: capitalize;
	}

	.metric {
		display: flex;
		align-items: center;
		gap: 4px;
		flex: 1;
		min-width: 0;
	}

	.metric-value {
		font-size: 10px;
		color: #888;
		width: 35px;
		flex-shrink: 0;
		text-align: right;
	}

	.chart {
		height: 18px;
		width: 60px;
		flex-shrink: 0;
		background: #1a1a1a;
		border-radius: 2px;
		display: flex;
		align-items: flex-end;
		justify-content: flex-end;
		gap: 1px;
		padding: 2px;
		overflow: hidden;
	}

	.bar {
		flex: 0 0 2px;
		min-width: 0;
		border-radius: 1px;
		transition: height 0.3s ease;
	}

	.bar.cpu {
		background: #3b82f6;
	}

	.bar.ram {
		background: #22c55e;
	}
</style>
