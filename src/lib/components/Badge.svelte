<script lang="ts">
	import type { Snippet } from 'svelte';

	interface Props {
		variant?: 'default' | 'blue' | 'green' | 'amber' | 'red';
		children: Snippet;
	}

	let { variant = 'default', children }: Props = $props();
</script>

<span class="badge {variant}">
	{@render children()}
</span>

<style>
	.badge {
		display: inline-flex;
		align-items: center;
		font-size: 11px;
		font-weight: 500;
		padding: 2px 6px;
		border-radius: 4px;
	}

	.default {
		background: #333;
		color: #888;
	}

	.blue {
		background: #1e3a5f;
		color: #3b82f6;
	}

	.green {
		background: #14532d;
		color: #22c55e;
	}

	.amber {
		background: #422006;
		color: #f59e0b;
	}

	.red {
		background: #450a0a;
		color: #ef4444;
	}
</style>
