<script lang="ts">
	import type { ProcessState } from "$lib/types";
	import { deleteProcess } from "$lib/stores/processes";
	import Terminal from "./Terminal.svelte";
	import Dropdown from "./Dropdown.svelte";
	import Badge from "./Badge.svelte";
	import ConfirmModal from "./ConfirmModal.svelte";
	import { MoreHorizontal, Folder } from "lucide-svelte";

	interface Props {
		process: ProcessState;
		onEdit: () => void;
	}

	let { process, onEdit }: Props = $props();

	let showDeleteConfirm = $state(false);

	async function handleDelete() {
		await deleteProcess(process.config.id);
		showDeleteConfirm = false;
	}

	const dropdownItems = $derived([
		{ label: "Edit", onclick: onEdit },
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
				<span class="path-text">{process.config.cwd}</span>
			</div>
			<code class="command">{process.config.command}</code>
		</div>
		<div class="terminal-content">
			<Terminal processId={process.config.id} running={process.status === "running"} />
		</div>
	</div>
</div>

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
		font-size: 12px;
		color: #888;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.terminal-content {
		flex: 1;
		overflow: hidden;
	}
</style>
