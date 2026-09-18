import { readFileSync } from 'node:fs';

// Match the source-only app tests: clear Expo's lazy native runtime after setup.
jest.resetModules();

it('registers all three feedback primitives before the gallery shoot', () => {
	const source = readFileSync(`${__dirname}/../components/gallery/registry.tsx`, 'utf8');
	const entries = source.match(/const registry[^=]*=\s*\{([^}]+)\}/)?.[1];
	expect(entries).toBeDefined();
	for (const name of ['skeleton', "'empty-state': emptyState", 'notice']) {
		expect(entries?.split(',').map((entry) => entry.trim())).toContain(name);
	}
});
