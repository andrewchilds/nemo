<script lang="ts">
	import type { Category } from '$lib/types';
	import Modal from './Modal.svelte';
	import Button from './Button.svelte';

	interface Props {
		category: Category | null;
		onSave: (category: Category) => void;
		onCancel: () => void;
	}

	let { category, onSave, onCancel }: Props = $props();

	let name = $state(category?.name || '');

	function generateId(): string {
		return `cat_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
	}

	function handleSubmit() {
		const cat: Category = {
			id: category?.id || generateId(),
			name: name.trim(),
			collapsed: category?.collapsed ?? false
		};
		onSave(cat);
	}
</script>

<Modal title={category ? 'Edit Category' : 'Add Category'} onClose={onCancel}>
	<form class="form" onsubmit={(e) => { e.preventDefault(); handleSubmit(); }}>
		<label>
			<span>Name</span>
			<input type="text" bind:value={name} placeholder="Category name" required />
		</label>
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

	input[type='text'] {
		width: 100%;
		padding: 10px 12px;
		background: #1a1a1a;
		border: 1px solid #333;
		border-radius: 6px;
		color: #fff;
		font-size: 14px;
		box-sizing: border-box;
	}

	input[type='text']:focus {
		outline: none;
		border-color: #3b82f6;
	}
</style>
