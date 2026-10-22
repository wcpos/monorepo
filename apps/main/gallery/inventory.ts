import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// The gallery's component list, known before a browser starts, so Playwright can collect one
// test per component and split them across workers and shards. `registry.tsx` stays the source
// of truth; this reads its `const registry = {…}` object as text, because the registry module
// imports React Native and cannot load in the Playwright runner.

/** The registry file the inventory is read from. */
export const REGISTRY_PATH = join(__dirname, '..', 'components', 'gallery', 'registry.tsx');

/** The entries of `const registry = {…}` as written: `'drawer-item': drawerItem`, `popover`, `switch: switchStories`. */
export function parseRegistryEntries(source: string): string[] {
	const body = source.match(/const registry[^=]*=\s*\{([^}]+)\}/)?.[1];
	if (body === undefined)
		throw new Error('No `const registry = {…}` object in the gallery registry.');
	return body
		.split(',')
		.map((entry) => entry.trim())
		.filter(Boolean);
}

/** The component ids (the registry's keys, unquoted), sorted so the collected order is stable. */
export function parseRegistryKeys(source: string): string[] {
	return parseRegistryEntries(source)
		.map((entry) =>
			entry
				.split(':')[0]
				.trim()
				.replace(/^(['"])(.*)\1$/, '$2')
		)
		.sort();
}

export const GALLERY_COMPONENTS: readonly string[] = Object.freeze(
	parseRegistryKeys(readFileSync(REGISTRY_PATH, 'utf8'))
);
