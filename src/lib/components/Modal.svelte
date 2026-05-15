<script lang="ts">
	import type { Snippet } from 'svelte';

	interface Props {
		title: string;
		onClose: () => void;
		children: Snippet;
		actions?: Snippet;
		width?: string;
	}

	let { title, onClose, children, actions, width = '480px' }: Props = $props();

	function handleOverlayClick(e: Event) {
		if (e.target === e.currentTarget) {
			onClose();
		}
	}

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape') {
			onClose();
		}
	}
</script>

<div class="overlay" onclick={handleOverlayClick} onkeydown={handleKeydown} role="button" tabindex="0">
	<div class="modal" style="max-width: {width}">
		<div class="header">
			<h2>{title}</h2>
			<button class="close" onclick={onClose}>×</button>
		</div>
		<div class="content">
			{@render children()}
		</div>
		{#if actions}
			<div class="actions">
				{@render actions()}
			</div>
		{/if}
	</div>
</div>

<style>
	.overlay {
		position: fixed;
		inset: 0;
		background: rgba(0, 0, 0, 0.7);
		display: flex;
		align-items: center;
		justify-content: center;
		z-index: 100;
	}

	.modal {
		background: #252525;
		border-radius: 12px;
		width: 100%;
		max-height: 80vh;
		display: flex;
		flex-direction: column;
		border: 1px solid #333;
	}

	.header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: 16px 20px;
		border-bottom: 1px solid #333;
	}

	h2 {
		margin: 0;
		font-size: 16px;
		color: #fff;
	}

	.close {
		background: none;
		border: none;
		color: #888;
		font-size: 24px;
		cursor: pointer;
		padding: 0;
		line-height: 1;
	}

	.close:hover {
		color: #fff;
	}

	.content {
		padding: 20px;
		overflow: auto;
	}

	.actions {
		display: flex;
		justify-content: flex-end;
		gap: 12px;
		padding: 16px 20px;
		border-top: 1px solid #333;
	}
</style>
