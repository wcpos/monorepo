import { readFileSync } from 'node:fs';

import {
	GALLERY_COMPONENTS,
	parseRegistryEntries,
	parseRegistryKeys,
	REGISTRY_PATH,
} from '../../gallery/inventory';

// Match the source-only app tests: clear Expo's lazy native runtime after setup.
jest.resetModules();

// The shoot collects one Playwright test per id in this list, so a wrong or unstable list
// shoots the wrong pages or reshuffles the shards from one run to the next.
const source = readFileSync(REGISTRY_PATH, 'utf8');

it('lists the components, sorted, unique and kebab-case', () => {
	expect(GALLERY_COMPONENTS.length).toBeGreaterThan(0);
	expect([...GALLERY_COMPONENTS]).toEqual([...GALLERY_COMPONENTS].sort());
	expect(parseRegistryKeys(source)).toEqual([...GALLERY_COMPONENTS]);
	expect(new Set(GALLERY_COMPONENTS).size).toBe(GALLERY_COMPONENTS.length);
	for (const id of GALLERY_COMPONENTS) expect(id).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
});

it('is the keys of the registry entries the registry test reads', () => {
	const keys = parseRegistryEntries(source).map((entry) => {
		const key = entry.includes(':') ? entry.slice(0, entry.indexOf(':')).trim() : entry;
		return key.startsWith("'") ? key.slice(1, -1) : key;
	});
	expect(new Set(GALLERY_COMPONENTS)).toEqual(new Set(keys));
	expect(GALLERY_COMPONENTS).toHaveLength(keys.length);
	// Both spellings of a key: quoted (`'alert-dialog': alertDialog`) and shorthand (`popover`).
	expect(GALLERY_COMPONENTS).toEqual(expect.arrayContaining(['alert-dialog', 'popover', 'switch']));
});

it('reads quoted, bare and renamed keys', () => {
	const fixture = `const registry: Record<string, Story[]> = {\n\t'drawer-item': drawerItem,\n\tpopover,\n\tswitch: switchStories,\n};`;
	expect(parseRegistryEntries(fixture)).toEqual([
		"'drawer-item': drawerItem",
		'popover',
		'switch: switchStories',
	]);
	expect(parseRegistryKeys(fixture)).toEqual(['drawer-item', 'popover', 'switch']);
	expect(() => parseRegistryEntries('const other = {}')).toThrow(/const registry/);
});
