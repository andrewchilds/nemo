import { describe, expect, it } from 'vitest';
import { resolveDisplayCwd } from './paths';

describe('resolveDisplayCwd', () => {
	it('keeps absolute and home-relative paths', () => {
		expect(resolveDisplayCwd('/a/b', '/base')).toBe('/a/b');
		expect(resolveDisplayCwd('~/x', '/base')).toBe('~/x');
	});

	it('joins relative paths onto the category directory', () => {
		expect(resolveDisplayCwd('api', '/base')).toBe('/base/api');
		expect(resolveDisplayCwd('./api', '/base/')).toBe('/base/api');
		expect(resolveDisplayCwd('', '/base')).toBe('/base');
		expect(resolveDisplayCwd('.', '/base')).toBe('/base');
	});

	it('falls back to the raw value without a category directory', () => {
		expect(resolveDisplayCwd('api', undefined)).toBe('api');
		expect(resolveDisplayCwd('', '')).toBe('~');
	});
});
