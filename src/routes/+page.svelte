<script lang="ts">
	import { onMount, onDestroy } from "svelte";
	import { get } from "svelte/store";
	import type { ProcessConfig, Category } from "$lib/types";
	import {
		processes,
		categories,
		selectedProcessId,
		loadProcesses,
		loadCategories,
		setupProcessListeners,
		addProcess,
		updateProcess,
		addCategory,
		updateCategory
	} from "$lib/stores/processes";
	import ProcessList from "$lib/components/ProcessList.svelte";
	import ProcessDetail from "$lib/components/ProcessDetail.svelte";
	import ProcessForm from "$lib/components/ProcessForm.svelte";
	import CategoryForm from "$lib/components/CategoryForm.svelte";

	let showProcessForm = $state(false);
	let showCategoryForm = $state(false);
	let editingProcess: ProcessConfig | null = $state(null);
	let editingCategory: Category | null = $state(null);
	let cleanup: (() => void) | undefined;

	let selectedProcess = $derived($processes.find((p) => p.config.id === $selectedProcessId) || null);

	onMount(async () => {
		await loadProcesses();
		await loadCategories();
		cleanup = setupProcessListeners();

		if (!get(selectedProcessId) && get(processes).length > 0) {
			selectedProcessId.set(get(processes)[0].config.id);
		}
	});

	onDestroy(() => {
		cleanup?.();
	});

	function handleAddProcess() {
		editingProcess = null;
		showProcessForm = true;
	}

	function handleAddCategory() {
		editingCategory = null;
		showCategoryForm = true;
	}

	let detectedPort: number | undefined = $state(undefined);

	function handleEdit() {
		if (selectedProcess) {
			editingProcess = selectedProcess.config;
			detectedPort = selectedProcess.port;
			showProcessForm = true;
		}
	}

	function handleEditCategory(category: Category) {
		editingCategory = category;
		showCategoryForm = true;
	}

	function handleSaveProcess(config: ProcessConfig) {
		if (editingProcess) {
			updateProcess(config);
		} else {
			addProcess(config);
		}
		showProcessForm = false;
		editingProcess = null;
		selectedProcessId.set(config.id);
	}

	function handleSaveCategory(category: Category) {
		if (editingCategory) {
			updateCategory(category);
		} else {
			addCategory(category);
		}
		showCategoryForm = false;
		editingCategory = null;
	}

	function handleCancelProcess() {
		showProcessForm = false;
		editingProcess = null;
	}

	function handleCancelCategory() {
		showCategoryForm = false;
		editingCategory = null;
	}
</script>

<svelte:head>
	<title>Nemo - Process Manager</title>
</svelte:head>

<div class="titlebar"></div>
<div class="app">
	<aside class="sidebar">
		<ProcessList
			processes={$processes}
			categories={$categories}
			onAddProcess={handleAddProcess}
			onAddCategory={handleAddCategory}
			onEditCategory={handleEditCategory}
		/>
	</aside>
	<main class="main">
		{#if selectedProcess}
			{#key selectedProcess.config.id}
				<ProcessDetail process={selectedProcess} onEdit={handleEdit} />
			{/key}
		{:else}
			<div class="empty">
				<h2>No process selected</h2>
				<p>Select a process from the sidebar or add a new one</p>
				<button onclick={handleAddProcess}>Add Process</button>
			</div>
		{/if}
	</main>
</div>

{#if showProcessForm}
	<ProcessForm
		process={editingProcess}
		categories={$categories}
		{detectedPort}
		onSave={handleSaveProcess}
		onCancel={handleCancelProcess}
	/>
{/if}

{#if showCategoryForm}
	<CategoryForm
		category={editingCategory}
		onSave={handleSaveCategory}
		onCancel={handleCancelCategory}
	/>
{/if}

<style>
	:global(body) {
		margin: 0;
		padding: 0;
		font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
		background: #1e1e1e;
		color: #e5e5e5;
		overflow: hidden;
	}

	:global(*) {
		box-sizing: border-box;
	}

	/* Custom dark scrollbars */
	:global(*) {
		scrollbar-width: thin;
		scrollbar-color: #444 transparent;
	}

	:global(*::-webkit-scrollbar) {
		width: 8px;
		height: 8px;
	}

	:global(*::-webkit-scrollbar-track) {
		background: transparent;
	}

	:global(*::-webkit-scrollbar-thumb) {
		background: #444;
		border-radius: 4px;
	}

	:global(*::-webkit-scrollbar-thumb:hover) {
		background: #555;
	}

	:global(button),
	:global(input),
	:global(select),
	:global(textarea),
	:global(a) {
		-webkit-app-region: no-drag;
	}

	.titlebar {
		position: fixed;
		top: 0;
		left: 0;
		right: 0;
		height: 28px;
		-webkit-app-region: drag;
		z-index: 1000;
	}

	.titlebar::after {
		content: "";
		position: absolute;
		bottom: 0;
		left: 0;
		right: 0;
		height: 1px;
		background: linear-gradient(to right, transparent 0px, transparent 80px, #393939 180px);
	}

	.app {
		display: flex;
		height: 100vh;
		padding-top: 28px; /* Space for macOS title bar */
	}

	.sidebar {
		width: 740px;
		flex-shrink: 0;
	}

	.main {
		flex: 1;
		overflow: hidden;
	}

	.empty {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		height: 100%;
		color: #666;
	}

	.empty h2 {
		margin: 0 0 8px 0;
		font-size: 18px;
		color: #888;
	}

	.empty p {
		margin: 0 0 24px 0;
	}

	.empty button {
		padding: 10px 20px;
		background: #3b82f6;
		color: white;
		border: none;
		border-radius: 6px;
		cursor: pointer;
		font-size: 14px;
	}

	.empty button:hover {
		background: #2563eb;
	}
</style>
