<script lang="ts">
	import Modal from './Modal.svelte';
	import Button from './Button.svelte';

	interface Props {
		title: string;
		message: string;
		confirmText?: string;
		cancelText?: string;
		variant?: 'danger' | 'default';
		onConfirm: () => void;
		onCancel: () => void;
	}

	let {
		title,
		message,
		confirmText = 'Confirm',
		cancelText = 'Cancel',
		variant = 'default',
		onConfirm,
		onCancel
	}: Props = $props();
</script>

<Modal {title} onClose={onCancel}>
	<p class="message">{message}</p>

	{#snippet actions()}
		<Button onclick={onCancel}>{cancelText}</Button>
		<Button variant={variant === 'danger' ? 'danger' : 'primary'} onclick={onConfirm}>{confirmText}</Button>
	{/snippet}
</Modal>

<style>
	.message {
		margin: 0;
		color: #ccc;
		font-size: 14px;
		line-height: 1.5;
	}
</style>
