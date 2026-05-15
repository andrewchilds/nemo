<script lang="ts">
	import type { Snippet } from "svelte";

	interface Props {
		variant?: "default" | "danger" | "primary";
		disabled?: boolean;
		onclick?: (e: Event) => void;
		children: Snippet;
	}

	let { variant = "default", disabled = false, onclick, children }: Props = $props();
</script>

<button class="btn {variant}" {disabled} {onclick}>
	{@render children()}
</button>

<style>
	.btn {
		padding: 0 14px;
		height: 24px;
		border: none;
		border-radius: 5px;
		font-size: 11px;
		cursor: pointer;
		box-shadow: inset 0 -2px 0 rgba(0, 0, 0, 0.3);
		transition: background 0.15s ease;
		display: flex;
		font-weight: 500;
		align-items: center;
	}

	.btn:active {
		transform: translateY(2px);
		height: 22px;
		box-shadow: none;
	}

	.btn:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.btn.default {
		background: #444;
		color: white;
	}

	.btn.default:hover:not(:disabled) {
		background: #555;
	}

	.btn.danger {
		background: #ef4444;
		color: white;
	}

	.btn.danger:hover:not(:disabled) {
		background: #dc2626;
	}

	.btn.primary {
		background: #3b82f6;
		color: white;
	}

	.btn.primary:hover:not(:disabled) {
		background: #2563eb;
	}
</style>
