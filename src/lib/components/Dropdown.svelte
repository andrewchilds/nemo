<script lang="ts">
	import { onMount } from 'svelte';

	interface DropdownItem {
		label: string;
		onclick: () => void;
		variant?: 'default' | 'danger';
		separator?: boolean;
	}

	interface Props {
		items: DropdownItem[];
		children: import('svelte').Snippet;
	}

	let { items, children }: Props = $props();

	let open = $state(false);
	let dropdownRef: HTMLDivElement;

	function handleClickOutside(event: MouseEvent) {
		if (dropdownRef && !dropdownRef.contains(event.target as Node)) {
			open = false;
		}
	}

	function handleItemClick(item: DropdownItem) {
		item.onclick();
		open = false;
	}

	onMount(() => {
		document.addEventListener('click', handleClickOutside);
		return () => document.removeEventListener('click', handleClickOutside);
	});
</script>

<div class="dropdown" bind:this={dropdownRef}>
	<button class="trigger" onclick={() => open = !open}>
		{@render children()}
	</button>

	{#if open}
		<div class="menu">
			{#each items as item, index (`${item.label}-${index}`)}
				{#if item.separator}
					<div class="separator"></div>
				{/if}
				<button
					class="menu-item"
					class:danger={item.variant === 'danger'}
					onclick={() => handleItemClick(item)}
				>
					{item.label}
				</button>
			{/each}
		</div>
	{/if}
</div>

<style>
	.dropdown {
		position: relative;
		display: inline-block;
	}

	.trigger {
		display: flex;
		align-items: center;
		justify-content: center;
		background: transparent;
		border: none;
		padding: 4px;
		cursor: pointer;
		border-radius: 4px;
		color: #666;
		transition: all 0.15s ease;
	}

	.trigger:hover {
		background: #333;
		color: #888;
	}

	.menu {
		position: absolute;
		top: 100%;
		right: 0;
		margin-top: 4px;
		background: #2a2a2a;
		border: 1px solid #404040;
		border-radius: 6px;
		padding: 4px;
		min-width: 120px;
		z-index: 100;
		box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
	}

	.menu-item {
		display: block;
		width: 100%;
		padding: 8px 12px;
		background: transparent;
		border: none;
		color: #ccc;
		font-size: 13px;
		text-align: left;
		cursor: pointer;
		border-radius: 4px;
		transition: background 0.15s ease;
	}

	.menu-item:hover {
		background: #363636;
	}

	.menu-item.danger {
		color: #ef4444;
	}

	.menu-item.danger:hover {
		background: #3a2020;
	}

	.separator {
		height: 1px;
		background: #404040;
		margin: 4px 0;
	}
</style>
