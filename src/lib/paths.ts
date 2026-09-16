import type { Category, ProcessConfig } from './types';

/** Join a process cwd with its category directory for display. Mirrors resolveProcessCwd in electron/main.ts. */
export function resolveDisplayCwd(cwd: string, categoryCwd?: string): string {
	const trimmed = cwd.trim();
	if (trimmed.startsWith('/') || trimmed.startsWith('~')) return trimmed;
	const base = categoryCwd?.trim().replace(/\/+$/, '') ?? '';
	if (!base) return trimmed || '~';
	if (!trimmed || trimmed === '.') return base;
	return `${base}/${trimmed.replace(/^\.\//, '')}`;
}

export function resolveProcessDisplayCwd(config: ProcessConfig, categories: Category[]): string {
	const category = config.categoryId ? categories.find((c) => c.id === config.categoryId) : undefined;
	return resolveDisplayCwd(config.cwd, category?.cwd);
}
