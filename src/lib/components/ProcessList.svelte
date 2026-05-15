<script lang="ts">
	import { onMount } from "svelte";
	import { Ellipsis, HatGlasses } from "lucide-svelte";
	import type { ProcessState, ListeningProcess } from "$lib/types";
	import { selectedProcessId, startProcess, stopProcess, reorderProcesses } from "$lib/stores/processes";
	import ProcessCard from "./ProcessCard.svelte";
	import Dropdown from "./Dropdown.svelte";
	import Button from "./Button.svelte";
	import { Plus } from "@lucide/svelte";

	interface Props {
		processes: ProcessState[];
		onAdd: () => void;
	}

	let { processes, onAdd }: Props = $props();
	let listeningProcesses: ListeningProcess[] = $state([]);

	async function loadListeningProcesses() {
		listeningProcesses = await window.nemo.getListeningProcesses();
	}

	async function killProcess(pid: number) {
		await window.nemo.killProcess(pid);
		await loadListeningProcesses();
	}

	onMount(() => {
		loadListeningProcesses();
		const interval = setInterval(loadListeningProcesses, 5000);
		return () => clearInterval(interval);
	});

	let draggedId: string | null = $state(null);
	let dragOverId: string | null = $state(null);

	function selectProcess(id: string) {
		selectedProcessId.set(id);
	}

	function handleDragStart(e: DragEvent, id: string) {
		draggedId = id;
		if (e.dataTransfer) {
			e.dataTransfer.effectAllowed = "move";
			e.dataTransfer.setData("text/plain", id);
		}
	}

	function handleDragOver(e: DragEvent, id: string) {
		e.preventDefault();
		if (draggedId && draggedId !== id) {
			dragOverId = id;
		}
	}

	function handleDragLeave() {
		dragOverId = null;
	}

	function handleDrop(e: DragEvent, targetId: string) {
		e.preventDefault();
		if (!draggedId || draggedId === targetId) {
			dragOverId = null;
			return;
		}

		const currentOrder = processes.map((p) => p.config.id);
		const draggedIndex = currentOrder.indexOf(draggedId);
		const targetIndex = currentOrder.indexOf(targetId);

		if (draggedIndex === -1 || targetIndex === -1) return;

		// Remove dragged item and insert at target position
		currentOrder.splice(draggedIndex, 1);
		currentOrder.splice(targetIndex, 0, draggedId);

		reorderProcesses(currentOrder);
		draggedId = null;
		dragOverId = null;
	}

	function handleDragEnd() {
		draggedId = null;
		dragOverId = null;
	}
</script>

<div class="process-list">
	<div class="header">
		<h2><HatGlasses size={18} /> Nemo</h2>
		<Button variant="primary" onclick={onAdd}><Plus size={12} />Add</Button>
	</div>
	<div class="list">
		{#each processes as process (process.config.id)}
			<div
				class="drag-wrapper"
				class:dragging={draggedId === process.config.id}
				class:drag-over={dragOverId === process.config.id}
				draggable="true"
				ondragstart={(e) => handleDragStart(e, process.config.id)}
				ondragover={(e) => handleDragOver(e, process.config.id)}
				ondragleave={handleDragLeave}
				ondrop={(e) => handleDrop(e, process.config.id)}
				ondragend={handleDragEnd}
				role="listitem"
			>
				<ProcessCard
					{process}
					selected={$selectedProcessId === process.config.id}
					onClick={() => selectProcess(process.config.id)}
					onStart={() => startProcess(process.config.id)}
					onStop={() => stopProcess(process.config.id)}
				/>
			</div>
		{:else}
			<div class="empty">
				<p>No processes configured</p>
				<button onclick={onAdd}>Add your first process</button>
			</div>
		{/each}
	</div>

	{#if listeningProcesses.length > 0}
		<div class="servers-section">
			<div class="servers-header">
				<h3>Other Servers</h3>
			</div>
			<div class="servers-list">
				{#each listeningProcesses as proc (proc.pid)}
					{@const conflictingProcess = proc.conflictsWithProcessId
						? processes.find((p) => p.config.id === proc.conflictsWithProcessId)
						: null}
					<div class="server-item" class:conflict={!!proc.conflictsWithProcessId}>
						<div class="server-info">
							<span class="server-port" class:conflict={!!proc.conflictsWithProcessId}>:{proc.port}</span>
							<span class="server-path" title={proc.cwd || proc.command}>
								{#if conflictingProcess}
									Conflicts with {conflictingProcess.config.name}
								{:else}
									{proc.cwd || proc.command}
								{/if}
							</span>
						</div>
						<Dropdown items={[{ label: "Kill Process", onclick: () => killProcess(proc.pid), variant: "danger" }]}>
							<Ellipsis size={16} />
						</Dropdown>
					</div>
				{/each}
			</div>
		</div>
	{/if}
</div>

<style>
	.process-list {
		display: flex;
		flex-direction: column;
		height: 100%;
		background: #1a1a1a;
		border-right: 1px solid #333;
	}

	.header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: 1px 16px 0;
		height: 60px;
		border-bottom: 1px solid #333;
	}

	h2 {
		margin: 0;
		font-size: 14px;
		font-weight: 600;
		display: flex;
		color: #fff;
		align-items: center;
		justify-content: flex-start;
		gap: 6px;
	}

	.add-btn {
		background: #3b82f6;
		color: white;
		border: none;
		padding: 6px 12px;
		border-radius: 6px;
		cursor: pointer;
		font-size: 12px;
	}

	.add-btn:hover {
		background: #2563eb;
	}

	.list {
		flex: 1;
		overflow-y: auto;
		padding: 8px;
	}

	.empty {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		height: 200px;
		color: #666;
	}

	.empty p {
		margin-bottom: 16px;
	}

	.empty button {
		background: #333;
		color: #fff;
		border: 1px solid #444;
		padding: 8px 16px;
		border-radius: 6px;
		cursor: pointer;
	}

	.empty button:hover {
		background: #444;
	}

	.drag-wrapper {
		position: relative;
		transition:
			transform 0.15s ease,
			opacity 0.15s ease;
	}

	.drag-wrapper.dragging {
		opacity: 0.5;
	}

	.drag-wrapper.drag-over {
		transform: translateY(4px);
	}

	.drag-wrapper.drag-over::before {
		content: "";
		position: absolute;
		top: -4px;
		left: 0;
		right: 0;
		height: 2px;
		background: #3b82f6;
		border-radius: 1px;
	}

	.servers-section {
		border-top: 1px solid #333;
		padding: 8px;
	}

	.servers-header {
		padding: 8px 8px 0;
		height: 60px;
	}

	.servers-header h3 {
		margin: 0;
		font-size: 12px;
		font-weight: 600;
		color: #888;
		text-transform: uppercase;
		letter-spacing: 0.5px;
	}

	.servers-list {
		display: flex;
		flex-direction: column;
		gap: 4px;
	}

	.server-item {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 8px 10px;
		background: #252525;
		border-radius: 6px;
		gap: 8px;
	}

	.server-info {
		display: flex;
		align-items: center;
		gap: 8px;
		min-width: 0;
		flex: 1;
	}

	.server-port {
		font-size: 13px;
		font-weight: 600;
		color: #10b981;
		flex-shrink: 0;
	}

	.server-port.conflict {
		color: #ef4444;
	}

	.server-path {
		font-size: 12px;
		color: #666;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.server-item.conflict {
		background: #2a1f1f;
		border: 1px solid #4a2525;
	}

	.server-item.conflict .server-path {
		color: #f87171;
	}
</style>
