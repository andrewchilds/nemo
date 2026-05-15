import { writable, get } from 'svelte/store';
import type { ProcessState, ProcessConfig } from '$lib/types';

export const processes = writable<ProcessState[]>([]);
export const selectedProcessId = writable<string | null>(null);

export async function loadProcesses() {
	if (typeof window !== 'undefined' && window.nemo) {
		const states = await window.nemo.listProcesses();
		processes.set(states);
	}
}

export async function addProcess(config: ProcessConfig) {
	if (typeof window !== 'undefined' && window.nemo) {
		await window.nemo.addProcess(config);
		await loadProcesses();
	}
}

export async function updateProcess(config: ProcessConfig) {
	if (typeof window !== 'undefined' && window.nemo) {
		await window.nemo.updateProcess(config);
		await loadProcesses();
	}
}

export async function deleteProcess(id: string) {
	if (typeof window !== 'undefined' && window.nemo) {
		await window.nemo.deleteProcess(id);
		// Clear selection if we deleted the selected process
		if (get(selectedProcessId) === id) {
			selectedProcessId.set(null);
		}
		await loadProcesses();
	}
}

export async function reorderProcesses(orderedIds: string[]) {
	if (typeof window !== 'undefined' && window.nemo) {
		await window.nemo.reorderProcesses(orderedIds);
		// Update local store order immediately for responsiveness
		processes.update((current) => {
			return orderedIds
				.map((id) => current.find((p) => p.config.id === id))
				.filter((p): p is ProcessState => p !== undefined);
		});
	}
}

export async function startProcess(id: string) {
	if (typeof window !== 'undefined' && window.nemo) {
		const result = await window.nemo.startProcess(id);
		await loadProcesses();
		return result;
	}
	return { success: false };
}

export async function stopProcess(id: string) {
	if (typeof window !== 'undefined' && window.nemo) {
		await window.nemo.stopProcess(id);
		await loadProcesses();
	}
}

export async function restartProcess(id: string) {
	if (typeof window !== 'undefined' && window.nemo) {
		await window.nemo.restartProcess(id);
		await loadProcesses();
	}
}

export function setupProcessListeners() {
	if (typeof window === 'undefined' || !window.nemo) return () => {};

	const unsubOutput = window.nemo.onProcessOutput(() => {
		// Output handled by terminal component
	});

	const unsubExit = window.nemo.onProcessExit(() => {
		loadProcesses();
	});

	const unsubMetrics = window.nemo.onMetricsUpdate((updatedStates) => {
		// Merge metrics updates with existing process list instead of replacing
		processes.update((currentProcesses) => {
			return currentProcesses.map((proc) => {
				const updated = updatedStates.find((u) => u.config.id === proc.config.id);
				if (updated) {
					return updated;
				}
				return proc;
			});
		});
	});

	return () => {
		unsubOutput();
		unsubExit();
		unsubMetrics();
	};
}
