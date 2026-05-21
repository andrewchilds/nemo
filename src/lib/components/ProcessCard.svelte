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

	// Get last 42 data points for charts (3.5 minutes at 5s intervals)
	const MAX_BARS = 42;
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
	<div class="header">
		<span class="name">{process.config.name}</span>
		{#if process.config.type === 'server'}
			<Server size={14} class="type-icon server" />
		{:else}
			<Cog size={14} class="type-icon job" />
		{/if}
	</div>

	{#if process.config.description}
		<p class="description">{process.config.description}</p>
	{/if}

	{#if process.startedAt}
	<div class="metrics" class:stopped={process.status !== 'running'}>
		<div class="metric">
			<div class="metric-header">
				<span class="metric-label">CPU</span>
				<span class="metric-value">{latestMetrics ? `${latestMetrics.cpu.toFixed(1)}%` : '-'}</span>
			</div>
			<div class="chart">
				{#each Array(MAX_BARS) as _, i}
					{@const metric = recentMetrics[i - (MAX_BARS - recentMetrics.length)]}
					<div
						class="bar cpu"
						style="height: {metric ? Math.min((metric.cpu / CPU_MAX) * 100, 100) : 0}%"
					></div>
				{/each}
			</div>
		</div>
		<div class="metric">
			<div class="metric-header">
				<span class="metric-label">RAM</span>
				<span class="metric-value">{latestMetrics ? formatMemory(latestMetrics.memory) : '-'}</span>
			</div>
			<div class="chart">
				{#each Array(MAX_BARS) as _, i}
					{@const metric = recentMetrics[i - (MAX_BARS - recentMetrics.length)]}
					<div
						class="bar ram"
						style="height: {metric ? Math.min((metric.memory / RAM_MAX) * 100, 100) : 0}%"
					></div>
				{/each}
			</div>
		</div>
	</div>
	{/if}

	<div class="footer">
		<div class="status-info">
			{#if process.port || process.config.port}
				<span class="port">:{process.port || process.config.port}</span>
			{/if}
		</div>
		<div class="footer-right">
			{#if process.status === 'error'}
				<span class="status-text">error</span>
			{/if}
			{#if uptime}
				<span class="uptime" class:running={process.status === 'running'} class:stopped={process.status !== 'running'}>{uptime}</span>
			{/if}
			{#if process.status === 'running'}
				<Button variant="danger" onclick={handleStop}>Stop</Button>
			{:else}
				<Button onclick={handleStart}>Start</Button>
			{/if}
			<div class="status-dot" class:running={process.status === 'running'} class:error={process.status === 'error'}></div>
		</div>
	</div>
</div>

<style>
	.card {
		display: flex;
		flex-direction: column;
		width: 100%;
		padding: 12px;
		margin-bottom: 8px;
		background: #252525;
		border: 1px solid #333;
		border-radius: 8px;
		cursor: pointer;
		text-align: left;
		transition: all 0.15s ease;
	}

	.card:hover {
		background: #2a2a2a;
	}

	.card.selected {
		border-color: #3b82f6;
		background: #1e3a5f;
	}

	.header {
		display: flex;
		align-items: center;
		gap: 8px;
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
		flex: 1;
		font-weight: 500;
		color: #fff;
		font-size: 14px;
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

	.description {
		margin: 8px 0 0 0;
		font-size: 12px;
		color: #888;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.metrics {
		display: flex;
		gap: 12px;
		margin-top: 10px;
	}

	.metrics.stopped {
		opacity: 0.7;
	}

	.metric {
		flex: 1;
	}

	.metric-header {
		display: flex;
		justify-content: space-between;
		margin-bottom: 4px;
	}

	.metric-label {
		font-size: 10px;
		color: #666;
	}

	.metric-value {
		font-size: 10px;
		color: #888;
	}

	.chart {
		height: 20px;
		background: #1a1a1a;
		border-radius: 2px;
		display: flex;
		align-items: flex-end;
		justify-content: flex-end;
		gap: 1px;
		padding: 2px;
	}

	.bar {
		flex: 0 0 2px;
		border-radius: 1px;
		transition: height 0.3s ease;
	}

	.bar.cpu {
		background: #3b82f6;
	}

	.bar.ram {
		background: #22c55e;
	}

	.footer {
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin-top: 10px;
	}

	.status-info {
		display: flex;
		gap: 12px;
		font-size: 11px;
		color: #666;
	}

	.uptime {
		font-size: 10px;
	}

	.uptime.running {
		color: #22c55e;
	}

	.uptime.stopped {
		color: #666;
	}

	.footer-right {
		display: flex;
		align-items: center;
		gap: 8px;
	}

	.status-text {
		font-size: 11px;
		color: #666;
		text-transform: capitalize;
	}

</style>
