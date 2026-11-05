<script lang="ts">
	import { onDestroy, onMount } from "svelte";
	import type { ProcessState, RunRecord } from "$lib/types";
	import { deleteProcess, categories } from "$lib/stores/processes";
	import { resolveProcessDisplayCwd } from "$lib/paths";
	import { describeSchedule } from "$lib/schedule";
	import { describeOutcome, formatDuration, formatRunTime, runDuration } from "$lib/runs";
	import Terminal from "./Terminal.svelte";
	import Dropdown from "./Dropdown.svelte";
	import Badge from "./Badge.svelte";
	import Button from "./Button.svelte";
	import ConfirmModal from "./ConfirmModal.svelte";
	import RunHistoryModal from "./RunHistoryModal.svelte";
	import { MoreHorizontal, Folder, History, ChevronLeft, ChevronRight } from "lucide-svelte";

	interface Props {
		process: ProcessState;
		onEdit: () => void;
	}

	let { process, onEdit }: Props = $props();

	let showDeleteConfirm = $state(false);
	let showHistory = $state(false);
	/** Recorded runs, newest first. Loaded on mount and whenever a run starts or ends. */
	let runs: RunRecord[] = $state([]);
	let runsLoaded = $state(false);
	/** The past run shown in the terminal, or null for live output. */
	let viewingRunId: string | null = $state(null);
	let now = $state(Date.now());
	const ticker = setInterval(() => (now = Date.now()), 1000);
	let unsubscribeRuns: (() => void) | null = null;

	const displayCwd = $derived(resolveProcessDisplayCwd(process.config, $categories));
	const schedule = $derived(process.config.type === "scheduled" ? process.config.schedule : undefined);
	const nextRunLabel = $derived.by(() => {
		if (!schedule || !process.nextRunAt || process.status === "running") return null;
		const next = new Date(process.nextRunAt);
		const time = next.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
		return next.toDateString() === new Date().toDateString() ? time : `tomorrow ${time}`;
	});

	// Header strip: the current run while running, otherwise the most recent one
	const lastRun = $derived(process.lastRun ?? null);
	const lastOutcome = $derived(lastRun ? describeOutcome(lastRun) : null);
	const runCount = $derived(process.runCount ?? runs.length);

	const viewingRun = $derived(runs.find((run) => run.id === viewingRunId) ?? null);
	const viewingIndex = $derived(viewingRun ? runs.indexOf(viewingRun) : -1);
	const olderRun = $derived(viewingIndex >= 0 ? runs[viewingIndex + 1] ?? null : null);
	const newerRun = $derived(viewingIndex > 0 ? runs[viewingIndex - 1] : null);
	const viewingOutcome = $derived(viewingRun ? describeOutcome(viewingRun) : null);

	async function refreshRuns() {
		if (!window.nemo) return;
		const list = await window.nemo.listRuns(process.config.id);
		runs = list.reverse();
		runsLoaded = true;
	}

	onMount(() => {
		void refreshRuns();
		if (window.nemo) {
			unsubscribeRuns = window.nemo.onRunUpdate((id) => {
				if (id === process.config.id) void refreshRuns();
			});
		}
	});

	onDestroy(() => {
		clearInterval(ticker);
		unsubscribeRuns?.();
	});

	// If the run being viewed was pruned or cleared, fall back to live output
	$effect(() => {
		if (runsLoaded && viewingRunId !== null && !viewingRun) {
			viewingRunId = null;
		}
	});

	function showRun(run: RunRecord | null) {
		// The run still in progress is the live terminal
		viewingRunId = run && run.endedAt !== undefined ? run.id : null;
	}

	function handleSelectRun(run: RunRecord) {
		showRun(run);
		showHistory = false;
	}

	async function handleClearRuns() {
		if (!window.nemo) return;
		await window.nemo.clearRuns(process.config.id);
		await refreshRuns();
	}

	async function handleDelete() {
		await deleteProcess(process.config.id);
		showDeleteConfirm = false;
	}

	const dropdownItems = $derived([
		{ label: "Edit", onclick: onEdit },
		{ label: "Run history", onclick: () => (showHistory = true) },
		{ label: "Delete", onclick: () => (showDeleteConfirm = true), variant: "danger" as const, separator: true }
	]);
</script>

<div class="detail">
	<div class="header">
		<div class="info">
			<div class="title-row">
				<h2>{process.config.name}</h2>
				{#if process.status === "running"}
					<Badge variant="green">RUNNING</Badge>
				{:else}
					<Badge variant="default">STOPPED</Badge>
				{/if}
				{#if process.port}
					<Badge variant="blue">:{process.port}</Badge>
				{/if}
				{#if schedule}
					<Badge variant="purple">{describeSchedule(schedule)}</Badge>
					{#if nextRunLabel}
						<span class="next-run">Next run {nextRunLabel}</span>
					{/if}
				{/if}
				<Dropdown items={dropdownItems}>
					<MoreHorizontal size={18} />
				</Dropdown>
			</div>
			{#if process.config.description}
				<p class="description">{process.config.description}</p>
			{/if}
		</div>
	</div>

	<div class="terminal-container">
		<div class="terminal-header">
			<div class="path-tab">
				<Folder size={14} />
				<span class="path-text" title={displayCwd}>{displayCwd}</span>
			</div>
			<code class="command">{process.config.command}</code>
			<div class="run-strip">
				{#if lastRun && lastOutcome}
					<span class="run-time" title={new Date(lastRun.startedAt).toLocaleString()}>
						{lastRun.endedAt === undefined ? "Started" : "Last run"} {formatRunTime(lastRun.startedAt, now)}
					</span>
					<span class="run-duration" class:live={lastRun.endedAt === undefined}>
						{formatDuration(runDuration(lastRun, now))}
					</span>
					<Badge variant={lastOutcome.variant}>{lastOutcome.label}</Badge>
				{/if}
				<button class="history-button" class:active={showHistory} title="Run history" onclick={() => (showHistory = true)}>
					<History size={14} />
					<span>{runCount}</span>
				</button>
			</div>
		</div>
		{#if viewingRun && viewingOutcome}
			<div class="run-banner">
				<History size={14} />
				<span class="banner-label">Viewing past run</span>
				<span class="banner-sep">·</span>
				<span title={new Date(viewingRun.startedAt).toLocaleString()}>{formatRunTime(viewingRun.startedAt, now)}</span>
				<span class="banner-sep">·</span>
				<span>{formatDuration(runDuration(viewingRun, now))}</span>
				<Badge variant={viewingOutcome.variant}>{viewingOutcome.label}</Badge>
				{#if viewingRun.truncated}
					<span class="capped">output capped at 10 MB</span>
				{/if}
				<div class="banner-actions">
					<button class="nav" title="Older run" disabled={!olderRun} onclick={() => showRun(olderRun)}>
						<ChevronLeft size={16} />
					</button>
					<button class="nav" title={newerRun?.endedAt === undefined ? "Back to live output" : "Newer run"} disabled={!newerRun} onclick={() => showRun(newerRun)}>
						<ChevronRight size={16} />
					</button>
					<Button variant={process.status === "running" ? "primary" : "default"} onclick={() => showRun(null)}>Back to live</Button>
				</div>
			</div>
		{/if}
		<div class="terminal-content">
			<Terminal processId={process.config.id} running={process.status === "running"} runId={viewingRunId} />
		</div>
	</div>
</div>

{#if showHistory}
	<RunHistoryModal
		processName={process.config.name}
		{runs}
		selectedRunId={viewingRunId}
		onSelect={handleSelectRun}
		onClear={handleClearRuns}
		onClose={() => (showHistory = false)}
	/>
{/if}

{#if showDeleteConfirm}
	<ConfirmModal
		title="Delete Process"
		message={`Are you sure you want to delete "${process.config.name}"? This action cannot be undone.`}
		confirmText="Delete"
		variant="danger"
		onConfirm={handleDelete}
		onCancel={() => (showDeleteConfirm = false)}
	/>
{/if}

<style>
	.detail {
		display: flex;
		flex-direction: column;
		height: 100%;
		background: #1e1e1e;
	}

	.header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: 1px 16px 0;
		height: 60px;
		border-bottom: 1px solid #333;
	}

	.title-row {
		display: flex;
		align-items: center;
		gap: 8px;
		margin-bottom: 4px;
	}

	.info h2 {
		margin: 0;
		font-size: 18px;
		color: #fff;
	}

	.description {
		margin: 0;
		color: #888;
		font-size: 13px;
	}

	.next-run {
		font-size: 12px;
		color: #888;
		white-space: nowrap;
	}

	.terminal-container {
		flex: 1;
		display: flex;
		flex-direction: column;
		overflow: hidden;
	}

	.terminal-header {
		display: flex;
		align-items: center;
		gap: 12px;
		padding: 8px 12px;
		background: #252526;
		border-bottom: 1px solid #1e1e1e;
	}

	.path-tab {
		display: flex;
		align-items: center;
		gap: 6px;
		padding: 4px 10px;
		font-size: 12px;
		color: #ccc;
		background: #1e1e1e;
		border-radius: 4px;
		flex-shrink: 0;
	}

	.path-tab :global(svg) {
		color: #dcb67a;
		flex-shrink: 0;
	}

	.path-text {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		max-width: 250px;
	}

	.command {
		flex: 1;
		min-width: 0;
		font-size: 12px;
		color: #888;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.run-strip {
		display: flex;
		align-items: center;
		gap: 8px;
		margin-left: auto;
		flex-shrink: 0;
		font-size: 12px;
		white-space: nowrap;
	}

	.run-time {
		color: #888;
	}

	.run-duration {
		color: #ccc;
		font-variant-numeric: tabular-nums;
	}

	.run-duration.live {
		color: #3b82f6;
	}

	.history-button {
		display: flex;
		align-items: center;
		gap: 5px;
		padding: 3px 8px;
		margin-left: 4px;
		background: #1e1e1e;
		border: 1px solid #3a3a3a;
		border-radius: 4px;
		color: #aaa;
		font-size: 12px;
		cursor: pointer;
	}

	.history-button:hover,
	.history-button.active {
		color: #fff;
		border-color: #555;
	}

	.run-banner {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 6px 12px;
		font-size: 12px;
		color: #ddd;
		background: #2d2a1e;
		border-bottom: 1px solid #4a4220;
		white-space: nowrap;
	}

	.run-banner > :global(svg) {
		color: #f59e0b;
		flex-shrink: 0;
	}

	.banner-label {
		font-weight: 500;
		color: #f59e0b;
	}

	.banner-sep {
		color: #666;
	}

	.capped {
		color: #f59e0b;
	}

	.banner-actions {
		display: flex;
		align-items: center;
		gap: 6px;
		margin-left: auto;
	}

	.nav {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 24px;
		height: 24px;
		padding: 0;
		background: #3a3a3a;
		border: none;
		border-radius: 5px;
		color: #ddd;
		cursor: pointer;
	}

	.nav:hover:not(:disabled) {
		background: #4a4a4a;
	}

	.nav:disabled {
		opacity: 0.35;
		cursor: default;
	}

	.terminal-content {
		flex: 1;
		overflow: hidden;
	}
</style>
