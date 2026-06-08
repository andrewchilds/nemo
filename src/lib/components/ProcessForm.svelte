<script lang="ts">
	import type { ProcessConfig, Category } from '$lib/types';
	import Modal from './Modal.svelte';
	import Button from './Button.svelte';

	interface Props {
		process: ProcessConfig | null;
		categories: Category[];
		detectedPort?: number;
		onSave: (config: ProcessConfig) => void;
		onCancel: () => void;
	}

	let { process, categories, detectedPort, onSave, onCancel }: Props = $props();

	let name = $state(process?.name || '');
	let description = $state(process?.description || '');
	let command = $state(process?.command || '');
	let cwd = $state(process?.cwd || '');
	let type: 'server' | 'job' = $state(process?.type || 'server');
	let autoRestart = $state(process?.autoRestart ?? false);
	let port: number | null = $state(process?.port ?? detectedPort ?? null);
	let categoryId: string = $state(process?.categoryId || '');

	function generateId(): string {
		return `proc_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
	}

	function handleSubmit() {
		const config: ProcessConfig = {
			id: process?.id || generateId(),
			name: name.trim(),
			description: description.trim(),
			command: command.trim(),
			cwd: cwd.trim(),
			type,
			autoRestart,
			port: type === 'server' && port ? port : undefined,
			categoryId: categoryId || undefined
		};
		onSave(config);
	}
</script>

<Modal title={process ? 'Edit Process' : 'Add Process'} onClose={onCancel}>
	<form class="form" onsubmit={(e) => { e.preventDefault(); handleSubmit(); }}>
		<label>
			<span>Name</span>
			<input type="text" bind:value={name} placeholder="My Server" required />
		</label>

		<label>
			<span>Description (optional)</span>
			<input type="text" bind:value={description} placeholder="Development server" />
		</label>

		<label>
			<span>Command</span>
			<input type="text" bind:value={command} placeholder="npm run dev" required />
		</label>

		<label>
			<span>Working Directory</span>
			<input type="text" bind:value={cwd} placeholder="/path/to/project" required />
		</label>

		<label>
			<span>Type</span>
			<select bind:value={type}>
				<option value="server">Server (long-running)</option>
				<option value="job">Job (one-time task)</option>
			</select>
		</label>

		{#if categories.length > 0}
			<label>
				<span>Category (optional)</span>
				<select bind:value={categoryId}>
					<option value="">No category</option>
					{#each categories as cat (cat.id)}
						<option value={cat.id}>{cat.name}</option>
					{/each}
				</select>
			</label>
		{/if}

		{#if type === 'server'}
			<label>
				<span>Port (optional)</span>
				<input type="number" bind:value={port} placeholder="Auto-detected" min="1" max="65535" />
			</label>

			<label class="checkbox">
				<input type="checkbox" bind:checked={autoRestart} />
				<span>Auto-restart on crash</span>
			</label>
		{/if}
	</form>

	{#snippet actions()}
		<Button onclick={onCancel}>Cancel</Button>
		<Button variant="primary" onclick={handleSubmit}>Save</Button>
	{/snippet}
</Modal>

<style>
	.form {
		display: flex;
		flex-direction: column;
		gap: 16px;
	}

	label {
		display: block;
	}

	label span {
		display: block;
		margin-bottom: 6px;
		font-size: 13px;
		color: #888;
	}

	input[type='text'],
	input[type='number'],
	select {
		width: 100%;
		padding: 10px 12px;
		background: #1a1a1a;
		border: 1px solid #333;
		border-radius: 6px;
		color: #fff;
		font-size: 14px;
		box-sizing: border-box;
	}

	input[type='text']:focus,
	input[type='number']:focus,
	select:focus {
		outline: none;
		border-color: #3b82f6;
	}

	select {
		cursor: pointer;
	}

	.checkbox {
		display: flex;
		align-items: center;
		gap: 8px;
		cursor: pointer;
	}

	.checkbox input {
		width: 16px;
		height: 16px;
		cursor: pointer;
	}

	.checkbox span {
		margin: 0;
	}
</style>
