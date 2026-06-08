<script lang="ts">
	import { onMount } from "svelte";
	import { Ellipsis, HatGlasses, RefreshCw, ChevronDown, ChevronRight, FolderOpen } from "lucide-svelte";
	import type { ProcessState, ListeningProcess, Category } from "$lib/types";
	import {
		selectedProcessId,
		startProcess,
		stopProcess,
		reorderProcesses,
		reorderCategories,
		updateCategory,
		deleteCategory,
		updateProcess
	} from "$lib/stores/processes";
	import ProcessCard from "./ProcessCard.svelte";
	import Dropdown from "./Dropdown.svelte";
	import Button from "./Button.svelte";
	import ConfirmModal from "./ConfirmModal.svelte";
	import { Plus } from "@lucide/svelte";

	interface Props {
		processes: ProcessState[];
		categories: Category[];
		onAddProcess: () => void;
		onAddCategory: () => void;
		onEditCategory: (category: Category) => void;
	}

	let { processes, categories, onAddProcess, onAddCategory, onEditCategory }: Props = $props();
	let listeningProcesses: ListeningProcess[] = $state([]);
	let categoryToDelete: Category | null = $state(null);

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

	// Drag state
	let draggedProcessId: string | null = $state(null);
	let draggedCategoryId: string | null = $state(null);
	let dragOverProcessId: string | null = $state(null);
	let dragOverCategoryId: string | null = $state(null);
	let dragOverUncategorized: boolean = $state(false);

	function selectProcess(id: string) {
		selectedProcessId.set(id);
	}

	// Get processes grouped by category
	let uncategorizedProcesses = $derived(
		processes.filter((p) => !p.config.categoryId)
	);

	function getProcessesInCategory(categoryId: string) {
		return processes.filter((p) => p.config.categoryId === categoryId);
	}

	// Process drag handlers
	function handleProcessDragStart(e: DragEvent, id: string) {
		draggedProcessId = id;
		draggedCategoryId = null;
		if (e.dataTransfer) {
			e.dataTransfer.effectAllowed = "move";
			e.dataTransfer.setData("text/plain", `process:${id}`);
		}
	}

	function handleProcessDragOver(e: DragEvent, id: string) {
		e.preventDefault();
		if (draggedProcessId && draggedProcessId !== id) {
			dragOverProcessId = id;
		}
	}

	function handleProcessDragLeave() {
		dragOverProcessId = null;
	}

	function handleProcessDrop(e: DragEvent, targetId: string, targetCategoryId?: string) {
		e.preventDefault();
		if (!draggedProcessId || draggedProcessId === targetId) {
			resetDragState();
			return;
		}

		const draggedProcess = processes.find((p) => p.config.id === draggedProcessId);
		if (!draggedProcess) {
			resetDragState();
			return;
		}

		// If dropping on a process in a different category, move to that category
		const targetProcess = processes.find((p) => p.config.id === targetId);
		if (targetProcess && draggedProcess.config.categoryId !== targetProcess.config.categoryId) {
			updateProcess({ ...draggedProcess.config, categoryId: targetProcess.config.categoryId });
		}

		// Reorder within the same list
		const sameCategoryProcesses = processes.filter(
			(p) => p.config.categoryId === (targetCategoryId ?? targetProcess?.config.categoryId)
		);
		const currentOrder = sameCategoryProcesses.map((p) => p.config.id);
		const draggedIndex = currentOrder.indexOf(draggedProcessId);
		const targetIndex = currentOrder.indexOf(targetId);

		if (draggedIndex !== -1 && targetIndex !== -1) {
			currentOrder.splice(draggedIndex, 1);
			currentOrder.splice(targetIndex, 0, draggedProcessId);

			// Build full order including all processes
			const fullOrder: string[] = [];
			for (const cat of categories) {
				const catProcesses = processes.filter((p) => p.config.categoryId === cat.id);
				if (cat.id === (targetCategoryId ?? targetProcess?.config.categoryId)) {
					fullOrder.push(...currentOrder);
				} else {
					fullOrder.push(...catProcesses.map((p) => p.config.id));
				}
			}
			// Add uncategorized
			const uncatProcesses = processes.filter((p) => !p.config.categoryId);
			if (!targetCategoryId && !targetProcess?.config.categoryId) {
				fullOrder.push(...currentOrder);
			} else {
				fullOrder.push(...uncatProcesses.map((p) => p.config.id));
			}

			reorderProcesses([...new Set(fullOrder)]);
		}

		resetDragState();
	}

	// Category drag handlers
	function handleCategoryDragStart(e: DragEvent, id: string) {
		draggedCategoryId = id;
		draggedProcessId = null;
		if (e.dataTransfer) {
			e.dataTransfer.effectAllowed = "move";
			e.dataTransfer.setData("text/plain", `category:${id}`);
		}
	}

	function handleCategoryDragOver(e: DragEvent, id: string) {
		e.preventDefault();
		if (draggedCategoryId && draggedCategoryId !== id) {
			dragOverCategoryId = id;
		}
		// Allow dropping process onto category header
		if (draggedProcessId) {
			dragOverCategoryId = id;
		}
	}

	function handleCategoryDragLeave() {
		dragOverCategoryId = null;
	}

	function handleCategoryDrop(e: DragEvent, targetId: string) {
		e.preventDefault();

		// Handle dropping a process onto a category
		if (draggedProcessId) {
			const draggedProcess = processes.find((p) => p.config.id === draggedProcessId);
			if (draggedProcess && draggedProcess.config.categoryId !== targetId) {
				updateProcess({ ...draggedProcess.config, categoryId: targetId });
			}
			resetDragState();
			return;
		}

		if (!draggedCategoryId || draggedCategoryId === targetId) {
			resetDragState();
			return;
		}

		const currentOrder = categories.map((c) => c.id);
		const draggedIndex = currentOrder.indexOf(draggedCategoryId);
		const targetIndex = currentOrder.indexOf(targetId);

		if (draggedIndex === -1 || targetIndex === -1) {
			resetDragState();
			return;
		}

		currentOrder.splice(draggedIndex, 1);
		currentOrder.splice(targetIndex, 0, draggedCategoryId);

		reorderCategories(currentOrder);
		resetDragState();
	}

	// Uncategorized section drag handlers
	function handleUncategorizedDragOver(e: DragEvent) {
		e.preventDefault();
		if (draggedProcessId) {
			dragOverUncategorized = true;
		}
	}

	function handleUncategorizedDragLeave() {
		dragOverUncategorized = false;
	}

	function handleUncategorizedDrop(e: DragEvent) {
		e.preventDefault();
		if (draggedProcessId) {
			const draggedProcess = processes.find((p) => p.config.id === draggedProcessId);
			if (draggedProcess && draggedProcess.config.categoryId) {
				updateProcess({ ...draggedProcess.config, categoryId: undefined });
			}
		}
		resetDragState();
	}

	function handleDragEnd() {
		resetDragState();
	}

	function resetDragState() {
		draggedProcessId = null;
		draggedCategoryId = null;
		dragOverProcessId = null;
		dragOverCategoryId = null;
		dragOverUncategorized = false;
	}

	function toggleCategory(category: Category) {
		updateCategory({ ...category, collapsed: !category.collapsed });
	}

	function handleDeleteCategory(category: Category) {
		categoryToDelete = category;
	}

	function confirmDeleteCategory() {
		if (categoryToDelete) {
			deleteCategory(categoryToDelete.id);
			categoryToDelete = null;
		}
	}
</script>

<div class="process-list">
	<div class="header">
		<h2><HatGlasses size={18} /> Nemo</h2>
		<div class="header-buttons">
			<Dropdown
				items={[
					{ label: "Add Process", onclick: onAddProcess },
					{ label: "Add Category", onclick: onAddCategory }
				]}
			>
				<Button variant="primary"><Plus size={12} />Add</Button>
			</Dropdown>
		</div>
	</div>
	<div class="list">
		{#each categories as category (category.id)}
			{@const categoryProcesses = getProcessesInCategory(category.id)}
			<div
				class="category"
				class:dragging={draggedCategoryId === category.id}
				class:drag-over={dragOverCategoryId === category.id}
			>
				<div
					class="category-header"
					draggable="true"
					ondragstart={(e) => handleCategoryDragStart(e, category.id)}
					ondragover={(e) => handleCategoryDragOver(e, category.id)}
					ondragleave={handleCategoryDragLeave}
					ondrop={(e) => handleCategoryDrop(e, category.id)}
					ondragend={handleDragEnd}
					role="button"
					tabindex="0"
					onclick={() => toggleCategory(category)}
					onkeydown={(e) => e.key === 'Enter' && toggleCategory(category)}
				>
					<div class="category-left">
						{#if category.collapsed}
							<ChevronRight size={14} />
						{:else}
							<ChevronDown size={14} />
						{/if}
						<FolderOpen size={14} />
						<span class="category-name">{category.name}</span>
						<span class="category-count">({categoryProcesses.length})</span>
					</div>
					<div class="category-actions" onclick={(e) => e.stopPropagation()}>
						<Dropdown
							items={[
								{ label: "Edit", onclick: () => onEditCategory(category) },
								{ label: "Delete", onclick: () => handleDeleteCategory(category), variant: "danger" }
							]}
						>
							<Ellipsis size={16} />
						</Dropdown>
					</div>
				</div>
				{#if !category.collapsed}
					<div class="category-processes">
						{#each categoryProcesses as process (process.config.id)}
							<div
								class="drag-wrapper"
								class:dragging={draggedProcessId === process.config.id}
								class:drag-over={dragOverProcessId === process.config.id}
								draggable="true"
								ondragstart={(e) => handleProcessDragStart(e, process.config.id)}
								ondragover={(e) => handleProcessDragOver(e, process.config.id)}
								ondragleave={handleProcessDragLeave}
								ondrop={(e) => handleProcessDrop(e, process.config.id, category.id)}
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
							<div class="category-empty">No processes in this category</div>
						{/each}
					</div>
				{/if}
			</div>
		{/each}

		{#if uncategorizedProcesses.length > 0 || categories.length > 0}
			<div
				class="uncategorized-section"
				class:drag-over={dragOverUncategorized}
				ondragover={handleUncategorizedDragOver}
				ondragleave={handleUncategorizedDragLeave}
				ondrop={handleUncategorizedDrop}
			>
				{#if categories.length > 0}
					<div class="uncategorized-header">
						<span>Uncategorized</span>
					</div>
				{/if}
				{#each uncategorizedProcesses as process (process.config.id)}
					<div
						class="drag-wrapper"
						class:dragging={draggedProcessId === process.config.id}
						class:drag-over={dragOverProcessId === process.config.id}
						draggable="true"
						ondragstart={(e) => handleProcessDragStart(e, process.config.id)}
						ondragover={(e) => handleProcessDragOver(e, process.config.id)}
						ondragleave={handleProcessDragLeave}
						ondrop={(e) => handleProcessDrop(e, process.config.id)}
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
				{/each}
			</div>
		{/if}

		{#if processes.length === 0}
			<div class="empty">
				<p>No processes configured</p>
				<button onclick={onAddProcess}>Add your first process</button>
			</div>
		{/if}
	</div>

	{#if listeningProcesses.length > 0}
		<div class="servers-section">
			<div class="servers-header">
				<h3>Other Servers</h3>
				<button class="refresh-btn" onclick={loadListeningProcesses} title="Refresh">
					<RefreshCw size={14} />
				</button>
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

{#if categoryToDelete}
	<ConfirmModal
		title="Delete Category"
		message="Are you sure you want to delete '{categoryToDelete.name}'? Processes in this category will become uncategorized."
		confirmText="Delete"
		variant="danger"
		onConfirm={confirmDeleteCategory}
		onCancel={() => categoryToDelete = null}
	/>
{/if}

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

	.header-buttons {
		display: flex;
		gap: 8px;
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

	/* Category styles */
	.category {
		margin-bottom: 8px;
		border-radius: 8px;
		background: #222;
		overflow: hidden;
		transition: transform 0.15s ease, opacity 0.15s ease;
	}

	.category.dragging {
		opacity: 0.5;
	}

	.category.drag-over {
		outline: 2px solid #3b82f6;
		outline-offset: -2px;
	}

	.category-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 10px 12px;
		cursor: pointer;
		user-select: none;
		background: #2a2a2a;
		border-bottom: 1px solid #333;
	}

	.category-header:hover {
		background: #333;
	}

	.category-left {
		display: flex;
		align-items: center;
		gap: 8px;
		color: #ccc;
	}

	.category-name {
		font-size: 13px;
		font-weight: 500;
		color: #fff;
	}

	.category-count {
		font-size: 12px;
		color: #666;
	}

	.category-actions {
		opacity: 0;
		transition: opacity 0.15s ease;
	}

	.category-header:hover .category-actions {
		opacity: 1;
	}

	.category-processes {
		padding: 8px;
	}

	.category-empty {
		padding: 16px;
		text-align: center;
		color: #555;
		font-size: 12px;
	}

	/* Uncategorized section */
	.uncategorized-section {
		border-radius: 8px;
		transition: outline 0.15s ease;
	}

	.uncategorized-section.drag-over {
		outline: 2px dashed #3b82f6;
		outline-offset: -2px;
	}

	.uncategorized-header {
		padding: 10px 12px;
		font-size: 12px;
		font-weight: 600;
		color: #666;
		text-transform: uppercase;
		letter-spacing: 0.5px;
	}

	/* Drag wrapper */
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
		display: flex;
		align-items: center;
		justify-content: space-between;
	}

	.refresh-btn {
		background: transparent;
		border: none;
		color: #666;
		cursor: pointer;
		padding: 4px;
		border-radius: 4px;
		display: flex;
		align-items: center;
		justify-content: center;
	}

	.refresh-btn:hover {
		color: #888;
		background: #333;
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
