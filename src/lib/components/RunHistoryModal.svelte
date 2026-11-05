<script lang="ts">
	import { onDestroy } from 'svelte';
	import type { RunRecord } from '$lib/types';
	import { describeOutcome, describeTrigger, formatBytes, formatDuration, formatRunTime, isFailure, runDuration } from '$lib/runs';
	import Modal from './Modal.svelte';
	import Button from './Button.svelte';
	import Badge from './Badge.svelte';
	import ConfirmModal from './ConfirmModal.svelte';

	interface Props {
		processName: string;
		/** Newest first. */
		runs: RunRecord[];
		selectedRunId: string | null;
		onSelect: (run: RunRecord) => void;
		onClear: () => void;
		onClose: () => void;
	}

	let { processName, runs, selectedRunId, onSelect, onClear, onClose }: Props = $props();

	let showClearConfirm = $state(false);
	let now = $state(Date.now());
	const interval = setInterval(() => (now = Date.now()), 1000);
	onDestroy(() => clearInterval(interval));

	const finishedCount = $derived(runs.filter((run) => run.endedAt !== undefined).length);

	function handleClear() {
		showClearConfirm = false;
		onClear();
	}
</script>

<Modal title="Run history: {processName}" {onClose} width="680px">
	{#if runs.length === 0}
		<p class="empty">No runs recorded yet.</p>
	{:else}
		<table>
			<thead>
				<tr>
					<th>Started</th>
					<th>Duration</th>
					<th>Result</th>
					<th>Trigger</th>
					<th class="num">Output</th>
				</tr>
			</thead>
			<tbody>
				{#each runs as run (run.id)}
					{@const outcome = describeOutcome(run)}
					{@const active = run.endedAt === undefined}
					<tr
						class:failed={isFailure(run.outcome)}
						class:selected={run.id === selectedRunId}
						onclick={() => onSelect(run)}
						onkeydown={(e) => e.key === 'Enter' && onSelect(run)}
						tabindex="0"
						title={active ? 'Show live output' : 'Show this run\'s output'}
					>
						<td>{formatRunTime(run.startedAt, now, true)}</td>
						<td class:live={active}>{formatDuration(runDuration(run, now))}</td>
						<td><Badge variant={outcome.variant}>{outcome.label}</Badge></td>
						<td class="muted">{describeTrigger(run.trigger)}</td>
						<td class="num muted">
							{formatBytes(run.bytes)}{#if run.truncated}<span class="truncated" title="Output exceeded the 10 MB cap; the rest was dropped"> (capped)</span>{/if}
						</td>
					</tr>
				{/each}
			</tbody>
		</table>
	{/if}

	{#snippet actions()}
		<span class="count">{runs.length} {runs.length === 1 ? 'run' : 'runs'} kept (last 100)</span>
		<Button variant="danger" disabled={finishedCount === 0} onclick={() => (showClearConfirm = true)}>Clear history</Button>
		<Button onclick={onClose}>Close</Button>
	{/snippet}
</Modal>

{#if showClearConfirm}
	<ConfirmModal
		title="Clear Run History"
		message={`Delete the ${finishedCount} recorded ${finishedCount === 1 ? 'run' : 'runs'} and their output for "${processName}"? A run still in progress is kept.`}
		confirmText="Clear"
		variant="danger"
		onConfirm={handleClear}
		onCancel={() => (showClearConfirm = false)}
	/>
{/if}

<style>
	.empty {
		margin: 0;
		color: #888;
		font-size: 14px;
	}

	table {
		width: 100%;
		border-collapse: collapse;
		font-size: 13px;
	}

	th {
		text-align: left;
		font-weight: 500;
		font-size: 11px;
		text-transform: uppercase;
		letter-spacing: 0.04em;
		color: #777;
		padding: 0 10px 8px;
		border-bottom: 1px solid #333;
	}

	td {
		padding: 7px 10px;
		color: #ddd;
		white-space: nowrap;
		border-bottom: 1px solid #2c2c2c;
	}

	th.num,
	td.num {
		text-align: right;
	}

	td.muted {
		color: #888;
	}

	td.live {
		color: #3b82f6;
	}

	.truncated {
		color: #f59e0b;
	}

	tbody tr {
		cursor: pointer;
	}

	tbody tr:hover {
		background: #2e2e2e;
	}

	tbody tr:focus-visible {
		outline: 1px solid #3b82f6;
		outline-offset: -1px;
	}

	tbody tr.failed td:first-child {
		box-shadow: inset 3px 0 0 #ef4444;
	}

	tbody tr.selected {
		background: #1e3a5f;
	}

	.count {
		margin-right: auto;
		align-self: center;
		font-size: 12px;
		color: #777;
	}
</style>
